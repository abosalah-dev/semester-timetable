import { useRef, useState } from "react";
import { downloadPng } from "../lib/exportImage";

import type { RenderedSchedule } from "../solver/engine";
import { colourOf, type Palette } from "../lib/colors";
import { downloadIcs } from "../lib/ics";
import { formatHours, formatTime, type Band } from "../lib/time";
import { ScheduleGrid } from "./ScheduleGrid";
import { FavouriteStar } from "./FavouritesBar";
import type { Placement } from "../solver/options";

/**
 * One timetable, full size.
 *
 * Alongside the week it lists exactly which groups this timetable commits the
 * student to - the thing they will type into the registration system - and
 * offers the two ways they will want to keep it: printed, or in their
 * calendar.
 */
export function ScheduleDetail({
  schedule,
  bands,
  colours,
  saved,
  onToggleFavourite,
  onBlockClick,
  onClose,
}: {
  schedule: RenderedSchedule;
  bands: Band[];
  colours: Map<string, Palette>;
  saved: boolean;
  onToggleFavourite: () => void;
  onBlockClick: (
    block: { code: string; name: string; placement: Placement },
    at: { x: number; y: number },
  ) => void;
  onClose: () => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printable = useRef<HTMLDivElement>(null);
  const { metrics } = schedule;

  const savePng = async () => {
    if (!printable.current) return;
    setSaving(true);
    setError(null);
    try {
      await downloadPng(printable.current, `timetable-${schedule.index + 1}.png`);
    } catch (problem) {
      setError(
        `${problem instanceof Error ? problem.message : "the image could not be produced"} — use Print instead.`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl rounded-2xl bg-slate-50 p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <FavouriteStar saved={saved} onToggle={onToggleFavourite} size="md" />
              Timetable #{(schedule.index + 1).toLocaleString("en")}
            </h3>
            <p className="text-sm text-slate-500">
              {metrics.dayCount} days on campus ·{" "}
              {formatHours(metrics.gapMinutes)} waiting · starts{" "}
              {formatTime(metrics.earliestStart)} · ends{" "}
              {formatTime(metrics.latestEnd)}
              {metrics.eveningDays > 0 &&
                ` · ${metrics.eveningDays} evening${metrics.eveningDays === 1 ? "" : "s"} on campus`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Semester starts
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={!startDate}
              title={
                startDate
                  ? "Download a calendar file"
                  : "Pick the date the semester starts first"
              }
              onClick={() => downloadIcs(schedule, new Date(`${startDate}T00:00:00`))}
              className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:ring-slate-400 disabled:opacity-40"
            >
              Add to calendar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={savePng}
              className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:ring-slate-400 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save as image"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 hover:ring-slate-400"
            >
              Print / save as PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <p className="no-print mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <p className="no-print mb-2 text-[11px] text-slate-400">
          Click any class to keep it, rule it out, avoid its lecturer, or block
          its time.
        </p>
        <div ref={printable} className="bg-white p-2">
          <ScheduleGrid
            schedule={schedule}
            bands={bands}
            colours={colours}
            onBlockClick={onBlockClick}
          />
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Groups to register
          </h4>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {schedule.courses.map((course) => (
              <li
                key={course.code}
                className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${colourOf(colours, course.code).dot}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {course.name}{" "}
                    <span className="font-normal text-slate-400">
                      {course.code}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600">{course.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {instructorsOf(course).join(", ") || "no lecturer listed"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function instructorsOf(course: RenderedSchedule["courses"][number]): string[] {
  const names = new Set<string>();
  for (const { session } of course.placements) {
    session.instructors.forEach((name) => names.add(name));
  }
  return [...names];
}
