/**
 * Sharing a selection as a link.
 *
 * The link carries the courses and every rule set on them, encoded in the URL
 * itself - there is no server holding it, so nothing expires and nothing can
 * be lost. What it deliberately does not carry is the parsed semester: that is
 * over a hundred kilobytes, and it is the same file for everyone in the
 * faculty. Whoever opens the link reads the schedule once and it stays in
 * their browser from then on.
 */

import {
  EMPTY_GLOBAL_FILTERS,
  type CourseFilter,
  type GlobalFilters,
} from "../types";

const PARAM = "s";

export interface SharedSelection {
  courses: string[];
  courseFilters: Record<string, CourseFilter>;
  global: GlobalFilters;
}

export function shareUrl(selection: SharedSelection): string {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, encode(selection));
  return url.toString();
}

/** The selection a link is asking for, if this page was opened from one. */
export function sharedSelection(): SharedSelection | null {
  const raw = new URLSearchParams(window.location.search).get(PARAM);
  return raw ? decode(raw) : null;
}

/** Drop the parameter so later edits are not mistaken for the shared state. */
export function forgetShare(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState(null, "", url.toString());
}

function encode(selection: SharedSelection): string {
  const json = JSON.stringify([
    selection.courses,
    selection.courseFilters,
    selection.global,
  ]);
  return toBase64Url(json);
}

function decode(raw: string): SharedSelection | null {
  try {
    const [courses, courseFilters, global] = JSON.parse(fromBase64Url(raw));
    if (!Array.isArray(courses)) return null;
    return {
      courses,
      courseFilters: courseFilters ?? {},
      // Spread over the defaults: a link made by an older version may predate
      // a filter that exists now.
      global: { ...EMPTY_GLOBAL_FILTERS, ...(global ?? {}) },
    };
  } catch {
    return null;
  }
}

/** Base64url, so the value survives being pasted into a chat unescaped. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
