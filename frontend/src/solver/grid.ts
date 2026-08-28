/**
 * The half-hour grid every timetable is expressed on.
 *
 * A candidate timetable is a set of occupied half-hour cells, stored as one
 * 32-bit word per day. Testing two options for a clash is then a handful of
 * bitwise ANDs, which is what makes walking a solution space of millions
 * practical in the browser.
 *
 * The grid is derived from the data rather than hard-coded, because the two
 * source files disagree about class length (90 minutes in the main schedule,
 * 60 in the English one) and a future semester may add earlier or later slots.
 */

import { WEEK, type Day, type Session } from "../types";

export const SLOT_MINUTES = 30;
export const DAY_COUNT = WEEK.length;

export interface TimeGrid {
  /** Minutes past midnight of slot 0. */
  originMinutes: number;
  slotsPerDay: number;
  wordsPerDay: number;
  /** Total 32-bit words in one mask. */
  wordCount: number;
}

export function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Build a grid wide enough to hold every session it is given. */
export function buildGrid(sessions: Session[]): TimeGrid {
  let earliest = Infinity;
  let latest = -Infinity;
  for (const session of sessions) {
    earliest = Math.min(earliest, toMinutes(session.start));
    latest = Math.max(latest, toMinutes(session.end));
  }
  if (!Number.isFinite(earliest)) {
    earliest = 8 * 60;
    latest = 22 * 60;
  }

  const originMinutes = Math.floor(earliest / SLOT_MINUTES) * SLOT_MINUTES;
  const endMinutes = Math.ceil(latest / SLOT_MINUTES) * SLOT_MINUTES;
  const slotsPerDay = Math.max(1, (endMinutes - originMinutes) / SLOT_MINUTES);
  const wordsPerDay = Math.ceil(slotsPerDay / 32);

  return {
    originMinutes,
    slotsPerDay,
    wordsPerDay,
    wordCount: wordsPerDay * DAY_COUNT,
  };
}

export function emptyMask(grid: TimeGrid): Uint32Array {
  return new Uint32Array(grid.wordCount);
}

export function slotOf(grid: TimeGrid, minutes: number): number {
  return Math.floor((minutes - grid.originMinutes) / SLOT_MINUTES);
}

export function minutesOfSlot(grid: TimeGrid, slot: number): number {
  return grid.originMinutes + slot * SLOT_MINUTES;
}

/** Set every half-hour cell covered by ``[start, end)`` on ``day``. */
export function occupy(
  grid: TimeGrid,
  mask: Uint32Array,
  day: Day,
  startMinutes: number,
  endMinutes: number,
): void {
  const dayIndex = WEEK.indexOf(day);
  if (dayIndex < 0) return;
  const first = slotOf(grid, startMinutes);
  const last = slotOf(grid, endMinutes - 1);
  for (let slot = first; slot <= last; slot += 1) {
    if (slot < 0 || slot >= grid.slotsPerDay) continue;
    const word = dayIndex * grid.wordsPerDay + (slot >>> 5);
    mask[word] |= 1 << (slot & 31);
  }
}

export function maskOfSessions(grid: TimeGrid, sessions: Session[]): Uint32Array {
  const mask = emptyMask(grid);
  for (const session of sessions) {
    occupy(grid, mask, session.day, toMinutes(session.start), toMinutes(session.end));
  }
  return mask;
}

export function intersects(a: Uint32Array, b: Uint32Array): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if ((a[i] & b[i]) !== 0) return true;
  }
  return false;
}

export function union(a: Uint32Array, b: Uint32Array): Uint32Array {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] | b[i];
  return out;
}
