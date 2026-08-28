"""Turn flat parsed rows into the course/component/group/session tree.

One clean-up happens here, driven by what the real files do: the report prints
one row *per instructor*, so a lecture with two staff appears twice with an
identical day, time and room. Left alone that paints duplicate blocks on the
timetable, so identical rows collapse into one session carrying both names.

Back-to-back periods of the same group are deliberately *not* merged. The
university's own timetable shows a double lecture as two adjacent blocks
(18:30-20:00 and 20:00-21:30), and keeping them separate also keeps the data
faithful to the source.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from ..models import Component, Course, Group, Session, Warning_, WEEK, to_minutes


@dataclass
class RawSession:
    page: int
    course_code: str
    course_name: str
    raw_type: str
    group: str
    day: str
    start: str
    end: str
    room: str
    instructor: str
    max_load: int | None = None
    enrolled: int | None = None
    extra_instructors: list[str] = field(default_factory=list)


def build_courses(
    raw: list[RawSession],
    resolve_type: Callable[[str], str | None],
    warnings: list[Warning_],
) -> list[Course]:
    """``resolve_type`` maps a printed type token to a component type, or to
    ``None`` if the token is not recognised - each format supplies its own
    because the two reports spell the types differently."""
    courses: dict[str, Course] = {}
    # (course, type, group) -> Group ; (…, day, start, room) -> Session
    groups: dict[tuple[str, str, str], Group] = {}
    sessions: dict[tuple[str, str, str, str, str, str | None], Session] = {}

    for row in raw:
        component_type = resolve_type(row.raw_type)
        if component_type is None:
            warnings.append(
                Warning_(
                    page=row.page,
                    text=f"{row.course_code} {row.raw_type} {row.group}",
                    reason=f"unknown component type {row.raw_type!r}",
                )
            )
            continue
        if not row.group:
            warnings.append(
                Warning_(
                    page=row.page,
                    text=f"{row.course_code} {row.raw_type} {row.day} {row.start}",
                    reason="missing group",
                )
            )
            continue

        course = courses.get(row.course_code)
        if course is None:
            course = Course(code=row.course_code, name=row.course_name)
            courses[row.course_code] = course
        elif not course.name and row.course_name:
            course.name = row.course_name

        component = next(
            (c for c in course.components if c.type == component_type), None
        )
        if component is None:
            component = Component(type=component_type)
            course.components.append(component)

        group_key = (row.course_code, component_type, row.group)
        group = groups.get(group_key)
        if group is None:
            group = Group(
                name=row.group, max_load=row.max_load, enrolled=row.enrolled
            )
            groups[group_key] = group
            component.groups.append(group)

        room = normalize_room(row.room)
        session_key = (*group_key, row.day, row.start, room)
        session = sessions.get(session_key)
        if session is None:
            session = Session(
                day=row.day, start=row.start, end=row.end, room=room, instructors=[]
            )
            sessions[session_key] = session
            group.sessions.append(session)

        for name in [row.instructor, *row.extra_instructors]:
            name = name.strip()
            if name and name not in session.instructors:
                session.instructors.append(name)

    for group in groups.values():
        group.sessions.sort(key=lambda s: (WEEK.index(s.day), to_minutes(s.start)))

    for course in courses.values():
        course.components.sort(key=_component_order)
        for component in course.components:
            component.groups.sort(key=_group_order)

    return list(courses.values())


def normalize_room(room: str) -> str | None:
    """``"K308 O"`` -> ``"K308"``; ``"NoRoom"`` -> ``None``.

    The trailing letter is a building marker that never varies for a given
    room number in either file, so it carries no information the student needs
    and is dropped in favour of the code printed on the door.
    """
    room = room.strip()
    if not room or room.replace(" ", "").lower() == "noroom":
        return None
    return room.split()[0]


def _component_order(component: Component) -> int:
    order = ["Lecture", "Tutorial", "Lab", "Workshop", "Project"]
    return order.index(component.type)


def _group_order(group: Group) -> tuple[str, int, str]:
    """``A`` before ``A2`` before ``B1``, and ``B10`` after ``B2``."""
    letters = "".join(c for c in group.name if not c.isdigit())
    digits = "".join(c for c in group.name if c.isdigit())
    return (letters, int(digits) if digits else 0, group.name)
