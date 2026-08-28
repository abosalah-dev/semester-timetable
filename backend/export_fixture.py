"""Regenerate the solver's test fixture from the sample PDFs.

The frontend tests run the solver against a real semester, because timings and
group structures that real timetables produce are what the search has to cope
with. Lecturer names are *not* needed for any of that, and they belong to real
people, so they are replaced with stable pseudonyms before the fixture is
written. Everything else - courses, groups, days, times, rooms - is untouched.

Run this after changing the parser, or when a new semester's files land in
`sample-data/`:

    cd backend && python export_fixture.py
"""

from pathlib import Path

from app.models import Semester
from app.parsing import merge_semesters, parse_pdf

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "sample-data"
FIXTURE = ROOT / "frontend" / "src" / "solver" / "__fixtures__" / "semester.json"


def anonymise(semester: Semester) -> int:
    """Replace every lecturer with a stable pseudonym. Returns how many."""
    aliases: dict[str, str] = {}

    for course in semester.courses:
        for component in course.components:
            for group in component.groups:
                for session in group.sessions:
                    session.instructors = [
                        aliases.setdefault(name, f"Lecturer {len(aliases) + 1:02d}")
                        for name in session.instructors
                    ]
    return len(aliases)


def main() -> None:
    files = sorted(SAMPLES.glob("*.pdf"))
    if not files:
        raise SystemExit(
            f"No PDFs in {SAMPLES.relative_to(ROOT)}. "
            "Put this semester's schedule there and run again."
        )

    semester = merge_semesters([parse_pdf(path) for path in files])
    replaced = anonymise(semester)

    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(semester.model_dump_json(), encoding="utf-8")
    print(
        f"{FIXTURE.relative_to(ROOT)}: {len(semester.courses)} courses, "
        f"{len(semester.warnings)} warnings, {replaced} lecturers anonymised"
    )


if __name__ == "__main__":
    main()
