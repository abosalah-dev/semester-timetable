"""Regenerate the anonymised semester used by the tests and the demo.

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
#: The same anonymised semester, served to anyone who wants to try the site
#: without a schedule of their own.
DEMO = ROOT / "frontend" / "public" / "sample-semester.json"


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

    payload = semester.model_dump_json()
    for target in (FIXTURE, DEMO):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload, encoding="utf-8")

    print(
        f"{len(semester.courses)} courses, {len(semester.warnings)} warnings, "
        f"{replaced} lecturers anonymised"
    )
    for target in (FIXTURE, DEMO):
        print(f"  wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
