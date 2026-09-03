/**
 * Keeping the session across a page refresh.
 *
 * Reading the semester PDF takes about half a minute, which is a long time to
 * pay again for pressing F5. What was read, what was chosen, and every rule
 * set on it live in the browser so a refresh picks up where it left off.
 *
 * Everything here is best-effort. A private window, a full quota, or a
 * browser set to block site data all make storage throw, and none of that
 * should stop the app working - it just means the next refresh starts over.
 */

import type { CourseFilter, GlobalFilters, Semester } from "../types";
import type { RenderedSchedule } from "../solver/engine";

const KEY = "semester-schedule-creator";

/** Bumped whenever the shape below changes, so old data is dropped, not misread. */
const VERSION = 1;

export interface SavedSession {
  version: number;
  semester: Semester;
  courses: string[];
  courseFilters: Record<string, CourseFilter>;
  global: GlobalFilters;
  favourites: RenderedSchedule[];
  /**
   * True when the semester came from the built-in sample rather than an
   * upload. Optional, so a session saved before the demo existed still loads.
   */
  sample?: boolean;
}

export function save(session: Omit<SavedSession, "version">): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...session, version: VERSION }),
    );
  } catch {
    // Out of quota, or storage is unavailable. Nothing to do but carry on.
  }
}

export function load(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedSession;
    if (parsed?.version !== VERSION) return null;
    if (!parsed.semester?.courses?.length) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, or storage is unavailable.
  }
}
