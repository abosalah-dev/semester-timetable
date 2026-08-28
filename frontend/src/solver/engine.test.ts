import { describe, expect, it } from "vitest";

import {
  EMPTY_COURSE_FILTER,
  EMPTY_GLOBAL_FILTERS,
  type Course,
  type CourseFilter,
  type GlobalFilters,
  type Semester,
  type Session,
} from "../types";
import { buildGrid, maskOfSessions, toMinutes } from "./grid";
import { SCORERS, SCORER_IDS, measure } from "./metrics";
import { allSessions, buildBlockedMask, planCourse } from "./options";
import { diagnose, page, prepare, sweep } from "./engine";

// --- fixtures --------------------------------------------------------------

function session(
  day: Session["day"],
  start: string,
  minutes = 90,
  extra: Partial<Session> = {},
): Session {
  const end = toMinutes(start) + minutes;
  return {
    day,
    start,
    end: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    room: "R1",
    instructors: [],
    ...extra,
  };
}

/** `groups` maps a group name to its sessions. */
function course(
  code: string,
  components: { type: Course["components"][number]["type"]; groups: Record<string, Session[]> }[],
): Course {
  return {
    code,
    name: code,
    components: components.map(({ type, groups }) => ({
      type,
      groups: Object.entries(groups).map(([name, sessions]) => ({
        name,
        sessions,
        max_load: null,
        enrolled: null,
      })),
    })),
  };
}

function semesterOf(...courses: Course[]): Semester {
  return { title: null, courses, warnings: [] };
}

function setup(
  semester: Semester,
  codes: string[],
  courseFilters: Record<string, CourseFilter> = {},
  global: GlobalFilters = EMPTY_GLOBAL_FILTERS,
) {
  return prepare(semester, codes, courseFilters, global);
}

/**
 * Independent reference implementation: expand everything, filter by clash.
 * Only usable on tiny fixtures, which is exactly the point - it pins the fast
 * search to an obviously-correct one.
 */
function bruteForceCount(semester: Semester, codes: string[]): number {
  const grid = buildGrid(allSessions(semester.courses));
  const perCourse = codes.map((code) => {
    const found = semester.courses.find((c) => c.code === code)!;
    return planCourse(grid, found, EMPTY_COURSE_FILTER, buildBlockedMask(grid, EMPTY_GLOBAL_FILTERS))
      .options.map((option) => option.mask);
  });

  let count = 0;
  const walk = (level: number, used: Uint32Array) => {
    if (level === perCourse.length) {
      count += 1;
      return;
    }
    for (const mask of perCourse[level]) {
      let clash = false;
      for (let i = 0; i < mask.length; i += 1) {
        if ((used[i] & mask[i]) !== 0) clash = true;
      }
      if (clash) continue;
      const next = new Uint32Array(used.length);
      for (let i = 0; i < mask.length; i += 1) next[i] = used[i] | mask[i];
      walk(level + 1, next);
    }
  };
  walk(0, new Uint32Array(grid.wordCount));
  return count;
}

// --- the time grid ---------------------------------------------------------

describe("time grid", () => {
  it("gives overlapping sessions an intersecting mask", () => {
    const grid = buildGrid([session("SUNDAY", "08:00"), session("SUNDAY", "09:30")]);
    const a = maskOfSessions(grid, [session("SUNDAY", "08:00")]);
    const b = maskOfSessions(grid, [session("SUNDAY", "09:00", 60)]);
    const c = maskOfSessions(grid, [session("SUNDAY", "09:30")]);

    expect(intersect(a, b)).toBe(true);
    expect(intersect(a, c)).toBe(false);
  });

  it("keeps the same hour on different days apart", () => {
    const grid = buildGrid([session("SUNDAY", "08:00"), session("MONDAY", "08:00")]);
    const sunday = maskOfSessions(grid, [session("SUNDAY", "08:00")]);
    const monday = maskOfSessions(grid, [session("MONDAY", "08:00")]);
    expect(intersect(sunday, monday)).toBe(false);
  });

  it("handles the 60-minute classes of the English schedule", () => {
    const grid = buildGrid([session("SATURDAY", "08:00", 60)]);
    const first = maskOfSessions(grid, [session("SATURDAY", "08:00", 60)]);
    const second = maskOfSessions(grid, [session("SATURDAY", "09:00", 60)]);
    expect(intersect(first, second)).toBe(false);
  });
});

function intersect(a: Uint32Array, b: Uint32Array): boolean {
  return a.some((word, i) => (word & b[i]) !== 0);
}

// --- metrics ---------------------------------------------------------------

describe("metrics", () => {
  it("measures days, waiting time and the edges of the week", () => {
    const sessions = [
      session("SUNDAY", "08:00"),
      session("SUNDAY", "12:30"), // a 90-minute gap sits between them
      session("WEDNESDAY", "14:00"),
    ];
    const grid = buildGrid(sessions);
    const metrics = measure(grid, maskOfSessions(grid, sessions));

    expect(metrics.dayCount).toBe(2);
    expect(metrics.gapMinutes).toBe(180);
    expect(metrics.earliestStart).toBe(toMinutes("08:00"));
    expect(metrics.latestEnd).toBe(toMinutes("15:30"));
  });

  it("counts evenings as days, not as classes", () => {
    // Two lectures on one night is still one evening spent on campus.
    const oneNight = [session("MONDAY", "18:30"), session("MONDAY", "20:00")];
    const grid = buildGrid(oneNight);
    expect(measure(grid, maskOfSessions(grid, oneNight)).eveningDays).toBe(1);

    const twoNights = [session("MONDAY", "18:30"), session("TUESDAY", "20:00")];
    expect(measure(grid, maskOfSessions(grid, twoNights)).eveningDays).toBe(2);

    const daytime = [session("MONDAY", "08:00"), session("MONDAY", "12:30")];
    expect(measure(grid, maskOfSessions(grid, daytime)).eveningDays).toBe(0);
  });
});

// --- course options --------------------------------------------------------

describe("course options", () => {
  const machineLearning = course("CS363", [
    { type: "Lecture", groups: { A: [session("MONDAY", "08:00")], E: [session("MONDAY", "09:30")] } },
    { type: "Lab", groups: { B2: [session("MONDAY", "12:30")], C1: [session("MONDAY", "09:30")] } },
  ]);

  it("pairs lecture and lab groups independently of their letters", () => {
    const grid = buildGrid(allSessions([machineLearning]));
    const plan = planCourse(grid, machineLearning, EMPTY_COURSE_FILTER, buildBlockedMask(grid, EMPTY_GLOBAL_FILTERS));
    expect(plan.options.map((o) => o.label).sort()).toEqual([
      "Lecture A · Lab B2",
      "Lecture A · Lab C1",
      "Lecture E · Lab B2",
    ]);
  });

  it("drops a combination that clashes with itself", () => {
    const grid = buildGrid(allSessions([machineLearning]));
    const plan = planCourse(grid, machineLearning, EMPTY_COURSE_FILTER, buildBlockedMask(grid, EMPTY_GLOBAL_FILTERS));
    // Lecture E and Lab C1 are both Monday 09:30.
    expect(plan.options.map((o) => o.label)).not.toContain("Lecture E · Lab C1");
  });

  it("honours a pinned group", () => {
    const grid = buildGrid(allSessions([machineLearning]));
    const plan = planCourse(
      grid,
      machineLearning,
      { ...EMPTY_COURSE_FILTER, pinnedGroups: { Lecture: "E" } },
      buildBlockedMask(grid, EMPTY_GLOBAL_FILTERS),
    );
    expect(plan.options.map((o) => o.label)).toEqual(["Lecture E · Lab B2"]);
  });

  it("explains itself when a filter leaves nothing", () => {
    const grid = buildGrid(allSessions([machineLearning]));
    const plan = planCourse(
      grid,
      machineLearning,
      { ...EMPTY_COURSE_FILTER, requiredInstructors: ["Nobody"] },
      buildBlockedMask(grid, EMPTY_GLOBAL_FILTERS),
    );
    expect(plan.options).toHaveLength(0);
    expect(plan.blockedReason).toContain("Nobody");
  });

  it("removes groups taught by an excluded instructor", () => {
    const withStaff = course("CS389", [
      {
        type: "Lecture",
        groups: {
          A: [session("SUNDAY", "08:00", 90, { instructors: ["Tamer"] })],
          B: [session("SUNDAY", "09:30", 90, { instructors: ["Other"] })],
        },
      },
    ]);
    const grid = buildGrid(allSessions([withStaff]));
    const plan = planCourse(
      grid,
      withStaff,
      { ...EMPTY_COURSE_FILTER, excludedInstructors: ["Tamer"] },
      buildBlockedMask(grid, EMPTY_GLOBAL_FILTERS),
    );
    expect(plan.options.map((o) => o.label)).toEqual(["Lecture B"]);
  });
});

// --- the search ------------------------------------------------------------

describe("search", () => {
  const semester = semesterOf(
    course("A1", [
      { type: "Lecture", groups: { A: [session("SUNDAY", "08:00")], B: [session("MONDAY", "08:00")] } },
    ]),
    course("B1", [
      {
        type: "Lecture",
        groups: {
          A: [session("SUNDAY", "08:00")],
          B: [session("SUNDAY", "09:30")],
          C: [session("TUESDAY", "11:00")],
        },
      },
      { type: "Lab", groups: { L1: [session("WEDNESDAY", "08:00")], L2: [session("SUNDAY", "09:30")] } },
    ]),
    course("C1", [
      { type: "Lecture", groups: { A: [session("MONDAY", "08:00")], B: [session("THURSDAY", "14:00")] } },
    ]),
  );
  const codes = ["A1", "B1", "C1"];

  it("counts exactly what an independent brute force counts", () => {
    const result = sweep(setup(semester, codes));
    expect(result.truncated).toBe(false);
    expect(result.examined).toBe(bruteForceCount(semester, codes));
    expect(result.examined).toBeGreaterThan(0);
  });

  it("has facet counts that add up to the total", () => {
    const result = sweep(setup(semester, codes));
    const sum = (counter: Record<number, number>) =>
      Object.values(counter).reduce((a, b) => a + b, 0);

    expect(sum(result.facets.byDayCount)).toBe(result.examined);
    expect(sum(result.facets.byDaysMask)).toBe(result.examined);
    expect(sum(result.facets.byGapHours)).toBe(result.examined);
    expect(sum(result.facets.byEvenings)).toBe(result.examined);
  });

  it("pages through the whole space without gaps or repeats", () => {
    const prepared = setup(semester, codes);
    const total = sweep(prepared).examined;

    const seen: string[] = [];
    for (let offset = 0; offset < total; offset += 3) {
      const slice = page(prepared, { offset, limit: 3 });
      for (const schedule of slice.schedules) {
        expect(schedule.index).toBe(seen.length);
        seen.push(schedule.courses.map((c) => `${c.code}:${c.label}`).join("|"));
      }
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  it("returns the same timetable for the same index every time", () => {
    const prepared = setup(semester, codes);
    const first = page(prepared, { offset: 4, limit: 1 }).schedules[0];
    const again = page(setup(semester, codes), { offset: 4, limit: 1 }).schedules[0];
    expect(again).toEqual(first);
  });

  it("never returns a timetable with two classes at once", () => {
    const prepared = setup(semester, codes);
    for (const schedule of page(prepared, { limit: 100 }).schedules) {
      const cells = new Set<string>();
      for (const c of schedule.courses) {
        for (const s of c.placements.map((p) => p.session)) {
          for (let m = toMinutes(s.start); m < toMinutes(s.end); m += 30) {
            const cell = `${s.day} ${m}`;
            expect(cells.has(cell)).toBe(false);
            cells.add(cell);
          }
        }
      }
    }
  });

  it("respects a day the student marked off", () => {
    const prepared = setup(semester, codes, {}, { ...EMPTY_GLOBAL_FILTERS, daysOff: ["SUNDAY"] });
    const result = sweep(prepared);
    for (const schedule of page(prepared, { limit: 50 }).schedules) {
      expect(schedule.courses.flatMap((c) => c.placements.map((p) => p.session)).some((s) => s.day === "SUNDAY")).toBe(false);
    }
    expect(result.examined).toBeLessThan(sweep(setup(semester, codes)).examined);
  });

  it("respects a cap on days per week", () => {
    const unconstrained = sweep(setup(semester, codes));
    const fewest = Math.min(
      ...Object.keys(unconstrained.facets.byDayCount).map(Number),
    );

    const atTheLimit = setup(semester, codes, {}, { ...EMPTY_GLOBAL_FILTERS, maxDaysPerWeek: fewest });
    const allowed = sweep(atTheLimit);
    expect(allowed.examined).toBe(unconstrained.facets.byDayCount[fewest]);
    for (const schedule of page(atTheLimit, { limit: 50 }).schedules) {
      expect(schedule.metrics.dayCount).toBeLessThanOrEqual(fewest);
    }

    // One day tighter than anything possible must come back empty, not wrong.
    const tooTight = setup(semester, codes, {}, { ...EMPTY_GLOBAL_FILTERS, maxDaysPerWeek: fewest - 1 });
    expect(sweep(tooTight).examined).toBe(0);
  });

  it("reports zero, with a reason, when a course has no options left", () => {
    const prepared = setup(semester, codes, {
      A1: { ...EMPTY_COURSE_FILTER, pinnedGroups: { Lecture: "Z" } },
    });
    expect(prepared.impossible).toHaveLength(1);
    expect(prepared.impossible[0].code).toBe("A1");
    expect(sweep(prepared).examined).toBe(0);
  });

  it("filters a page down to schedules that leave a day free", () => {
    const prepared = setup(semester, codes);
    const sundayIndex = 1; // WEEK[1]
    const slice = page(prepared, { filter: { freeDays: [sundayIndex] }, limit: 50 });
    expect(slice.schedules.length).toBeGreaterThan(0);
    for (const schedule of slice.schedules) {
      expect(schedule.metrics.daysMask & (1 << sundayIndex)).toBe(0);
    }
  });

  it("keeps the inlined rankings in step with the named scorers", () => {
    // `sweep` spells the seven scores out by hand for speed. If either copy
    // drifts, the ordering the student sees stops matching its label.
    const prepared = setup(semester, codes);
    const result = sweep(prepared);

    for (const id of SCORER_IDS) {
      const ranked = result.tops[id];
      expect(ranked.length).toBeGreaterThan(0);
      const scores = ranked.map((s) => SCORERS[id](s.metrics));
      expect(scores).toEqual([...scores].sort((a, b) => a - b));

      // The best of the kept results must be the best in the whole space.
      const everything = page(prepared, { limit: 10_000 }).schedules;
      const bestPossible = Math.min(...everything.map((s) => SCORERS[id](s.metrics)));
      expect(scores[0]).toBe(bestPossible);
    }
  });

  it("ranks the fewest-days preset ahead of busier timetables", () => {
    const result = sweep(setup(semester, codes));
    const best = result.tops.fewestDays;
    expect(best.length).toBeGreaterThan(0);
    const dayCounts = best.map((s) => s.metrics.dayCount);
    expect(dayCounts).toEqual([...dayCounts].sort((a, b) => a - b));
    expect(dayCounts[0]).toBe(Math.min(...Object.keys(result.facets.byDayCount).map(Number)));
  });
});

describe("diagnostics", () => {
  it("names the course whose filters left it with nothing", () => {
    const semester = semesterOf(
      course("X", [{ type: "Lecture", groups: { A: [session("SUNDAY", "08:00")] } }]),
    );
    const prepared = setup(semester, ["X"], {
      X: { ...EMPTY_COURSE_FILTER, pinnedGroups: { Lecture: "Q" } },
    });
    expect(diagnose(prepared)).toEqual([
      { kind: "course", code: "X", reason: expect.stringContaining("Q") },
    ]);
  });

  it("names the two courses that can never share a week", () => {
    const semester = semesterOf(
      course("X", [{ type: "Lecture", groups: { A: [session("SUNDAY", "08:00")] } }]),
      course("Y", [{ type: "Lecture", groups: { A: [session("SUNDAY", "08:00")] } }]),
    );
    const findings = diagnose(setup(semester, ["X", "Y"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "pair", codes: ["X", "Y"] });
  });

  it("points at the one course to drop when no single pair is at fault", () => {
    // Any two of these fit; all three cannot, because C forces the slot that
    // A and B are then unable to share.
    const semester = semesterOf(
      course("A", [{ type: "Lecture", groups: { 1: [session("SUNDAY", "08:00")], 2: [session("SUNDAY", "09:30")] } }]),
      course("B", [{ type: "Lecture", groups: { 1: [session("SUNDAY", "08:00")], 2: [session("SUNDAY", "09:30")] } }]),
      course("C", [{ type: "Lecture", groups: { 1: [session("SUNDAY", "08:00")], 2: [session("SUNDAY", "09:30")] } }]),
    );
    const prepared = setup(semester, ["A", "B", "C"]);
    expect(sweep(prepared).examined).toBe(0);

    const findings = diagnose(prepared);
    expect(findings.every((f) => f.kind === "drop")).toBe(true);
    expect(findings.map((f) => (f as { code: string }).code).sort()).toEqual(["A", "B", "C"]);
  });
});

describe("whole-week hours", () => {
  const semester = semesterOf(
    course("EARLY", [
      {
        type: "Lecture",
        groups: {
          A: [session("SUNDAY", "08:00")],
          B: [session("MONDAY", "08:00")],
          C: [session("SUNDAY", "14:00")],
        },
      },
    ]),
  );

  it("limits one day without touching the others", () => {
    const prepared = setup(semester, ["EARLY"], {}, {
      ...EMPTY_GLOBAL_FILTERS,
      dayWindows: { SUNDAY: { start: "10:00", end: null } },
    });

    const labels = page(prepared, { limit: 20 }).schedules.flatMap((s) =>
      s.courses.map((c) => c.label),
    );
    // Sunday morning is gone; Monday morning and Sunday afternoon survive.
    expect(labels.sort()).toEqual(["Lecture B", "Lecture C"]);
  });

  it("falls back to the week's limit for the end a day does not set", () => {
    const prepared = setup(semester, ["EARLY"], {}, {
      ...EMPTY_GLOBAL_FILTERS,
      latestEnd: "12:00",
      dayWindows: { SUNDAY: { start: "10:00", end: null } },
    });

    const labels = page(prepared, { limit: 20 }).schedules.flatMap((s) =>
      s.courses.map((c) => c.label),
    );
    // Sunday 08:00 fails the day's own start; Sunday 14:00 fails the week's
    // end; only Monday 08:00 is left.
    expect(labels).toEqual(["Lecture B"]);
  });

  it("lets a day open earlier than the rest of the week", () => {
    const prepared = setup(semester, ["EARLY"], {}, {
      ...EMPTY_GLOBAL_FILTERS,
      earliestStart: "10:00",
      dayWindows: { MONDAY: { start: "07:00", end: null } },
    });

    const labels = page(prepared, { limit: 20 }).schedules.flatMap((s) =>
      s.courses.map((c) => c.label),
    );
    expect(labels.sort()).toEqual(["Lecture B", "Lecture C"]);
  });
});

describe("lecturers across every course", () => {
  const taught = (day: Session["day"], start: string, who: string) =>
    session(day, start, 90, { instructors: [who] });

  const semester = semesterOf(
    course("ONE", [
      {
        type: "Lecture",
        groups: {
          A: [taught("SUNDAY", "08:00", "Adel")],
          B: [taught("SUNDAY", "09:30", "Basma")],
        },
      },
    ]),
    course("TWO", [
      {
        type: "Lecture",
        groups: {
          A: [taught("MONDAY", "08:00", "Adel")],
          B: [taught("MONDAY", "09:30", "Camelia")],
        },
      },
    ]),
    course("THREE", [
      {
        type: "Lecture",
        groups: {
          A: [taught("TUESDAY", "08:00", "Dina")],
          B: [taught("TUESDAY", "09:30", "Camelia")],
        },
      },
    ]),
  );
  const codes = ["ONE", "TWO", "THREE"];

  const labelsOf = (prepared: ReturnType<typeof setup>) =>
    page(prepared, { limit: 50 }).schedules.flatMap((s) =>
      s.courses.map((c) => `${c.code} ${c.label}`),
    );

  it("removes an excluded lecturer from every course at once", () => {
    const prepared = setup(semester, codes, {}, {
      ...EMPTY_GLOBAL_FILTERS,
      excludedInstructors: ["Adel"],
    });

    const labels = labelsOf(prepared);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).not.toContain("ONE Lecture A");
    expect(labels).not.toContain("TWO Lecture A");
    expect(labels).toContain("ONE Lecture B");
    expect(labels).toContain("TWO Lecture B");
  });

  it("constrains only the courses a preferred lecturer teaches", () => {
    const prepared = setup(semester, codes, {}, {
      ...EMPTY_GLOBAL_FILTERS,
      requiredInstructors: ["Camelia"],
    });

    expect(prepared.impossible).toEqual([]);
    const labels = labelsOf(prepared);

    // Camelia teaches in TWO and THREE, so those are pinned to her groups.
    expect(new Set(labels.filter((l) => l.startsWith("TWO")))).toEqual(
      new Set(["TWO Lecture B"]),
    );
    expect(new Set(labels.filter((l) => l.startsWith("THREE")))).toEqual(
      new Set(["THREE Lecture B"]),
    );
    // She teaches nothing in ONE, so ONE keeps both of its groups.
    expect(new Set(labels.filter((l) => l.startsWith("ONE")))).toEqual(
      new Set(["ONE Lecture A", "ONE Lecture B"]),
    );
  });

  it("combines a global rule with a rule set on one course", () => {
    const prepared = setup(
      semester,
      codes,
      { ONE: { ...EMPTY_COURSE_FILTER, excludedInstructors: ["Basma"] } },
      { ...EMPTY_GLOBAL_FILTERS, excludedInstructors: ["Adel"] },
    );

    // ONE loses group A to the global rule and group B to its own.
    expect(prepared.impossible).toHaveLength(1);
    expect(prepared.impossible[0].code).toBe("ONE");
    expect(sweep(prepared).examined).toBe(0);
  });

  it("says who is responsible when a global rule empties a course", () => {
    const prepared = setup(semester, ["ONE"], {}, {
      ...EMPTY_GLOBAL_FILTERS,
      excludedInstructors: ["Adel", "Basma"],
    });

    expect(prepared.impossible).toHaveLength(1);
    expect(prepared.impossible[0].reason).toMatch(/lecturer/i);
  });
});

describe("wanting a lecturer who only teaches part of a course", () => {
  // The usual shape: a doctor gives the lectures, demonstrators run the labs.
  const taught = (day: Session["day"], start: string, who: string) =>
    session(day, start, 90, { instructors: [who] });

  const withLabs = course("CS1", [
    {
      type: "Lecture",
      groups: {
        A: [taught("SUNDAY", "08:00", "Doctor Adel")],
        B: [taught("SUNDAY", "09:30", "Doctor Basma")],
      },
    },
    {
      type: "Lab",
      groups: {
        L1: [taught("MONDAY", "08:00", "Demonstrator Karim")],
        L2: [taught("MONDAY", "09:30", "Demonstrator Nada")],
      },
    },
  ]);
  const semester = semesterOf(withLabs);

  it("constrains the lectures and leaves the labs alone", () => {
    const prepared = setup(semester, ["CS1"], {}, {
      ...EMPTY_GLOBAL_FILTERS,
      requiredInstructors: ["Doctor Adel"],
    });

    expect(prepared.impossible).toEqual([]);
    const labels = page(prepared, { limit: 20 }).schedules.map((s) => s.courses[0].label);
    expect(labels.sort()).toEqual([
      "Lecture A · Lab L1",
      "Lecture A · Lab L2",
    ]);
  });

  it("works the same when the rule is set on the course itself", () => {
    const prepared = setup(semester, ["CS1"], {
      CS1: { ...EMPTY_COURSE_FILTER, requiredInstructors: ["Doctor Adel"] },
    });

    expect(prepared.impossible).toEqual([]);
    const labels = page(prepared, { limit: 20 }).schedules.map((s) => s.courses[0].label);
    expect(labels).toHaveLength(2);
    expect(labels.every((l) => l.startsWith("Lecture A"))).toBe(true);
  });

  it("still refuses a lecturer who teaches nothing in the course", () => {
    const prepared = setup(semester, ["CS1"], {
      CS1: { ...EMPTY_COURSE_FILTER, requiredInstructors: ["Someone Else"] },
    });

    expect(prepared.impossible).toHaveLength(1);
    expect(prepared.impossible[0].reason).toContain("Someone Else");
  });
});
