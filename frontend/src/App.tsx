import { useCallback, useEffect, useMemo, useState } from "react";

import {
  EMPTY_COURSE_FILTER,
  EMPTY_GLOBAL_FILTERS,
  type CourseFilter,
  type GlobalFilters,
  type Semester,
} from "./types";
import type { RenderedSchedule } from "./solver/engine";
import type { Placement } from "./solver/options";
import { paletteFor } from "./lib/colors";
import { bandsOf } from "./lib/time";
import { useSolver } from "./lib/useSolver";
import {
  forgetShare,
  sharedSelection,
  shareUrl as buildShareUrl,
} from "./lib/share";
import * as storage from "./lib/storage";
import { BlockMenu, type BlockTarget } from "./components/BlockMenu";
import { CompareView } from "./components/CompareView";
import { CoursePicker } from "./components/CoursePicker";
import { Diagnostics } from "./components/Diagnostics";
import { FavouritesBar } from "./components/FavouritesBar";
import { FilterPanel } from "./components/FilterPanel";
import { ParseReview } from "./components/ParseReview";
import { ResultsBrowser } from "./components/ResultsBrowser";
import { ScheduleDetail } from "./components/ScheduleDetail";
import { UploadStep } from "./components/UploadStep";

type Step = "upload" | "review" | "build";

export default function App() {
  // Both the stored session and the link are read before the first render, so
  // a refresh comes straight back to the results instead of flashing the
  // upload screen on its way there.
  //
  // A link carries the courses and their rules but not the semester: that is
  // the same large file for everyone in the faculty, and whoever opens the
  // link either has it already or reads it once. The two combine - the link
  // decides what is selected, the browser supplies what was read.
  const [link] = useState(sharedSelection);
  const [saved] = useState(storage.load);

  const [step, setStep] = useState<Step>(saved ? "build" : "upload");
  const [semester, setSemester] = useState<Semester | null>(saved?.semester ?? null);
  const [selected, setSelected] = useState<string[]>(
    link?.courses ?? saved?.courses ?? [],
  );
  const [global, setGlobal] = useState<GlobalFilters>(
    link?.global ?? { ...EMPTY_GLOBAL_FILTERS, ...(saved?.global ?? {}) },
  );
  const [courseFilters, setCourseFilters] = useState<Record<string, CourseFilter>>(
    link?.courseFilters ?? saved?.courseFilters ?? {},
  );

  // Like the share link, an opened timetable belongs to the question that
  // produced it. Changing the question does not "close" it so much as make it
  // no longer one of the answers, so it is tagged and checked when rendering
  // rather than cleared from an effect.
  const [open, setOpen] = useState<{ schedule: RenderedSchedule; key: string } | null>(null);
  const [favourites, setFavourites] = useState<RenderedSchedule[]>(
    saved?.favourites ?? [],
  );
  const [comparing, setComparing] = useState(false);
  const [blockMenu, setBlockMenu] = useState<BlockTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The link is tied to the question it was made for; when the question
  // changes the link is simply no longer the current one, which is a fact to
  // derive rather than a piece of state to reset.
  const [shareUrl, setShareUrl] = useState<{ url: string; key: string } | null>(null);
  /** A link's courses, waiting for a schedule to apply them to. */
  const pendingLink = link && !saved ? link : null;

  const { state, page, solve, fetchPage } = useSolver();

  // Bands follow the chosen courses, so the rows are as coarse as the
  // student's own timetable allows.
  const bands = useMemo(() => {
    if (!semester) return [];
    const chosen = semester.courses.filter((c) => selected.includes(c.code));
    return bandsOf(chosen.length > 0 ? chosen : semester.courses);
  }, [semester, selected]);
  const colours = useMemo(() => paletteFor(selected), [selected]);

  /** Identifies the current question, so dependent views reset with it. */
  const queryKey = useMemo(
    () => JSON.stringify([selected, courseFilters, global]),
    [selected, courseFilters, global],
  );

  // Any change to the question re-asks it. The worker versions its replies, so
  // a fast sequence of edits settles on the last one.
  useEffect(() => {
    if (semester) solve(semester, selected, courseFilters, global);
  }, [semester, selected, courseFilters, global, solve]);

  // Keep the session for the next refresh.
  useEffect(() => {
    if (!semester) return;
    storage.save({ semester, courses: selected, courseFilters, global, favourites });
  }, [semester, selected, courseFilters, global, favourites]);

  const startOver = useCallback(() => {
    storage.clear();
    forgetShare();
    setSemester(null);
    setSelected([]);
    setCourseFilters({});
    setGlobal(EMPTY_GLOBAL_FILTERS);
    setFavourites([]);
    setOpen(null);
    setStep("upload");
  }, []);

  const createLink = useCallback(async () => {
    const url = buildShareUrl({ courses: selected, courseFilters, global });
    setShareUrl({ url, key: queryKey });
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  }, [selected, courseFilters, global, queryKey]);

  const announce = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(
      () => setNotice((current) => (current === message ? null : current)),
      4000,
    );
  }, []);

  /**
   * A rule set from the timetable itself.
   *
   * The open timetable is an answer to the old question, so it closes; the
   * message says what changed, because the results underneath will have moved.
   */
  const applyFromBlock = useCallback(
    (change: () => void, description: string) => {
      change();
      setBlockMenu(null);
      setOpen(null);
      announce(description);
    },
    [announce],
  );

  const onBlockClick = useCallback(
    (
      block: { code: string; name: string; placement: Placement },
      at: { x: number; y: number },
    ) => {
      setBlockMenu({
        courseCode: block.code,
        courseName: block.name,
        placement: block.placement,
        at,
      });
    },
    [],
  );

  const toggleFavourite = useCallback((schedule: RenderedSchedule) => {
    setFavourites((current) =>
      current.some((s) => s.index === schedule.index)
        ? current.filter((s) => s.index !== schedule.index)
        : [...current, schedule],
    );
  }, []);

  if (step === "upload" || !semester) {
    return (
      <Shell>
        <UploadStep
          pendingCourses={pendingLink?.courses ?? null}
          onParsed={(parsed) => {
            setSemester(parsed);
            // A link's courses are already in state; only a fresh upload with
            // no link behind it starts from nothing.
            if (!pendingLink) {
              setSelected([]);
              setCourseFilters({});
              setGlobal(EMPTY_GLOBAL_FILTERS);
            }
            setFavourites([]);
            forgetShare();
            setStep("review");
          }}
        />
      </Shell>
    );
  }

  if (step === "review") {
    return (
      <Shell>
        <ParseReview
          semester={semester}
          onContinue={() => setStep("build")}
          onStartOver={startOver}
        />
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Sidebar
          onUploadAgain={startOver}
          onShare={createLink}
          canShare={selected.length > 0}
          shareUrl={shareUrl?.key === queryKey ? shareUrl.url : null}
        >
          <CoursePicker
            semester={semester}
            selected={selected}
            colours={colours}
            onToggle={(code) =>
              setSelected((current) =>
                current.includes(code)
                  ? current.filter((c) => c !== code)
                  : [...current, code],
              )
            }
          />

          <FilterPanel
            semester={semester}
            selected={selected}
            global={global}
            bands={bands}
            courseFilters={courseFilters}
            onGlobal={setGlobal}
            onCourseFilter={(code, next) =>
              setCourseFilters((current) => ({ ...current, [code]: next }))
            }
          />
        </Sidebar>

        <main className="min-w-0">
          <FavouritesBar
            favourites={favourites}
            onOpen={(schedule) => setOpen({ schedule, key: queryKey })}
            onCompare={() => setComparing(true)}
            onClear={() => setFavourites([])}
          />

          {selected.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
              Pick the courses you are taking this semester and every
              conflict-free timetable will appear here.
            </p>
          )}

          {state.error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {state.error}
            </p>
          )}

          {selected.length > 0 && state.total === null && !state.error && (
            <p className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">
              Working through the combinations…
            </p>
          )}

          {state.total === 0 && state.findings && (
            <Diagnostics
              findings={state.findings}
              semester={semester}
              global={global}
              onRelax={setGlobal}
            />
          )}

          {state.total !== null && state.total > 0 && (
            <ResultsBrowser
              key={queryKey}
              state={state}
              page={page}
              bands={bands}
              colours={colours}
              favourites={favourites}
              onFetchPage={fetchPage}
              onOpen={(schedule) => setOpen({ schedule, key: queryKey })}
              onToggleFavourite={toggleFavourite}
            />
          )}
        </main>
      </div>

      {open?.key === queryKey && (
        <ScheduleDetail
          schedule={open.schedule}
          bands={bands}
          colours={colours}
          saved={favourites.some((s) => s.index === open.schedule.index)}
          onToggleFavourite={() => toggleFavourite(open.schedule)}
          onBlockClick={onBlockClick}
          onClose={() => setOpen(null)}
        />
      )}

      {blockMenu && (
        <BlockMenu
          target={blockMenu}
          courseFilter={courseFilters[blockMenu.courseCode] ?? EMPTY_COURSE_FILTER}
          global={global}
          onCourseFilter={(code, next, description) =>
            applyFromBlock(
              () => setCourseFilters((current) => ({ ...current, [code]: next })),
              description,
            )
          }
          onGlobal={(next, description) =>
            applyFromBlock(() => setGlobal(next), description)
          }
          onClose={() => setBlockMenu(null)}
        />
      )}

      {comparing && (
        <CompareView
          schedules={favourites}
          bands={bands}
          colours={colours}
          onRemove={(at) =>
            setFavourites((current) => current.filter((_, i) => i !== at))
          }
          onClose={() => setComparing(false)}
        />
      )}

      {notice && (
        <div className="no-print fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {notice}
        </div>
      )}
    </Shell>
  );
}

/**
 * The filter column.
 *
 * On a phone it collapses behind a button: it is taller than the screen, and
 * leaving it open would push the timetables far below the fold.
 */
function Sidebar({
  children,
  onUploadAgain,
  onShare,
  canShare,
  shareUrl,
}: {
  children: React.ReactNode;
  onUploadAgain: () => void;
  onShare: () => void;
  canShare: boolean;
  shareUrl: string | null;
}) {
  const [openOnMobile, setOpenOnMobile] = useState(false);

  return (
    <aside className="no-print min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpenOnMobile((value) => !value)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white lg:hidden"
        >
          {openOnMobile ? "Hide filters" : "Courses & filters"}
        </button>
        <button
          type="button"
          onClick={onUploadAgain}
          className="rounded-lg bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200 hover:ring-slate-400"
        >
          Upload again
        </button>
        <button
          type="button"
          disabled={!canShare}
          onClick={onShare}
          title="Copies a link carrying these courses and filters"
          className="rounded-lg bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200 hover:ring-slate-400 disabled:opacity-40"
        >
          Share
        </button>
      </div>

      {shareUrl && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-900">
          Link copied. Anyone who opens it sees these courses and filters:
          <br />
          <span className="break-all font-mono">{shareUrl}</span>
        </p>
      )}

      <div className={`mt-4 space-y-6 ${openOnMobile ? "" : "hidden lg:block"}`}>
        {children}
      </div>
    </aside>
  );
}

function Shell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className={wide ? "mx-auto max-w-[100rem]" : "mx-auto max-w-5xl"}>
        {children}
      </div>
    </div>
  );
}
