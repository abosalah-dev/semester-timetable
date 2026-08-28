"""Parser for the main class-schedule PDF.

Layout: courses are introduced by a ``Course: <code> <name>`` line, followed by
a repeated column header and one line per session::

    Course:   CS334                Compiler Design
    Type      Group  Max  Actual  Day       Time   Room    Room      Instractor   Status
                     Load     #                            Capacity
    Lab       B3     25   25      THURSDAY  14:00  D103 O  25        Omar Ali...  ORIGINAL

Three things in the real file need care and are handled here:

* ``Work_Shop`` is printed as ``Work_Sho`` with a continuation line holding
  ``p`` - and at a page break the ``p`` is dropped altogether, so the type is
  resolved by prefix rather than by reassembling the halves.
* Long instructor names, and long course names, wrap onto a continuation line.
* A session taught by two instructors is printed as two otherwise identical
  rows; they are merged downstream in :mod:`.normalize`.
"""

from __future__ import annotations

import re

from ..models import DEFAULT_SESSION_MINUTES, Warning_, to_hhmm, to_minutes
from .grid import Row, collapse_spaces, columns_from_header
from .normalize import RawSession, build_courses

HEADER_WORDS = ["Type", "Group", "Max", "Actual", "Day", "Time", "Room", "Room", "Instractor", "Status"]
COLUMN_NAMES = ["type", "group", "max_load", "enrolled", "day", "time", "room", "room_capacity", "instructor", "status"]

DAYS = {"SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"}
TIME = re.compile(r"^\d{1,2}:\d{2}$")

#: Printed token -> component type. Matching is by prefix so that the
#: line-wrapped ``Work_Sho`` resolves even when its trailing ``p`` is lost at a
#: page break.
TYPE_PREFIXES = {
    "Lecture": "Lecture",
    "Lab": "Lab",
    "Tutorial": "Tutorial",
    "Work_Sho": "Workshop",
    "Project": "Project",
}

#: Page furniture that repeats on all 28 pages and carries no session data.
FURNITURE = re.compile(
    r"^(Class Schedule|Campus|Page \d+|For Semester No\..*|Semester:.*|Faculty ID:.*"
    r"|Load\b.*|[A-Z][a-z]+ \d{1,2}, \d{4}.*)$"
)


def matches(rows: list[Row]) -> bool:
    return any(row.words and row.words[0].text == "Course:" for row in rows[:60])


def parse(rows: list[Row]):
    columns = None
    course_code = course_name = None
    raw: list[RawSession] = []
    warnings: list[Warning_] = []
    previous: RawSession | None = None
    title = None
    name_wrap_x: float | None = None

    for row in rows:
        text = collapse_spaces(row.text)

        if row.words[0].text == "Course:":
            course_code, course_name = _read_course_line(row)
            name_wrap_x = row.words[2].x0 if len(row.words) > 2 else None
            previous = None
            continue

        if name_wrap_x is not None:
            # A course title too wide for its column continues on the next
            # line, indented to the title column: "Selected Topics in CS
            # (Natural Language" / "Processing)".
            if not _is_header(row) and all(w.x0 >= name_wrap_x - 2 for w in row.words):
                course_name = collapse_spaces(f"{course_name} {text}")
                name_wrap_x = None
                continue
            name_wrap_x = None

        if _is_header(row):
            columns = columns_from_header(row, COLUMN_NAMES)
            previous = None
            continue

        if text.startswith("For Semester No."):
            title = collapse_spaces(text.removeprefix("For Semester No.").strip())
            continue

        if FURNITURE.match(text):
            continue

        if columns is None or course_code is None:
            warnings.append(Warning_(page=row.page, text=text, reason="no course context"))
            continue

        cells = row.cells(columns)

        if cells["day"] in DAYS and TIME.match(cells["time"]):
            previous = _read_session_row(row, cells, course_code, course_name)
            raw.append(previous)
            continue

        if previous is not None and _apply_continuation(previous, cells):
            continue

        warnings.append(Warning_(page=row.page, text=text, reason="unrecognised row"))

    courses = build_courses(raw, _resolve_type, warnings)
    return courses, warnings, title


def _read_course_line(row: Row) -> tuple[str, str]:
    """``Course:  CS105  Principle of    Information Systems``."""
    code = row.words[1].text
    name = collapse_spaces(" ".join(w.text for w in row.words[2:]))
    return code, name


def _is_header(row: Row) -> bool:
    return [w.text for w in row.words] == HEADER_WORDS


def _read_session_row(row: Row, cells: dict[str, str], code: str, name: str) -> RawSession:
    start = cells["time"]
    return RawSession(
        page=row.page,
        course_code=code,
        course_name=name,
        raw_type=cells["type"],
        group=cells["group"],
        day=cells["day"],
        start=start,
        end=to_hhmm(to_minutes(start) + DEFAULT_SESSION_MINUTES),
        room=cells["room"],
        instructor=cells["instructor"],
        max_load=_int_or_none(cells["max_load"]),
        enrolled=_int_or_none(cells["enrolled"]),
    )


def _apply_continuation(previous: RawSession, cells: dict[str, str]) -> bool:
    """Fold a wrapped line back into the row above it.

    A wrapped instructor name is a broken phrase and is rejoined with a space.
    The tail of a wrapped component type is discarded rather than reattached,
    because the type is already resolved from its prefix - reattaching would
    also have to cope with the tail going missing at a page break.
    """
    applied = False
    if cells["instructor"]:
        previous.instructor = f"{previous.instructor} {cells['instructor']}".strip()
        applied = True
    if cells["type"] and cells["type"].islower():
        applied = True
    return applied


def _int_or_none(value: str) -> int | None:
    return int(value) if value.isdigit() else None


def _resolve_type(raw_type: str) -> str | None:
    for prefix, component_type in TYPE_PREFIXES.items():
        if raw_type.startswith(prefix):
            return component_type
    return None
