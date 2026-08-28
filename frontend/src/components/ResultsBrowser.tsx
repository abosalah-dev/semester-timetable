import { useEffect, useMemo, useState } from "react";

import { DAY_LABELS, SORT_PRESETS, WEEK, type Day } from "../types";
import type { FacetFilter, Facets, RenderedSchedule } from "../solver/engine";
import type { PageState, SolverState } from "../lib/useSolver";
import type { Palette } from "../lib/colors";
import type { Band } from "../lib/time";
import { formatHours, formatTime } from "../lib/time";
import { ScheduleGrid } from "./ScheduleGrid";
import { FavouriteStar } from "./FavouritesBar";

const PAGE_SIZE = 12;

/**
 * Browsing every possible timetable.
 *
 * The space can hold millions, so it is never listed: the header states its
 * exact size, the facets slice it by the things students actually care about
 * (which day is free, how much waiting, how late it runs), and the list pages
 * straight into it - including by number, so any timetable is reachable.
 */
export function ResultsBrowser({
  state,
  page,
  bands,
  colours,
  favourites,
  onFetchPage,
  onOpen,
  onToggleFavourite,
}: {
  state: SolverState;
  page: PageState;
  bands: Band[];
  colours: Map<string, Palette>;
  favourites: RenderedSchedule[];
  onFetchPage: (filter: FacetFilter, offset: number, limit: number) => void;
  onOpen: (schedule: RenderedSchedule) => void;
  onToggleFavourite: (schedule: RenderedSchedule) => void;
}) {
  const [filter, setFilter] = useState<FacetFilter>({});
  const [offset, setOffset] = useState(0);
  const [preset, setPreset] = useState<string | null>(null);

  // Asking a different question mounts a fresh browser (App keys this
  // component on the question), so there is no stale facet or page to reset.

  useEffect(() => {
    if (preset === null && state.total && state.total > 0) {
      onFetchPage(filter, offset, PAGE_SIZE);
    }
  }, [filter, offset, preset, state.total, onFetchPage]);

  const shown = useMemo(() => {
    if (preset && state.tops) return state.tops[preset] ?? [];
    return page.schedules;
  }, [preset, state.tops, page.schedules]);

  // With no facet chosen the listing covers the whole space, and the size of
  // that is already known - a better number than the one the paging walk
  // stops counting at, and it keeps the pager agreeing with the headline.
  const unfiltered = Object.keys(filter).length === 0;
  const matched = unfiltered
    ? Math.max(state.total ?? 0, page.matched)
    : page.matched;
  const approximate = unfiltered
    ? !state.exact || (page.approximate && page.matched > (state.total ?? 0))
    : page.approximate;

  if (state.total === null) return null;

  return (
    <div>
      <Header state={state} />

      {state.facets && (
        <FacetBar
          facets={state.facets}
          total={state.examined ?? state.total}
          filter={filter}
          onChange={(next) => {
            setPreset(null);
            setOffset(0);
            setFilter(next);
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Show me the best for
        </span>
        {SORT_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.hint}
            onClick={() => {
              setPreset((current) => (current === option.id ? null : option.id));
              setOffset(0);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
              preset === option.id
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {preset && (
        <p className="mt-3 text-sm text-slate-500">
          The {shown.length} best timetables for{" "}
          <strong className="text-slate-700">
            {SORT_PRESETS.find((p) => p.id === preset)?.label.toLowerCase()}
          </strong>
          {state.partialBreakdown && ", from the part of the space that was ranked"}.{" "}
          <button
            type="button"
            onClick={() => setPreset(null)}
            className="underline hover:text-slate-800"
          >
            Browse all instead
          </button>
        </p>
      )}

      {!preset && (
        <Pager
          offset={offset}
          count={shown.length}
          matched={matched}
          approximate={approximate}
          loading={page.loading}
          onOffset={setOffset}
        />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {shown.map((schedule) => (
          <Card
            key={schedule.index}
            schedule={schedule}
            bands={bands}
            colours={colours}
            saved={favourites.some((s) => s.index === schedule.index)}
            onOpen={() => onOpen(schedule)}
            onToggleFavourite={() => onToggleFavourite(schedule)}
          />
        ))}
      </div>

      {shown.length === 0 && !page.loading && (
        <p className="mt-6 rounded-xl bg-white px-4 py-8 text-center text-sm text-slate-400">
          Nothing matches these facets. Clear one to see more.
        </p>
      )}

      {!preset && shown.length > 0 && (
        <Pager
          offset={offset}
          count={shown.length}
          matched={matched}
          approximate={approximate}
          loading={page.loading}
          onOffset={setOffset}
        />
      )}
    </div>
  );
}

function Header({ state }: { state: SolverState }) {
  if (state.total === 0) return null;
  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900">
        {state.total?.toLocaleString("en")}
        {!state.exact && "+"} possible timetable
        {state.total === 1 ? "" : "s"}
      </h2>
      {!state.exact && (
        <p className="mt-1 text-sm text-amber-700">
          Counting stopped at this point — there are at least this many. Add a
          filter for an exact number.
        </p>
      )}
      {state.partialBreakdown && state.examined !== null && (
        <p className="mt-1 text-sm text-amber-700">
          The breakdown and rankings below are based on the first{" "}
          {state.examined.toLocaleString("en")} of them.
        </p>
      )}
      {state.running && (
        <p className="mt-1 text-sm text-slate-500">Working out the breakdown…</p>
      )}
    </div>
  );
}

function FacetBar({
  facets,
  total,
  filter,
  onChange,
}: {
  facets: Facets;
  total: number;
  filter: FacetFilter;
  onChange: (next: FacetFilter) => void;
}) {
  const freeDayCounts = WEEK.map((_, index) =>
    Object.entries(facets.byDaysMask).reduce(
      (sum, [mask, count]) =>
        (Number(mask) & (1 << index)) === 0 ? sum + count : sum,
      0,
    ),
  );

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <Row label="Days on campus">
        {entries(facets.byDayCount).map(([days, count]) => (
          <Chip
            key={days}
            active={filter.dayCount === days}
            count={count}
            total={total}
            onClick={() =>
              onChange({
                ...filter,
                dayCount: filter.dayCount === days ? undefined : days,
              })
            }
          >
            {days} day{days === 1 ? "" : "s"}
          </Chip>
        ))}
      </Row>

      <Row label="Day off">
        {WEEK.map((day, index) => {
          if (day === "FRIDAY" || freeDayCounts[index] === 0) return null;
          const active = (filter.freeDays ?? []).includes(index);
          return (
            <Chip
              key={day}
              active={active}
              count={freeDayCounts[index]}
              total={total}
              onClick={() => {
                const current = filter.freeDays ?? [];
                onChange({
                  ...filter,
                  freeDays: active
                    ? current.filter((d) => d !== index)
                    : [...current, index],
                });
              }}
            >
              {DAY_LABELS[day as Day].slice(0, 3)} free
            </Chip>
          );
        })}
      </Row>

      <Row label="Waiting between classes">
        {entries(facets.byGapHours).map(([hours, count]) => (
          <Chip
            key={hours}
            active={filter.maxGapHours === hours && filter.minGapHours === hours}
            count={count}
            total={total}
            onClick={() =>
              onChange(
                filter.maxGapHours === hours && filter.minGapHours === hours
                  ? { ...filter, maxGapHours: undefined, minGapHours: undefined }
                  : { ...filter, maxGapHours: hours, minGapHours: hours },
              )
            }
          >
            {hours === 0 ? "none" : `${hours}h`}
          </Chip>
        ))}
      </Row>

      <Row label="Starts no earlier than">
        {entries(facets.byStartTime).map(([minutes, count]) => (
          <Chip
            key={minutes}
            active={filter.notBefore === minutes}
            count={count}
            total={total}
            onClick={() =>
              onChange({
                ...filter,
                notBefore: filter.notBefore === minutes ? undefined : minutes,
              })
            }
          >
            {formatTime(minutes)}
          </Chip>
        ))}
      </Row>

      <Row label="Evenings on campus">
        {entries(facets.byEvenings).map(([count_, count]) => (
          <Chip
            key={count_}
            active={filter.maxEvenings === count_}
            count={count}
            total={total}
            onClick={() =>
              onChange({
                ...filter,
                maxEvenings: filter.maxEvenings === count_ ? undefined : count_,
              })
            }
          >
            {count_ === 0 ? "none" : `${count_} or fewer`}
          </Chip>
        ))}
      </Row>

      {Object.keys(filter).length > 0 && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-xs text-slate-500 underline hover:text-slate-800"
        >
          Clear all facets
        </button>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-44 shrink-0 text-xs font-medium text-slate-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{items}</div>
    </div>
  );
}

function Chip({
  active,
  count,
  total,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  total: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${count.toLocaleString("en")} of ${total.toLocaleString("en")}`}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition ${
        active
          ? "bg-sky-600 text-white ring-sky-600"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400"
      }`}
    >
      {children}
      <span className={`ml-1.5 ${active ? "text-sky-100" : "text-slate-400"}`}>
        {compact(count)}
      </span>
    </button>
  );
}

function Pager({
  offset,
  count,
  matched,
  approximate,
  loading,
  onOffset,
}: {
  offset: number;
  count: number;
  matched: number;
  approximate: boolean;
  loading: boolean;
  onOffset: (offset: number) => void;
}) {
  const [jump, setJump] = useState("");

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={offset === 0 || loading}
        onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}
        className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-sm text-slate-600">
        {loading
          ? "Finding…"
          : count === 0
            ? "none"
            : `${(offset + 1).toLocaleString("en")}–${(offset + count).toLocaleString("en")} of ${matched.toLocaleString("en")}${approximate ? "+" : ""}`}
      </span>
      <button
        type="button"
        disabled={loading || offset + count >= matched}
        onClick={() => onOffset(offset + PAGE_SIZE)}
        className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 disabled:opacity-40"
      >
        Next
      </button>

      <form
        className="ml-auto flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const target = Number(jump);
          if (Number.isFinite(target) && target >= 1) onOffset(target - 1);
        }}
      >
        <label className="text-xs text-slate-500">Jump to number</label>
        <input
          value={jump}
          onChange={(event) => setJump(event.target.value)}
          inputMode="numeric"
          placeholder="1"
          className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
      </form>
    </div>
  );
}

function Card({
  schedule,
  bands,
  colours,
  saved,
  onOpen,
  onToggleFavourite,
}: {
  schedule: RenderedSchedule;
  bands: Band[];
  colours: Map<string, Palette>;
  saved: boolean;
  onOpen: () => void;
  onToggleFavourite: () => void;
}) {
  const { metrics } = schedule;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-400 hover:shadow-md"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <FavouriteStar saved={saved} onToggle={onToggleFavourite} />
          #{(schedule.index + 1).toLocaleString("en")}
        </span>
        <span className="text-xs text-slate-500">
          {metrics.dayCount} days · {formatHours(metrics.gapMinutes)} waiting ·
          ends {formatTime(metrics.latestEnd)}
        </span>
      </div>
      <ScheduleGrid schedule={schedule} bands={bands} colours={colours} compact />
      <span className="mt-2 block text-xs text-sky-600 opacity-0 transition group-hover:opacity-100">
        Open full size →
      </span>
    </button>
  );
}

function entries(counter: Record<number, number>): [number, number][] {
  return Object.entries(counter)
    .map(([key, value]) => [Number(key), value] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}
