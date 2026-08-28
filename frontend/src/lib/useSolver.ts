/**
 * React's view of the solver worker.
 *
 * The worker answers in stages - the exact number of timetables first, then
 * the breakdown, then whichever page was asked for - so the hook exposes each
 * stage separately and the UI can fill in as the answers arrive rather than
 * waiting behind one spinner.
 *
 * Requests are versioned by a token. A reply whose token is stale is dropped,
 * which is what keeps the results honest while the student is still dragging
 * filters around.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CourseFilter, GlobalFilters, Semester } from "../types";
import type { FacetFilter, Facets, Finding, RenderedSchedule } from "../solver/engine";
import type { WorkerReply, WorkerRequest } from "../solver/solver.worker";

export interface SolverState {
  running: boolean;
  /** Size of the whole space. `exact` is false only if counting timed out. */
  total: number | null;
  exact: boolean;
  /** How many timetables the breakdown below is based on. */
  examined: number | null;
  partialBreakdown: boolean;
  facets: Facets | null;
  tops: Record<string, RenderedSchedule[]> | null;
  findings: Finding[] | null;
  error: string | null;
}

export interface PageState {
  loading: boolean;
  schedules: RenderedSchedule[];
  matched: number;
  approximate: boolean;
}

const IDLE: SolverState = {
  running: false,
  total: null,
  exact: true,
  examined: null,
  partialBreakdown: false,
  facets: null,
  tops: null,
  findings: null,
  error: null,
};

export function useSolver() {
  const workerRef = useRef<Worker | null>(null);
  const solveToken = useRef(0);
  const pageToken = useRef(0);

  const [state, setState] = useState<SolverState>(IDLE);
  const [pageState, setPageState] = useState<PageState>({
    loading: false,
    schedules: [],
    matched: 0,
    approximate: false,
  });

  useEffect(() => {
    const worker = new Worker(
      new URL("../solver/solver.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;

      if (reply.type === "page") {
        if (reply.token !== pageToken.current) return;
        setPageState({
          loading: false,
          schedules: reply.schedules,
          matched: reply.matched,
          approximate: reply.truncated,
        });
        return;
      }

      if (reply.token !== solveToken.current) return;

      switch (reply.type) {
        case "counted":
          setState((prev) => ({
            ...prev,
            total: reply.total,
            exact: reply.exact,
            running: reply.total > 0,
          }));
          break;
        case "swept":
          setState((prev) => ({
            ...prev,
            running: false,
            examined: reply.examined,
            partialBreakdown: reply.truncated,
            facets: reply.facets,
            tops: reply.tops,
          }));
          break;
        case "empty":
          setState((prev) => ({
            ...prev,
            running: false,
            examined: 0,
            facets: null,
            tops: null,
            findings: reply.findings,
          }));
          break;
        case "failed":
          setState((prev) => ({ ...prev, running: false, error: reply.message }));
          break;
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const post = useCallback((request: WorkerRequest) => {
    workerRef.current?.postMessage(request);
  }, []);

  const solve = useCallback(
    (
      semester: Semester,
      courses: string[],
      courseFilters: Record<string, CourseFilter>,
      globalFilters: GlobalFilters,
    ) => {
      solveToken.current += 1;
      pageToken.current += 1;
      setState({ ...IDLE, running: courses.length > 0 });
      setPageState({ loading: false, schedules: [], matched: 0, approximate: false });

      if (courses.length === 0) return;
      post({
        type: "solve",
        token: solveToken.current,
        semester,
        courses,
        courseFilters,
        globalFilters,
      });
    },
    [post],
  );

  const fetchPage = useCallback(
    (filter: FacetFilter, offset: number, limit: number) => {
      pageToken.current += 1;
      setPageState((prev) => ({ ...prev, loading: true }));
      post({ type: "page", token: pageToken.current, filter, offset, limit });
    },
    [post],
  );

  return useMemo(
    () => ({ state, page: pageState, solve, fetchPage }),
    [state, pageState, solve, fetchPage],
  );
}
