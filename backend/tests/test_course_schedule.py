"""Golden tests for the main course-schedule PDF.

Every assertion here was verified by hand against the real file and, where
possible, against the reference timetable image the student supplied. If a
future semester's file breaks one of these, the parser needs updating - the
tests exist so that failure is loud instead of silent.
"""

import pytest

from app.parsing import parse_pdf


@pytest.fixture(scope="module")
def result(course_schedule_path):
    return parse_pdf(course_schedule_path)


def test_every_row_is_classified(result):
    """Nothing may be dropped. A future format drift must fail here."""
    assert result.warnings == []


def test_course_count(result):
    assert len(result.courses) == 68


def test_course_codes_and_names(result):
    by_code = {c.code: c for c in result.courses}
    assert by_code["CS334"].name == "Compiler Design"
    assert by_code["CS363"].name == "Machine Learning"
    assert by_code["CS313x"].name == "Information Retrieval"
    # Internal runs of whitespace in the PDF must be collapsed.
    assert by_code["CS105"].name == "Principle of Information Systems"
    assert by_code["CS213"].name == "Algorithms and Data Structures"


def test_component_types_present(result):
    types = {comp.type for course in result.courses for comp in course.components}
    assert types == {"Lecture", "Lab", "Tutorial", "Workshop", "Project"}


def test_workshop_wrap_is_repaired(result):
    """`Work_Shop` is split across lines as `Work_Sho` + `p` in the PDF."""
    raw = {comp.type for course in result.courses for comp in course.components}
    assert "Work_Sho" not in raw
    cs101x = next(c for c in result.courses if c.code == "CS101x")
    workshop = next(c for c in cs101x.components if c.type == "Workshop")
    assert len(workshop.groups) == 11


def test_reference_image_compiler_design_lab(result):
    """Reference image: Compiler Design Lab (B3), Thursday 2:00 PM, Room D103."""
    group = find_group(result, "CS334", "Lab", "B3")
    assert len(group.sessions) == 1
    session = group.sessions[0]
    assert session.day == "THURSDAY"
    assert session.start == "14:00"
    assert session.end == "15:30"
    assert session.room == "D103"


def test_reference_image_machine_learning_lecture(result):
    """Reference image: ML Lecture (E) on Monday 9:30 N312 and Wednesday 12:30 N412."""
    group = find_group(result, "CS363", "Lecture", "E")
    placed = sorted((s.day, s.start, s.room) for s in group.sessions)
    assert placed == [
        ("MONDAY", "09:30", "N312"),
        ("WEDNESDAY", "12:30", "N412"),
    ]


def test_reference_image_machine_learning_lab(result):
    """Reference image: ML Lab (B2), Monday 12:30 PM, Room D103."""
    group = find_group(result, "CS363", "Lab", "B2")
    assert [(s.day, s.start, s.room) for s in group.sessions] == [
        ("MONDAY", "12:30", "D103")
    ]


def test_no_room_becomes_null(result):
    """Reference image renders these as "Room: No Room"."""
    group = find_group(result, "CS334", "Lecture", "B")
    assert [(s.day, s.start, s.room) for s in group.sessions] == [
        ("MONDAY", "18:30", None),
        ("MONDAY", "20:00", None),
    ]


def test_co_taught_sessions_are_merged_not_duplicated(result):
    """`CS381 Lecture A` Monday 08:00 is printed on two rows, one per lecturer.

    Staff are not named here on purpose: this repository is public and the
    schedule is not. The shape is what matters - one session, two different
    people - and that is exactly what the duplicate rows would break.
    """
    group = find_group(result, "CS381", "Lecture", "A")
    monday_8 = [s for s in group.sessions if s.day == "MONDAY" and s.start == "08:00"]

    assert len(monday_8) == 1, "co-taught rows must merge into one session"
    assert len(monday_8[0].instructors) == 2
    assert len(set(monday_8[0].instructors)) == 2, "two different people"
    assert len(group.sessions) == 2, "the group has two sessions, not four"


def test_wrapped_instructor_name_is_joined(result):
    """One lecturer's name is too long for its column and runs onto a second
    line. `CS101x Lab C1` is taught by them, so its name must arrive whole."""
    group = find_group(result, "CS101x", "Lab", "C1")
    [name] = group.sessions[0].instructors
    assert len(name.split()) == 6, "the continuation line was dropped"


def test_no_instructor_name_is_a_truncated_copy_of_another(result):
    """The general form of the test above.

    If a wrapped name loses its continuation on one row but keeps it on
    another, the file ends up with both the short and the long version, and
    the short one is a prefix of the long one. No name may be.
    """
    names = {
        name
        for course in result.courses
        for comp in course.components
        for group in comp.groups
        for session in group.sessions
        for name in session.instructors
    }
    truncated = [
        (short, full)
        for short in names
        for full in names
        if short != full and full.startswith(f"{short} ")
    ]
    assert truncated == []


def test_missing_instructor_is_empty_not_dropped(result):
    group = find_group(result, "CS313x", "Lecture", "A")
    assert len(group.sessions) == 2
    assert all(s.instructors == [] for s in group.sessions)


def test_capacity_fields_are_kept(result):
    group = find_group(result, "CS363", "Lab", "B2")
    assert group.max_load == 25
    assert group.enrolled == 24


def test_default_duration_is_ninety_minutes(result):
    """The main PDF gives no end time; every session is one 90-minute slot."""
    for course in result.courses:
        for comp in course.components:
            for group in comp.groups:
                for s in group.sessions:
                    assert minutes(s.end) - minutes(s.start) == 90


def test_days_are_saturday_through_thursday(result):
    days = {
        s.day
        for c in result.courses
        for comp in c.components
        for g in comp.groups
        for s in g.sessions
    }
    assert days == {
        "SATURDAY",
        "SUNDAY",
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
    }


def test_project_only_course(result):
    course = next(c for c in result.courses if c.code == "CS405x")
    assert [comp.type for comp in course.components] == ["Project"]
    session = course.components[0].groups[0].sessions[0]
    assert (session.day, session.start, session.room) == ("TUESDAY", "18:30", None)


def test_group_counts_match_the_source(result):
    """Spot-check the shape of a few courses against the raw PDF."""
    expected = {
        ("CS363", "Lecture"): 6,
        ("CS363", "Lab"): 15,
        ("CS334", "Lecture"): 3,
        ("CS334", "Lab"): 6,
        ("CS313x", "Lecture"): 6,
        ("CS313x", "Lab"): 14,
        ("MGT200x", "Tutorial"): 7,
    }
    for (code, type_), count in expected.items():
        course = next(c for c in result.courses if c.code == code)
        comp = next(c for c in course.components if c.type == type_)
        assert len(comp.groups) == count, f"{code} {type_}"


# --- helpers ---------------------------------------------------------------


def find_group(result, code, type_, group_name):
    course = next(c for c in result.courses if c.code == code)
    comp = next(c for c in course.components if c.type == type_)
    return next(g for g in comp.groups if g.name == group_name)


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)
