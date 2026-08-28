"""Parser for the optional English-schedule PDF.

Layout is a single flat table repeated across pages::

    COURSEID  CNAME                 Group  Type     MAX_LOAD  NOOFSTUDENTS  DAY_NAME  S_TIME  E_TIME  ROOMID  CF_EMP
    ENG80     Intensive English 80  C      Lecture  10        2             SATURDAY  08:00   09:00   G203 B  Shorouq...

The catch: ``CNAME`` is narrower than some names, so ``English for academic
purposes`` runs straight through the ``Group`` column and the group letter is
printed *inside* the name. Word-level extraction yields the single blob
``purposGes``. We recover both values from character positions: the ``Group``
column's x-range still contains ``sGes``, whose only capital is the group.
"""

from __future__ import annotations

import re

from ..models import Warning_
from .grid import Row, collapse_spaces, columns_from_header
from .normalize import RawSession, build_courses

HEADER_WORDS = ["COURSEID", "CNAME", "Group", "Type", "MAX_LOAD", "NOOFSTUDENTS", "DAY_NAME", "S_TIME", "E_TIME", "ROOMID", "CF_EMP"]
COLUMN_NAMES = ["code", "name", "group", "type", "max_load", "enrolled", "day", "start", "end", "room", "instructor"]

DAYS = {"SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"}
TIME = re.compile(r"^\d{1,2}:\d{2}$")
GROUP_TOKEN = re.compile(r"[A-Z][0-9]?")

TYPES = {"Lecture", "Lab", "Tutorial", "Work_Shop", "Project"}


def matches(rows: list[Row]) -> bool:
    return any(_is_header(row) for row in rows[:5])


def parse(rows: list[Row]):
    columns = None
    raw: list[RawSession] = []
    warnings: list[Warning_] = []

    for row in rows:
        if _is_header(row):
            columns = columns_from_header(row, COLUMN_NAMES)
            continue

        text = collapse_spaces(row.text)
        if columns is None:
            warnings.append(Warning_(page=row.page, text=text, reason="no header seen yet"))
            continue

        cells = row.cells(columns)
        group, name = _split_group_from_name(row, columns)

        if not (cells["day"] in DAYS and TIME.match(cells["start"])):
            warnings.append(Warning_(page=row.page, text=text, reason="unrecognised row"))
            continue

        raw.append(
            RawSession(
                page=row.page,
                course_code=cells["code"],
                course_name=name,
                raw_type=cells["type"],
                group=group,
                day=cells["day"],
                start=cells["start"],
                end=cells["end"],
                room=cells["room"],
                instructor=cells["instructor"],
                max_load=_int_or_none(cells["max_load"]),
                enrolled=_int_or_none(cells["enrolled"]),
            )
        )

    return build_courses(raw, _resolve_type, warnings), warnings, None


def _split_group_from_name(row: Row, columns) -> tuple[str, str]:
    """Recover the group code and the full course name from raw positions.

    Word splitting is no help here: a name that overflows is glued to the
    group letter as one token (``purposGes``). Characters, though, keep their
    true x positions, so the two values can be separated by where they sit.

    The name is everything left of the group column plus whatever of the group
    column is *not* the group code - which restores the tail the overflow cut
    off (``purpo`` + ``s`` + ``es`` -> ``purposes``). For a name that fits,
    the group column holds only the code and this reduces to the obvious
    reading.
    """
    name_column = next(c for c in columns if c.name == "name")
    group_column = next(c for c in columns if c.name == "group")

    head = row.slice_chars(name_column.x0, group_column.x0)
    group_slice = row.slice_chars(group_column.x0, group_column.x1)

    match = GROUP_TOKEN.search(group_slice)
    if not match:
        return "", collapse_spaces(head + group_slice)

    tail = group_slice[: match.start()] + group_slice[match.end() :]
    return match.group(), collapse_spaces(head + tail)


def _is_header(row: Row) -> bool:
    return [w.text for w in row.words] == HEADER_WORDS


def _resolve_type(raw_type: str) -> str | None:
    if raw_type not in TYPES:
        return None
    return "Workshop" if raw_type == "Work_Shop" else raw_type


def _int_or_none(value: str) -> int | None:
    return int(value) if value.isdigit() else None
