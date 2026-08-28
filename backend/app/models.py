"""The shared vocabulary of the system.

A *course* is split into *components* (Lecture, Lab, Tutorial, Workshop,
Project). Each component is offered as several *groups*, and a group is a
bundle of *sessions*: choosing the group commits the student to all of them.
Groups of different components are chosen independently - a student may take
Lecture E together with Lab B2 of the same course.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ComponentType = Literal["Lecture", "Lab", "Tutorial", "Workshop", "Project"]

Day = Literal[
    "SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"
]

#: Order used everywhere a week is laid out. The university week starts on
#: Saturday and has no Friday classes, but Friday is kept last so an unusual
#: semester does not break the renderer.
WEEK = ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]

#: The main schedule PDF gives a start time but no end time. Every one of its
#: slots is one 90-minute period (08:00, 09:30, 11:00, ... 20:00).
DEFAULT_SESSION_MINUTES = 90


class Session(BaseModel):
    day: Day
    start: str  # "HH:MM"
    end: str  # "HH:MM"
    room: str | None = None
    instructors: list[str] = Field(default_factory=list)


class Group(BaseModel):
    name: str
    sessions: list[Session] = Field(default_factory=list)
    max_load: int | None = None
    enrolled: int | None = None


class Component(BaseModel):
    type: ComponentType
    groups: list[Group] = Field(default_factory=list)


class Course(BaseModel):
    code: str
    name: str
    components: list[Component] = Field(default_factory=list)


class Warning_(BaseModel):
    """A line the parser could not classify.

    Every unreadable line becomes one of these instead of being discarded, so
    a change in next semester's file format surfaces in the UI rather than
    silently removing sessions from the student's options.
    """

    page: int
    text: str
    reason: str


class Semester(BaseModel):
    title: str | None = None
    courses: list[Course] = Field(default_factory=list)
    warnings: list[Warning_] = Field(default_factory=list)


def to_minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def to_hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
