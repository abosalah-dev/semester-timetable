"""PDF ingestion.

``parse_pdf`` sniffs which of the known report layouts a file uses and hands it
to the matching parser. ``merge_semesters`` combines several files - typically
the main schedule plus the optional English one - into a single semester.
"""

from __future__ import annotations

from ..models import Semester
from . import course_schedule, english_schedule
from .grid import read_rows

PARSERS = [course_schedule, english_schedule]


class UnknownScheduleFormat(ValueError):
    """The file cannot be turned into a semester - damaged, or not a schedule."""


def parse_pdf(path) -> Semester:
    try:
        rows = read_rows(path)
    except Exception as error:  # pdfplumber raises its own exception types
        raise UnknownScheduleFormat(f"this PDF could not be read ({error})") from error

    if not rows:
        raise UnknownScheduleFormat("the PDF contains no extractable text")

    for parser in PARSERS:
        if parser.matches(rows):
            courses, warnings, title = parser.parse(rows)
            return Semester(title=title, courses=courses, warnings=warnings)

    raise UnknownScheduleFormat(
        "this PDF does not look like a class-schedule report"
    )


def merge_semesters(semesters: list[Semester]) -> Semester:
    """Combine several parsed files, keeping the first title that appears.

    Course codes are unique across the two report types, so a plain
    concatenation is correct; a repeated code would mean the same file was
    uploaded twice and is skipped rather than duplicated.
    """
    merged = Semester()
    seen: set[str] = set()
    for semester in semesters:
        merged.title = merged.title or semester.title
        merged.warnings.extend(semester.warnings)
        for course in semester.courses:
            if course.code not in seen:
                seen.add(course.code)
                merged.courses.append(course)
    merged.courses.sort(key=lambda c: c.code)
    return merged
