/**
 * A timetable as a calendar file.
 *
 * Each class becomes a weekly recurring event. The semester's start date is
 * not in the schedule PDF, so the student supplies it; the first occurrence
 * of each event is placed on the first matching weekday on or after it.
 */

import type { Day } from "../types";
import type { RenderedSchedule } from "../solver/engine";
import { toMinutes } from "../solver/grid";

/** ICS weekday codes, in the same order as `WEEK`. */
const ICS_DAYS: Record<Day, string> = {
  SATURDAY: "SA",
  SUNDAY: "SU",
  MONDAY: "MO",
  TUESDAY: "TU",
  WEDNESDAY: "WE",
  THURSDAY: "TH",
  FRIDAY: "FR",
};

/** JavaScript's `getDay()` numbering for each day name. */
const JS_DAYS: Record<Day, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export function toIcs(
  schedule: RenderedSchedule,
  semesterStart: Date,
  weeks = 14,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Semester Schedule Creator//EN",
    "CALSCALE:GREGORIAN",
  ];

  let serial = 0;
  for (const course of schedule.courses) {
    for (const { type, group, session } of course.placements) {
      const start = firstOccurrence(semesterStart, session.day);
      const startAt = withTime(start, session.start);
      const endAt = withTime(start, session.end);
      const until = new Date(startAt);
      until.setDate(until.getDate() + weeks * 7);

      serial += 1;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${schedule.index}-${serial}@semester-schedule`,
        `DTSTART:${stamp(startAt)}`,
        `DTEND:${stamp(endAt)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[session.day]};UNTIL=${stamp(until)}`,
        `SUMMARY:${escape(`${course.name} — ${type} (${group})`)}`,
        `LOCATION:${escape(session.room ?? "No room")}`,
        `DESCRIPTION:${escape(
          [course.code, session.instructors.join(", ")].filter(Boolean).join(" · "),
        )}`,
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function firstOccurrence(from: Date, day: Day): Date {
  const date = new Date(from);
  const shift = (JS_DAYS[day] - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + shift);
  return date;
}

function withTime(date: Date, hhmm: string): Date {
  const minutes = toMinutes(hhmm);
  const out = new Date(date);
  out.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return out;
}

/** Local time, no timezone marker: the calendar app uses the viewer's own. */
function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

function escape(value: string): string {
  return value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

export function downloadIcs(schedule: RenderedSchedule, start: Date): void {
  const blob = new Blob([toIcs(schedule, start)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `timetable-${schedule.index + 1}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}
