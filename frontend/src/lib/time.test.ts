import { describe, expect, it } from "vitest";

import { busyCellsOf, formatBand, formatHours } from "./time";
import type { Session } from "../types";

const session = (day: Session["day"], start: string, end: string): Session => ({
  day,
  start,
  end,
  room: null,
  instructors: [],
});

describe("turning a class into busy half-hours", () => {
  it("covers every half hour the class occupies, and no more", () => {
    expect(busyCellsOf(session("MONDAY", "09:30", "11:00"))).toEqual([
      "MONDAY 09:30",
      "MONDAY 10:00",
      "MONDAY 10:30",
    ]);
  });

  it("handles the English schedule's one-hour classes", () => {
    expect(busyCellsOf(session("SATURDAY", "08:00", "09:00"))).toEqual([
      "SATURDAY 08:00",
      "SATURDAY 08:30",
    ]);
  });

  it("never returns nothing, even for a zero-length class", () => {
    expect(busyCellsOf(session("SUNDAY", "14:00", "14:00"))).toEqual([
      "SUNDAY 14:00",
    ]);
  });
});

describe("readable times", () => {
  it("writes a band as a range", () => {
    expect(formatBand({ startMinutes: 8 * 60, endMinutes: 9 * 60 + 30 })).toBe(
      "8:00 AM – 9:30 AM",
    );
  });

  it("writes waiting time in hours and minutes", () => {
    expect(formatHours(0)).toBe("none");
    expect(formatHours(90)).toBe("1h 30m");
    expect(formatHours(120)).toBe("2h");
  });
});
