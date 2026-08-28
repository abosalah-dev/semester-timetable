/**
 * The solver against this semester's actual data.
 *
 * `semester.json` is the output of the backend parser on the two real PDFs,
 * regenerated with:
 *   cd backend && python -c "..." (see README)
 *
 * The headline check reproduces the timetable the student supplied as a
 * reference image, which ties parser, solver and model together end to end.
 */

import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/semester.json";
import { EMPTY_COURSE_FILTER, EMPTY_GLOBAL_FILTERS, type Semester } from "../types";
import { count, page, prepare, sweep } from "./engine";

const semester = fixture as unknown as Semester;

/** Exactly the courses that appear in the reference image. */
const IMAGE_COURSES = ["CS313x", "CS363", "CS389", "CS381", "CS391", "CS334"];

describe("this semester's data", () => {
  it("loads the whole faculty", () => {
    expect(semester.courses).toHaveLength(73);
    expect(semester.warnings).toHaveLength(0);
  });

  it("reproduces the reference timetable when its groups are pinned", () => {
    const prepared = prepare(
      semester,
      IMAGE_COURSES,
      {
        // Every group visible in the reference image.
        CS313x: pin({ Lecture: "F", Lab: "B2" }),
        CS363: pin({ Lecture: "E", Lab: "B2" }),
        CS389: pin({ Lecture: "C", Lab: "A1" }),
        CS381: pin({ Lecture: "B", Lab: "C2" }),
        CS391: pin({ Lecture: "B", Lab: "B2" }),
        CS334: pin({ Lecture: "B", Lab: "B3" }),
      },
      EMPTY_GLOBAL_FILTERS,
    );

    expect(prepared.impossible).toEqual([]);
    const result = sweep(prepared);
    expect(result.examined).toBe(1);

    const [schedule] = page(prepared, { limit: 1 }).schedules;
    const placed = schedule.courses
      .flatMap((course) =>
        course.placements.map(({ session: s }) => `${course.code} ${s.day} ${s.start} ${s.room ?? "-"}`),
      )
      .sort();

    // Spot-checks straight off the image.
    expect(placed).toContain("CS334 THURSDAY 14:00 D103"); // Compiler Design Lab (B3)
    expect(placed).toContain("CS334 MONDAY 18:30 -"); // Compiler Design, No Room
    expect(placed).toContain("CS334 MONDAY 20:00 -");
    expect(placed).toContain("CS363 MONDAY 09:30 N312"); // Machine Learning Lecture (E)
    expect(placed).toContain("CS363 WEDNESDAY 12:30 N412");
    expect(placed).toContain("CS363 MONDAY 12:30 D103"); // Machine Learning Lab (B2)
    expect(placed).toContain("CS389 WEDNESDAY 09:30 G408"); // Image Processing Lecture (C)
    expect(placed).toContain("CS389 WEDNESDAY 11:00 G408");
    expect(placed).toContain("CS381 MONDAY 14:00 E205"); // Computer Graphics Lecture (B)
    expect(placed).toContain("CS381 MONDAY 15:30 E205");
    expect(placed).toContain("CS313x SATURDAY 11:00 G408"); // Information Retrieval Lecture (F)

    expect(schedule.metrics.dayCount).toBe(6);
  });

  it("sizes a six-course space exactly, and quickly", () => {
    const prepared = prepare(semester, IMAGE_COURSES, {}, EMPTY_GLOBAL_FILTERS);
    const started = Date.now();
    const sized = count(prepared, { maxMillis: 20_000, maxNodes: 500_000_000 });

    expect(sized.exact).toBe(true);
    expect(sized.total).toBe(1_706_322);
    // Counting must stay far cheaper than measuring: it is what the student
    // sees first while the breakdown is still being built.
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it("measures that same space and accounts for every timetable", () => {
    const prepared = prepare(semester, IMAGE_COURSES, {}, EMPTY_GLOBAL_FILTERS);
    const result = sweep(prepared, { maxMillis: 30_000, maxNodes: 500_000_000 });

    expect(result.truncated).toBe(false);
    expect(result.examined).toBe(1_706_322);
    for (const facet of [
      result.facets.byDayCount,
      result.facets.byDaysMask,
      result.facets.byGapHours,
      result.facets.byEvenings,
    ]) {
      const sum = Object.values(facet).reduce((a, b) => a + b, 0);
      expect(sum).toBe(result.examined);
    }
  }, 60_000);

  it("offers timetables with a day off, and they really have one", () => {
    const prepared = prepare(semester, ["CS334", "CS381", "CS389"], {}, EMPTY_GLOBAL_FILTERS);
    const saturday = 0; // WEEK[0]
    const slice = page(prepared, { filter: { freeDays: [saturday] }, limit: 25 });

    expect(slice.schedules.length).toBeGreaterThan(0);
    for (const schedule of slice.schedules) {
      const days = schedule.courses.flatMap((c) => c.placements.map((p) => p.session).map((s) => s.day));
      expect(days).not.toContain("SATURDAY");
    }
  });

  it("honours an evening ban on a course that only runs in the evening", () => {
    // CS334's lectures are all at 18:30 and 20:00, so banning the evening
    // must make the course impossible rather than silently dropping it.
    const prepared = prepare(
      semester,
      ["CS334"],
      {},
      { ...EMPTY_GLOBAL_FILTERS, latestEnd: "17:00" },
    );
    expect(prepared.impossible).toHaveLength(1);
    expect(prepared.impossible[0].code).toBe("CS334");
    expect(sweep(prepared).examined).toBe(0);
  });

  it("keeps English courses selectable alongside the main schedule", () => {
    const prepared = prepare(semester, ["ENG_101", "CS334"], {}, EMPTY_GLOBAL_FILTERS);
    expect(prepared.impossible).toEqual([]);
    const result = sweep(prepared);
    expect(result.examined).toBeGreaterThan(0);

    const [schedule] = page(prepared, { limit: 1 }).schedules;
    expect(schedule.courses.map((c) => c.code).sort()).toEqual(["CS334", "ENG_101"]);
  });

  it("respects its budget on a first-year load and admits when it stopped", () => {
    // Five first-year courses are the worst case in this file: three of them
    // have a lab, a lecture and a workshop to combine.
    const heavy = ["CS101x", "CS102x", "CS232", "CS121", "MTH100"];
    const prepared = prepare(semester, heavy, {}, EMPTY_GLOBAL_FILTERS);

    const started = Date.now();
    const result = sweep(prepared, { maxMillis: 2_000 });
    expect(Date.now() - started).toBeLessThan(5_000);

    // It must never claim a partial walk was the whole space.
    expect(result.examined).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
  });
});

function pin(groups: Record<string, string>) {
  return { ...EMPTY_COURSE_FILTER, pinnedGroups: groups };
}
