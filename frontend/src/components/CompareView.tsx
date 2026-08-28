import type { RenderedSchedule } from "../solver/engine";
import { colourOf, type Palette } from "../lib/colors";
import { formatHours, formatTime, type Band } from "../lib/time";
import { ScheduleGrid } from "./ScheduleGrid";

/**
 * The saved timetables, next to each other.
 *
 * Choosing between three good options is a different job from finding them:
 * it is about what actually differs. The table underneath the week highlights
 * exactly the courses whose group is not the same in every column, so the
 * decision comes down to a handful of rows rather than three full grids.
 */
export function CompareView({
  schedules,
  bands,
  colours,
  onRemove,
  onClose,
}: {
  schedules: RenderedSchedule[];
  bands: Band[];
  colours: Map<string, Palette>;
  onRemove: (index: number) => void;
  onClose: () => void;
}) {
  const rows = differences(schedules);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4">
      <div className="mx-auto w-full max-w-[110rem] rounded-2xl bg-slate-50 p-5 shadow-xl">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Comparing {schedules.length} timetable
              {schedules.length === 1 ? "" : "s"}
            </h3>
            <p className="text-sm text-slate-500">
              Rows that differ are highlighted below the weeks.
            </p>
          </div>
          <div className="flex gap-2">
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

        <div className="scroll-x flex gap-4 pb-2">
          {schedules.map((schedule, column) => (
            <section key={schedule.index} className="w-[34rem] shrink-0">
              <header className="mb-2 flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    #{(schedule.index + 1).toLocaleString("en")}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {schedule.metrics.dayCount} days ·{" "}
                    {formatHours(schedule.metrics.gapMinutes)} waiting · ends{" "}
                    {formatTime(schedule.metrics.latestEnd)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(column)}
                  className="no-print shrink-0 text-[11px] text-slate-400 hover:text-rose-600"
                >
                  remove
                </button>
              </header>
              <ScheduleGrid
                schedule={schedule}
                bands={bands}
                colours={colours}
                compact
              />
            </section>
          ))}
        </div>

        {schedules.length > 1 && (
          <div className="mt-5 scroll-x rounded-2xl border border-slate-200 bg-white p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5 font-semibold">Course</th>
                  {schedules.map((schedule) => (
                    <th key={schedule.index} className="px-2 py-1.5 font-semibold">
                      #{(schedule.index + 1).toLocaleString("en")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.code}
                    className={row.differs ? "bg-amber-50" : undefined}
                  >
                    <th className="max-w-56 truncate px-2 py-1.5 text-left font-medium text-slate-700">
                      <span
                        className={`mr-1.5 inline-block size-2 rounded-full align-middle ${colourOf(colours, row.code).dot}`}
                      />
                      {row.name}
                    </th>
                    {row.labels.map((label, column) => (
                      <td
                        key={column}
                        className={`px-2 py-1.5 ${
                          row.differs
                            ? "font-medium text-amber-900"
                            : "text-slate-500"
                        }`}
                      >
                        {label}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface DiffRow {
  code: string;
  name: string;
  labels: string[];
  differs: boolean;
}

/** One row per course, flagged when the chosen groups are not all the same. */
function differences(schedules: RenderedSchedule[]): DiffRow[] {
  if (schedules.length === 0) return [];

  const order = schedules[0].courses.map((c) => c.code);
  return order.map((code) => {
    const labels = schedules.map(
      (schedule) => schedule.courses.find((c) => c.code === code)?.label ?? "—",
    );
    return {
      code,
      name: schedules[0].courses.find((c) => c.code === code)?.name ?? code,
      labels,
      differs: new Set(labels).size > 1,
    };
  });
}
