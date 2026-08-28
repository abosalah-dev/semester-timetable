/**
 * The search over every conflict-free timetable.
 *
 * The solution space is far too large to hold in memory - six senior courses
 * multiply out to well over a hundred million combinations - so it is never
 * built. Instead it is walked twice:
 *
 *   `sweep`  counts the whole space, tallies the facets and keeps only the
 *            best few timetables per ranking.
 *   `page`   walks it again in the same deterministic order and emits one
 *            slice, so any timetable in the space can be reached by index.
 *
 * Both walks share one ordering, so a page number means the same thing every
 * time and paging deep into the space stays consistent.
 */

import {
  type Course,
  type CourseFilter,
  type GlobalFilters,
  type ScheduleMetrics,
  type Semester,
  EMPTY_COURSE_FILTER,
} from "../types";
import { type TimeGrid, DAY_COUNT, SLOT_MINUTES, buildGrid } from "./grid";
import {
  SCORER_IDS,
  emptyMetrics,
  eveningMaskOf,
  measureInto,
} from "./metrics";
import {
  type CourseOption,
  type CoursePlan,
  type Placement,
  allSessions,
  buildBlockedMask,
  mergeInstructorRules,
  planCourse,
} from "./options";

export interface Prepared {
  grid: TimeGrid;
  /** Courses in search order: most constrained first, to prune early. */
  plans: CoursePlan[];
  /** Per plan, per option, the days that option touches as a bitmask. */
  dayMasks: number[][];
  /**
   * Every option's cells for one course, laid out end to end. The search
   * reads these millions of times, and one contiguous buffer per course is
   * markedly faster than an array of separate small arrays.
   */
  optionMasks: Uint32Array[];
  maxDaysPerWeek: number | null;
  /** Courses that cannot contribute any option, with the reason. */
  impossible: { code: string; reason: string }[];
}

export interface Facets {
  byDayCount: Record<number, number>;
  byDaysMask: Record<number, number>;
  byGapHours: Record<number, number>;
  byStartTime: Record<number, number>;
  byEndTime: Record<number, number>;
  byEvenings: Record<number, number>;
}

export interface SweepResult {
  /**
   * How many timetables were measured. Equal to the size of the space unless
   * `truncated`, in which case the facets and rankings describe only this
   * many - the exact size still comes from `count`, which is far cheaper.
   */
  examined: number;
  truncated: boolean;
  facets: Facets;
  tops: Record<string, RenderedSchedule[]>;
  elapsedMs: number;
}

export interface FacetFilter {
  dayCount?: number;
  daysMask?: number;
  /** Days that must be free. */
  freeDays?: number[];
  maxGapHours?: number;
  minGapHours?: number;
  notBefore?: number;
  notAfter?: number;
  maxEvenings?: number;
}

export interface RenderedCourse {
  code: string;
  name: string;
  /** "Lecture E · Lab B2". */
  label: string;
  choice: Record<string, string>;
  /** Every class this course puts on the timetable. */
  placements: Placement[];
}

export interface RenderedSchedule {
  index: number;
  metrics: ScheduleMetrics;
  courses: RenderedCourse[];
}

export interface PageResult {
  schedules: RenderedSchedule[];
  /** Total matching the facet filter, when the walk finished in budget. */
  matched: number;
  truncated: boolean;
}

const TOP_K = 60;
const MAX_GAP_HOURS = 48;
const MAX_GAP_MINUTES = MAX_GAP_HOURS * 60;
const DEFAULT_NODE_BUDGET = 20_000_000;
const DEFAULT_TIME_BUDGET_MS = 8_000;

export function prepare(
  semester: Semester,
  selectedCodes: string[],
  courseFilters: Record<string, CourseFilter>,
  globalFilters: GlobalFilters,
): Prepared {
  const byCode = new Map(semester.courses.map((c) => [c.code, c]));
  const selected = selectedCodes
    .map((code) => byCode.get(code))
    .filter((course): course is Course => Boolean(course));

  const grid = buildGrid(allSessions(semester.courses));
  const blocked = buildBlockedMask(grid, globalFilters);

  const plans = selected.map((course) =>
    planCourse(
      grid,
      course,
      // Whole-timetable lecturer rules are folded in here, so the rest of the
      // solver only ever sees one set of rules per course.
      mergeInstructorRules(
        course,
        courseFilters[course.code] ?? EMPTY_COURSE_FILTER,
        globalFilters,
      ),
      blocked,
    ),
  );

  const impossible = plans
    .filter((plan) => plan.options.length === 0)
    .map((plan) => ({
      code: plan.code,
      reason: plan.blockedReason ?? "no options remain",
    }));

  // Fewest options first: the search then fails fast instead of discovering a
  // dead end only after committing to five other courses.
  const ordered = [...plans].sort(
    (a, b) => a.options.length - b.options.length || a.code.localeCompare(b.code),
  );

  return {
    grid,
    plans: ordered,
    dayMasks: ordered.map((plan) => plan.options.map((o) => dayMaskOf(grid, o))),
    optionMasks: ordered.map((plan) => flatten(plan.options, grid.wordCount)),
    maxDaysPerWeek: globalFilters.maxDaysPerWeek,
    impossible,
  };
}

function flatten(options: CourseOption[], wordCount: number): Uint32Array {
  const flat = new Uint32Array(options.length * wordCount);
  options.forEach((option, index) => flat.set(option.mask, index * wordCount));
  return flat;
}

function dayMaskOf(grid: TimeGrid, option: CourseOption): number {
  let mask = 0;
  for (let day = 0; day < DAY_COUNT; day += 1) {
    for (let w = 0; w < grid.wordsPerDay; w += 1) {
      if (option.mask[day * grid.wordsPerDay + w] !== 0) {
        mask |= 1 << day;
        break;
      }
    }
  }
  return mask;
}

/**
 * Walk the whole space once, keeping counts and the best few timetables.
 *
 * Nothing is stored per solution, so memory stays flat no matter how large
 * the space is. If the budget runs out the result says so rather than
 * quietly presenting a partial answer as the whole truth.
 */
export function sweep(
  prepared: Prepared,
  budget: { maxNodes?: number; maxMillis?: number } = {},
): SweepResult {
  const { grid } = prepared;
  const eveningMask = eveningMaskOf(grid);
  const metrics = emptyMetrics();

  // Counters are dense arrays rather than objects: the search touches them
  // once per timetable, and property hashing at that rate dominates the cost.
  const byDayCount = new Float64Array(DAY_COUNT + 1);
  const byDaysMask = new Float64Array(1 << DAY_COUNT);
  const byGapHours = new Float64Array(MAX_GAP_HOURS + 1);
  const byStartSlot = new Float64Array(grid.slotsPerDay + 1);
  const byEndSlot = new Float64Array(grid.slotsPerDay + 2);
  const byEvenings = new Float64Array(DAY_COUNT + 1);

  const tops: { score: number; result: RenderedSchedule }[][] = SCORER_IDS.map(
    () => [],
  );
  const scores = new Float64Array(SCORER_IDS.length);
  const origin = grid.originMinutes;

  let examined = 0;
  const started = Date.now();

  const outcome = walk(prepared, budget, (buffer, base, chosen, index) => {
    measureInto(grid, buffer, eveningMask, metrics, base);
    examined = index + 1;

    const days = metrics.dayCount;
    const gaps = metrics.gapMinutes;

    byDayCount[days] += 1;
    byDaysMask[metrics.daysMask] += 1;
    byGapHours[gaps > MAX_GAP_MINUTES ? MAX_GAP_HOURS : (gaps / 60) | 0] += 1;
    byStartSlot[(metrics.earliestStart - origin) / SLOT_MINUTES] += 1;
    byEndSlot[(metrics.latestEnd - origin) / SLOT_MINUTES] += 1;
    byEvenings[metrics.eveningDays] += 1;

    // The seven rankings, spelled out inline. Calling seven scorer closures
    // per timetable costs more than the search itself at this scale; the
    // expressions must stay in step with SCORERS, which the tests check.
    scores[0] = days * 100000 + gaps;
    scores[1] = gaps * 100 + days;
    scores[2] = -gaps * 100 + days;
    scores[3] = -metrics.earliestStart * 100 + gaps;
    scores[4] = metrics.latestEnd * 100 + gaps;
    scores[5] = metrics.eveningDays * 100000 + gaps;
    scores[6] = metrics.campusMinutes * 100 + days;

    for (let preset = 0; preset < scores.length; preset += 1) {
      const entries = tops[preset];
      const score = scores[preset];
      if (entries.length === TOP_K && score >= entries[entries.length - 1].score) {
        continue;
      }
      insert(entries, score, render(prepared, chosen, index, { ...metrics }));
    }
    return true;
  });

  return {
    examined,
    truncated: outcome.truncated,
    facets: {
      byDayCount: denseToRecord(byDayCount),
      byDaysMask: denseToRecord(byDaysMask),
      byGapHours: denseToRecord(byGapHours),
      byStartTime: denseToRecord(byStartSlot, (i) => minutesOf(grid, i)),
      byEndTime: denseToRecord(byEndSlot, (i) => minutesOf(grid, i)),
      byEvenings: denseToRecord(byEvenings),
    },
    tops: Object.fromEntries(
      SCORER_IDS.map((id, preset) => [id, tops[preset].map((e) => e.result)]),
    ),
    elapsedMs: Date.now() - started,
  };
}

function minutesOf(grid: TimeGrid, slot: number): number {
  return grid.originMinutes + slot * SLOT_MINUTES;
}

function denseToRecord(
  counts: Float64Array,
  key: (index: number) => number = (index) => index,
): Record<number, number> {
  const record: Record<number, number> = {};
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] > 0) record[key(i)] = counts[i];
  }
  return record;
}

/**
 * The exact size of the space.
 *
 * Counting is several times cheaper than measuring, so the headline number
 * can be shown while the breakdown is still being computed - and a space too
 * large to measure in full can still be sized exactly.
 */
export function count(
  prepared: Prepared,
  budget: { maxNodes?: number; maxMillis?: number } = {},
): { total: number; exact: boolean } {
  let total = 0;
  const outcome = walk(prepared, budget, () => {
    total += 1;
    return true;
  });
  return { total, exact: !outcome.truncated };
}

/** One slice of the space, in the same order `sweep` used. */
export function page(
  prepared: Prepared,
  options: {
    filter?: FacetFilter;
    offset?: number;
    limit?: number;
    budget?: { maxNodes?: number; maxMillis?: number };
  } = {},
): PageResult {
  const { filter = {}, offset = 0, limit = 20 } = options;
  const schedules: RenderedSchedule[] = [];
  let matched = 0;

  const eveningMask = eveningMaskOf(prepared.grid);
  const metrics = emptyMetrics();

  const outcome = walk(prepared, options.budget ?? {}, (buffer, base, chosen) => {
    measureInto(prepared.grid, buffer, eveningMask, metrics, base);
    if (!passes(metrics, filter)) return true;

    const index = matched;
    matched += 1;
    if (index >= offset && schedules.length < limit) {
      schedules.push(render(prepared, chosen, index, { ...metrics }));
    }
    // Keep walking after the page is full only to finish the count; if the
    // count is already beyond what the UI shows, stop early.
    return !(schedules.length >= limit && matched > offset + limit + 10_000);
  });

  return { schedules, matched, truncated: outcome.truncated || outcome.stoppedEarly };
}

/**
 * Depth-first walk over the space, calling `visit` on each complete timetable.
 *
 * `visit` returns false to stop the walk. Options are tried in a fixed order
 * so two walks enumerate identically.
 */
function walk(
  prepared: Prepared,
  budget: { maxNodes?: number; maxMillis?: number },
  visit: (
    buffer: Uint32Array,
    /** Where this timetable's words start inside `buffer`. */
    base: number,
    chosen: number[],
    index: number,
  ) => boolean,
): { truncated: boolean; stoppedEarly: boolean } {
  const maxNodes = budget.maxNodes ?? DEFAULT_NODE_BUDGET;
  const maxMillis = budget.maxMillis ?? DEFAULT_TIME_BUDGET_MS;
  const deadline = Date.now() + maxMillis;

  const { plans, dayMasks, optionMasks, grid, maxDaysPerWeek } = prepared;
  const depth = plans.length;
  const wordCount = grid.wordCount;

  let nodes = 0;
  let index = 0;
  let truncated = false;
  let stoppedEarly = false;

  if (depth === 0 || plans.some((plan) => plan.options.length === 0)) {
    return { truncated: false, stoppedEarly: false };
  }

  const chosen = new Array<number>(depth).fill(0);
  // One buffer holding the running union at every level, so descending a
  // level is a write into the next slice rather than a fresh allocation.
  const used = new Uint32Array((depth + 1) * wordCount);

  const recurse = (level: number, daysUsed: number): boolean => {
    const here = level * wordCount;

    if (level === depth) {
      const keepGoing = visit(used, here, chosen, index);
      index += 1;
      if (!keepGoing) {
        stoppedEarly = true;
        return false;
      }
      return true;
    }

    const flat = optionMasks[level];
    const optionDays = dayMasks[level];
    const count = optionDays.length;
    const next = here + wordCount;

    for (let option = 0; option < count; option += 1) {
      nodes += 1;
      if ((nodes & 0x3fff) === 0 && (nodes > maxNodes || Date.now() > deadline)) {
        truncated = true;
        return false;
      }

      const from = option * wordCount;
      let clash = false;
      for (let w = 0; w < wordCount; w += 1) {
        if ((used[here + w] & flat[from + w]) !== 0) {
          clash = true;
          break;
        }
      }
      if (clash) continue;

      const days = daysUsed | optionDays[option];
      if (maxDaysPerWeek !== null && countBits(days) > maxDaysPerWeek) continue;

      for (let w = 0; w < wordCount; w += 1) {
        used[next + w] = used[here + w] | flat[from + w];
      }

      chosen[level] = option;
      if (!recurse(level + 1, days)) return false;
    }
    return true;
  };

  recurse(0, 0);
  return { truncated, stoppedEarly };
}

function render(
  prepared: Prepared,
  chosen: number[],
  index: number,
  metrics: ScheduleMetrics,
): RenderedSchedule {
  return {
    index,
    metrics,
    courses: prepared.plans.map((plan, level) => {
      const option = plan.options[chosen[level]];
      return {
        code: plan.code,
        name: plan.name,
        label: option.label,
        choice: option.choice,
        placements: option.placements,
      };
    }),
  };
}

function passes(metrics: ScheduleMetrics, filter: FacetFilter): boolean {
  if (filter.dayCount !== undefined && metrics.dayCount !== filter.dayCount) return false;
  if (filter.daysMask !== undefined && metrics.daysMask !== filter.daysMask) return false;
  if (filter.freeDays) {
    for (const day of filter.freeDays) {
      if ((metrics.daysMask & (1 << day)) !== 0) return false;
    }
  }
  const hours = Math.floor(metrics.gapMinutes / 60);
  if (filter.maxGapHours !== undefined && hours > filter.maxGapHours) return false;
  if (filter.minGapHours !== undefined && hours < filter.minGapHours) return false;
  if (filter.notBefore !== undefined && metrics.earliestStart < filter.notBefore) return false;
  if (filter.notAfter !== undefined && metrics.latestEnd > filter.notAfter) return false;
  if (filter.maxEvenings !== undefined && metrics.eveningDays > filter.maxEvenings) {
    return false;
  }
  return true;
}

/** Keep the best `TOP_K` entries, cheapest first. */
function insert(
  entries: { score: number; result: RenderedSchedule }[],
  score: number,
  result: RenderedSchedule,
): void {
  let at = entries.length;
  while (at > 0 && entries[at - 1].score > score) at -= 1;
  entries.splice(at, 0, { score, result });
  if (entries.length > TOP_K) entries.pop();
}

function countBits(value: number): number {
  let bits = 0;
  let word = value;
  while (word) {
    word &= word - 1;
    bits += 1;
  }
  return bits;
}


// --- explaining an empty result -------------------------------------------

export type Finding =
  | { kind: "course"; code: string; reason: string }
  | { kind: "pair"; codes: [string, string]; reason: string }
  | { kind: "drop"; code: string; reason: string };

/**
 * Why there are no timetables.
 *
 * "No results" is the least useful thing a scheduler can say, so this looks
 * for the specific obstruction: a course with nothing left after its filters,
 * a pair of courses whose every option collides, or - failing both - the one
 * course whose removal unblocks the rest.
 */
export function diagnose(prepared: Prepared): Finding[] {
  if (prepared.impossible.length > 0) {
    return prepared.impossible.map(({ code, reason }) => ({
      kind: "course" as const,
      code,
      reason,
    }));
  }

  const findings: Finding[] = [];
  const { plans, grid } = prepared;

  for (let a = 0; a < plans.length; a += 1) {
    for (let b = a + 1; b < plans.length; b += 1) {
      if (!anyCompatiblePair(prepared, a, b, grid.wordCount)) {
        findings.push({
          kind: "pair",
          codes: [plans[a].code, plans[b].code],
          reason:
            "every group of one clashes with every group of the other; " +
            "they cannot be taken in the same semester",
        });
      }
    }
  }
  if (findings.length > 0) return findings;

  // No single pair is at fault, so the clash only appears once several
  // courses are combined. Find which one, alone, is standing in the way.
  for (let skip = 0; skip < plans.length; skip += 1) {
    const without: Prepared = {
      ...prepared,
      plans: plans.filter((_, i) => i !== skip),
      dayMasks: prepared.dayMasks.filter((_, i) => i !== skip),
      optionMasks: prepared.optionMasks.filter((_, i) => i !== skip),
    };
    const { total } = count(without, { maxMillis: 1_000, maxNodes: 2_000_000 });
    if (total > 0) {
      findings.push({
        kind: "drop",
        code: plans[skip].code,
        reason: "the other courses fit together once this one is set aside",
      });
    }
  }

  return findings;
}

function anyCompatiblePair(
  prepared: Prepared,
  a: number,
  b: number,
  wordCount: number,
): boolean {
  const left = prepared.optionMasks[a];
  const right = prepared.optionMasks[b];
  const leftCount = prepared.plans[a].options.length;
  const rightCount = prepared.plans[b].options.length;

  for (let i = 0; i < leftCount; i += 1) {
    const from = i * wordCount;
    for (let j = 0; j < rightCount; j += 1) {
      const to = j * wordCount;
      let clash = false;
      for (let w = 0; w < wordCount; w += 1) {
        if ((left[from + w] & right[to + w]) !== 0) {
          clash = true;
          break;
        }
      }
      if (!clash) return true;
    }
  }
  return false;
}
