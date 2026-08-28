/**
 * Turning the timetable's clock times into rows the eye can follow.
 *
 * Rows are *bands* between consecutive start times - 08:00-09:30,
 * 09:30-11:00, and so on - which is how the university prints its own
 * timetable. They are derived from the courses the student chose, not from
 * the whole file: every timetable on screen is built from those same courses,
 * so the rows still line up between them, but an unrelated 60-minute English
 * class no longer slices everyone else's rows into fragments.
 */

import type { Course, Session } from "../types";
import { SLOT_MINUTES, toHHMM, toMinutes } from "../solver/grid";

export interface Band {
  startMinutes: number;
  endMinutes: number;
}

export function bandsOf(courses: Course[]): Band[] {
  // start time -> the latest end of anything that starts then
  const ends = new Map<number, number>();

  forEachSession(courses, (session) => {
    const start = toMinutes(session.start);
    const end = toMinutes(session.end);
    ends.set(start, Math.max(ends.get(start) ?? 0, end));
  });

  if (ends.size === 0) return [];

  const starts = [...ends.keys()].sort((a, b) => a - b);
  return starts.map((start, index) => {
    const next = starts[index + 1] ?? Infinity;
    // A band stops when its own classes stop. Without this, an empty stretch
    // of afternoon would be swallowed into the row above it and a 90-minute
    // class would be labelled "3:30 PM - 6:30 PM".
    return {
      startMinutes: start,
      endMinutes: Math.min(next, ends.get(start) as number),
    };
  });
}

/** The bands a session covers, as an inclusive `[first, last]` pair. */
export function bandSpan(bands: Band[], session: Session): [number, number] {
  const start = toMinutes(session.start);
  const end = toMinutes(session.end);

  let first = bands.findIndex((band) => band.endMinutes > start);
  if (first < 0) first = bands.length - 1;

  let last = first;
  while (last + 1 < bands.length && bands[last + 1].startMinutes < end) last += 1;

  return [first, last];
}

/**
 * The half-hour cells a class occupies, as the busy-time filter names them.
 *
 * The filter works on half hours because that is the grid the solver uses, so
 * "block this class's time" has to be expanded into the cells underneath it.
 */
export function busyCellsOf(session: Session): string[] {
  const start = toMinutes(session.start);
  const end = toMinutes(session.end);
  const cells: string[] = [];
  for (let at = start; at < end; at += SLOT_MINUTES) {
    cells.push(`${session.day} ${toHHMM(at)}`);
  }
  return cells.length > 0 ? cells : [`${session.day} ${toHHMM(start)}`];
}

export function formatTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatBand(band: Band): string {
  return `${formatTime(band.startMinutes)} – ${formatTime(band.endMinutes)}`;
}

export function formatHours(minutes: number): string {
  if (minutes === 0) return "none";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function forEachSession(courses: Course[], visit: (s: Session) => void): void {
  for (const course of courses) {
    for (const component of course.components) {
      for (const group of component.groups) {
        group.sessions.forEach(visit);
      }
    }
  }
}
