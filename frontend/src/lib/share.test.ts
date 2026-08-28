/**
 * @vitest-environment jsdom
 *
 * These tests read and write the page URL, so they need a browser environment.
 * The solver tests are plain functions and stay on the faster default.
 */
import { describe, expect, it } from "vitest";

import { EMPTY_COURSE_FILTER, EMPTY_GLOBAL_FILTERS } from "../types";
import { forgetShare, sharedSelection, shareUrl } from "./share";

const selection = {
  courses: ["CS334", "CS363"],
  courseFilters: {
    CS334: { ...EMPTY_COURSE_FILTER, pinnedGroups: { Lecture: "B" } },
  },
  global: {
    ...EMPTY_GLOBAL_FILTERS,
    daysOff: ["SATURDAY" as const],
    dayWindows: { SUNDAY: { start: "10:00", end: null } },
    excludedInstructors: ["Someone With A Long Name"],
  },
};

function visit(url: string) {
  window.history.replaceState(null, "", url);
}

describe("sharing a selection through the link", () => {
  it("survives a round trip", () => {
    visit(shareUrl(selection));
    expect(sharedSelection()).toEqual(selection);
  });

  it("produces a link short enough to send in a message", () => {
    expect(shareUrl(selection).length).toBeLessThan(700);
  });

  it("fills in filters a link made by an older version never had", () => {
    const url = new URL(window.location.href);
    // A link carrying only the two fields the first version knew about.
    const legacy = btoa(JSON.stringify([["CS334"], {}, { daysOff: ["SUNDAY"] }]))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    url.searchParams.set("s", legacy);
    visit(url.toString());

    const restored = sharedSelection();
    expect(restored?.courses).toEqual(["CS334"]);
    expect(restored?.global.daysOff).toEqual(["SUNDAY"]);
    expect(restored?.global.dayWindows).toEqual({});
    expect(restored?.global.excludedInstructors).toEqual([]);
  });

  it("ignores a damaged link instead of throwing", () => {
    visit("/?s=not-real-base64!!");
    expect(sharedSelection()).toBeNull();
  });

  it("reports nothing when the page was opened normally", () => {
    visit("/");
    expect(sharedSelection()).toBeNull();
  });

  it("removes the parameter once the link has been used", () => {
    visit(shareUrl(selection));
    forgetShare();
    expect(sharedSelection()).toBeNull();
    expect(window.location.search).toBe("");
  });
});
