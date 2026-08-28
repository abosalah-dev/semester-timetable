/**
 * The solver, off the main thread.
 *
 * Work arrives as one of three requests and answers stream back as they
 * become available, so the page can show the exact number of timetables long
 * before the breakdown that takes several seconds longer to compute.
 *
 * Every reply carries the `token` of the request it belongs to; the page
 * discards replies from a superseded request rather than trying to cancel,
 * which keeps rapid filter changes responsive.
 */

import type { CourseFilter, GlobalFilters, Semester } from "../types";
import {
  type FacetFilter,
  type Finding,
  type Prepared,
  count,
  diagnose,
  page,
  prepare,
  sweep,
} from "./engine";

/** Counting is cheap, so it gets a long leash; measuring gets a short one. */
const COUNT_BUDGET = { maxMillis: 12_000, maxNodes: 500_000_000 };
const SWEEP_BUDGET = { maxMillis: 6_000, maxNodes: 200_000_000 };
const PAGE_BUDGET = { maxMillis: 6_000, maxNodes: 200_000_000 };

export interface SolveRequest {
  type: "solve";
  token: number;
  semester: Semester;
  courses: string[];
  courseFilters: Record<string, CourseFilter>;
  globalFilters: GlobalFilters;
}

export interface PageRequest {
  type: "page";
  token: number;
  filter: FacetFilter;
  offset: number;
  limit: number;
}

export type WorkerRequest = SolveRequest | PageRequest;

export type WorkerReply =
  | { type: "counted"; token: number; total: number; exact: boolean }
  | {
      type: "swept";
      token: number;
      examined: number;
      truncated: boolean;
      facets: ReturnType<typeof sweep>["facets"];
      tops: ReturnType<typeof sweep>["tops"];
      elapsedMs: number;
    }
  | { type: "empty"; token: number; findings: Finding[] }
  | {
      type: "page";
      token: number;
      schedules: ReturnType<typeof page>["schedules"];
      matched: number;
      truncated: boolean;
    }
  | { type: "failed"; token: number; message: string };

/** Kept between requests so paging does not re-expand every course. */
let current: Prepared | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "solve") handleSolve(request);
    else handlePage(request);
  } catch (error) {
    reply({
      type: "failed",
      token: request.token,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

function handleSolve(request: SolveRequest): void {
  current = prepare(
    request.semester,
    request.courses,
    request.courseFilters,
    request.globalFilters,
  );

  const sized = count(current, COUNT_BUDGET);
  reply({
    type: "counted",
    token: request.token,
    total: sized.total,
    exact: sized.exact,
  });

  if (sized.total === 0) {
    reply({ type: "empty", token: request.token, findings: diagnose(current) });
    return;
  }

  const swept = sweep(current, SWEEP_BUDGET);
  reply({
    type: "swept",
    token: request.token,
    examined: swept.examined,
    truncated: swept.truncated,
    facets: swept.facets,
    tops: swept.tops,
    elapsedMs: swept.elapsedMs,
  });
}

function handlePage(request: PageRequest): void {
  if (!current) {
    reply({
      type: "failed",
      token: request.token,
      message: "no timetables have been generated yet",
    });
    return;
  }
  const result = page(current, {
    filter: request.filter,
    offset: request.offset,
    limit: request.limit,
    budget: PAGE_BUDGET,
  });
  reply({
    type: "page",
    token: request.token,
    schedules: result.schedules,
    matched: result.matched,
    truncated: result.truncated,
  });
}

function reply(message: WorkerReply): void {
  self.postMessage(message);
}
