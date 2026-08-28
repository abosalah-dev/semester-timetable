"""Shared fixtures.

The golden tests read this semester's real PDFs. Those files are not in the
repository - they are the university's, and they name real staff - so anyone
who clones the project gets a clear skip rather than a wall of failures. Drop
the schedule PDFs into `sample-data/` and the whole suite runs.
"""

from pathlib import Path

import pytest

SAMPLE_DATA = Path(__file__).resolve().parents[2] / "sample-data"

MISSING = (
    "needs the semester PDFs in sample-data/ "
    "(see the README: they are not distributed with the project)"
)


def _sample(name: str) -> Path:
    path = SAMPLE_DATA / name
    if not path.exists():
        pytest.skip(MISSING, allow_module_level=False)
    return path


@pytest.fixture(scope="session")
def course_schedule_path() -> Path:
    return _sample("course-schedule.pdf")


@pytest.fixture(scope="session")
def english_schedule_path() -> Path:
    return _sample("english-schedule.pdf")
