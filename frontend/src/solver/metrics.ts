/**
 * Everything the ranking and the facets need, read straight off the bitmask.
 *
 * No session objects are touched here. A finished timetable is just its
 * occupied cells, and day count, waiting time, first and last class all fall
 * out of bit positions - which is what lets the solver score millions of
 * candidates without materialising any of them.
 *
 * This runs once per candidate timetable, so it allocates nothing: callers
 * pass in a scratch object that is overwritten in place, and the scorers take
 * plain numbers.
 */

import type { ScheduleMetrics } from "../types";
import { DAY_COUNT, SLOT_MINUTES, type TimeGrid, minutesOfSlot } from "./grid";

/** A class at or after this hour makes that day an evening on campus. */
export const EVENING_FROM_MINUTES = 17 * 60;

export function emptyMetrics(): ScheduleMetrics {
  return {
    daysMask: 0,
    dayCount: 0,
    gapMinutes: 0,
    campusMinutes: 0,
    earliestStart: 0,
    latestEnd: 0,
    eveningDays: 0,
  };
}

/**
 * The evening half of each word of a day, precomputed once so that counting
 * evening classes is a bit-and rather than a scan over every slot.
 */
export function eveningMaskOf(grid: TimeGrid): Uint32Array {
  const mask = new Uint32Array(grid.wordsPerDay);
  for (let slot = 0; slot < grid.slotsPerDay; slot += 1) {
    if (minutesOfSlot(grid, slot) >= EVENING_FROM_MINUTES) {
      mask[slot >>> 5] |= 1 << (slot & 31);
    }
  }
  return mask;
}

/**
 * Fill `out` with the measurements of `mask`.
 *
 * Slot indices, not clock times, are written to `earliestStart` and
 * `latestEnd`; `finalise` converts them once the winner is known, which keeps
 * a multiplication out of the inner loop.
 */
export function measureInto(
  grid: TimeGrid,
  mask: Uint32Array,
  eveningMask: Uint32Array,
  out: ScheduleMetrics,
  offset = 0,
): void {
  const wordsPerDay = grid.wordsPerDay;
  const origin = grid.originMinutes;
  let daysMask = 0;
  let dayCount = 0;
  let gapSlots = 0;
  let campusSlots = 0;
  let earliestSlot = 0x7fffffff;
  let latestSlot = -1;
  let evenings = 0;

  for (let day = 0; day < DAY_COUNT; day += 1) {
    const base = offset + day * wordsPerDay;

    let first = -1;
    let last = -1;
    let occupied = 0;
    let evening = 0;

    for (let w = 0; w < wordsPerDay; w += 1) {
      const word = mask[base + w];
      if (word !== 0) {
        // popcount and the bit scans are spelled out rather than called:
        // this loop runs once per candidate timetable, millions of times.
        let bits = word - ((word >>> 1) & 0x55555555);
        bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
        occupied += ((((bits + (bits >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24);

        const shift = w << 5;
        if (first < 0) first = shift + 31 - Math.clz32(word & -word);
        last = shift + 31 - Math.clz32(word);

        if ((word & eveningMask[w]) !== 0) evening = 1;
      }
    }
    if (first < 0) continue;
    evenings += evening;

    daysMask |= 1 << day;
    dayCount += 1;

    const span = last - first + 1;
    gapSlots += span - occupied;
    campusSlots += span;
    if (first < earliestSlot) earliestSlot = first;
    if (last > latestSlot) latestSlot = last;
  }

  out.daysMask = daysMask;
  out.dayCount = dayCount;
  out.gapMinutes = gapSlots * SLOT_MINUTES;
  out.campusMinutes = campusSlots * SLOT_MINUTES;
  out.eveningDays = evenings;
  out.earliestStart = latestSlot < 0 ? 0 : origin + earliestSlot * SLOT_MINUTES;
  out.latestEnd = latestSlot < 0 ? 0 : origin + (latestSlot + 1) * SLOT_MINUTES;
}

/** Convenience wrapper; allocates, so keep it out of the search. */
export function measure(grid: TimeGrid, mask: Uint32Array): ScheduleMetrics {
  const out = emptyMetrics();
  measureInto(grid, mask, eveningMaskOf(grid), out);
  return out;
}

/**
 * Ranking presets, lower is better. The order matches `SORT_PRESETS` so the
 * search can score into a plain array instead of a keyed object.
 */
export const SCORER_IDS = [
  "fewestDays",
  "leastGaps",
  "mostGaps",
  "latestStart",
  "earliestFinish",
  "fewestEvenings",
  "shortestDays",
] as const;

export type ScorerId = (typeof SCORER_IDS)[number];

export const SCORERS: Record<ScorerId, (m: ScheduleMetrics) => number> = {
  fewestDays: (m) => m.dayCount * 100000 + m.gapMinutes,
  leastGaps: (m) => m.gapMinutes * 100 + m.dayCount,
  mostGaps: (m) => -m.gapMinutes * 100 + m.dayCount,
  latestStart: (m) => -m.earliestStart * 100 + m.gapMinutes,
  earliestFinish: (m) => m.latestEnd * 100 + m.gapMinutes,
  fewestEvenings: (m) => m.eveningDays * 100000 + m.gapMinutes,
  shortestDays: (m) => m.campusMinutes * 100 + m.dayCount,
};

