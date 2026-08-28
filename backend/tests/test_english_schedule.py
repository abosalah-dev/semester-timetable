"""Golden tests for the optional English-schedule PDF.

This file has a different layout from the main schedule and one nasty quirk:
long course names physically overflow into the `Group` column, so the group
letter ends up embedded inside the name text (`English for academic purposGes`).
These tests pin down that the parser untangles it.
"""

import pytest

from app.parsing import parse_pdf


@pytest.fixture(scope="module")
def result(english_schedule_path):
    return parse_pdf(english_schedule_path)


def test_every_row_is_classified(result):
    assert result.warnings == []


def test_courses_found(result):
    assert sorted(c.code for c in result.courses) == [
        "ENG80",
        "ENG90",
        "ENG_101",
        "ENG_102",
        "ENG_201",
    ]


def test_group_letter_is_extracted_from_the_overflowing_name(result):
    """The whole point of character-level slicing: `sGes` -> group `G`."""
    course = next(c for c in result.courses if c.code == "ENG_101")
    comp = next(c for c in course.components if c.type == "Lecture")
    assert sorted(g.name for g in comp.groups) == ["G", "H", "I", "J", "K"]


def test_overflowing_name_is_reassembled_without_the_group_letter(result):
    by_code = {c.code: c for c in result.courses}
    assert by_code["ENG_101"].name == "English for academic purposes"
    assert by_code["ENG_201"].name == "English For Research Purposes"
    # Names that do not overflow must be untouched.
    assert by_code["ENG80"].name == "Intensive English 80"
    assert by_code["ENG_102"].name == "English For Study Skills"


def test_group_with_a_digit_suffix(result):
    course = next(c for c in result.courses if c.code == "ENG_102")
    comp = course.components[0]
    assert "V2" in {g.name for g in comp.groups}
    assert "V" in {g.name for g in comp.groups}


def test_explicit_end_times_are_used_not_the_ninety_minute_default(result):
    """ENG80 runs in 60-minute blocks; the 90-minute default must not apply."""
    course = next(c for c in result.courses if c.code == "ENG80")
    group = next(g for g in course.components[0].groups if g.name == "C")
    saturday = sorted((s.start, s.end) for s in group.sessions if s.day == "SATURDAY")
    assert saturday == [("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00")]


def test_consecutive_periods_stay_separate(result):
    """The university timetable shows a double period as two blocks."""
    course = next(c for c in result.courses if c.code == "ENG80")
    group = next(g for g in course.components[0].groups if g.name == "C")
    days = sorted({s.day for s in group.sessions})
    assert days == ["SATURDAY", "SUNDAY", "THURSDAY", "WEDNESDAY"]
    assert len(group.sessions) == 12
    assert {s.room for s in group.sessions} == {"G203", "N313", "N413"}


def test_ninety_minute_sessions_are_preserved(result):
    course = next(c for c in result.courses if c.code == "ENG_101")
    group = next(g for g in course.components[0].groups if g.name == "G")
    placed = sorted((s.day, s.start, s.end, s.room) for s in group.sessions)
    assert placed == [
        ("MONDAY", "14:00", "15:30", "K203"),
        ("THURSDAY", "14:00", "15:30", "K204"),
        ("TUESDAY", "15:30", "17:00", "K206"),
    ]


def test_building_suffix_is_dropped_from_the_room_code(result):
    """`G203 B` is the room G203; no room number carries two suffixes."""
    rooms = {
        s.room
        for c in result.courses
        for comp in c.components
        for g in comp.groups
        for s in g.sessions
    }
    assert all(" " not in room for room in rooms)


def test_instructors_are_read(result):
    """Every group here names exactly one lecturer, and the same one
    throughout. The names themselves stay out of this public repository."""
    course = next(c for c in result.courses if c.code == "ENG_102")
    group = next(g for g in course.components[0].groups if g.name == "T")

    named = {tuple(s.instructors) for s in group.sessions}
    assert len(named) == 1, "one lecturer teaches the whole group"
    assert len(next(iter(named))) == 1
    assert next(iter(named))[0].strip() != ""


def test_all_english_components_are_lectures(result):
    types = {comp.type for c in result.courses for comp in c.components}
    assert types == {"Lecture"}
