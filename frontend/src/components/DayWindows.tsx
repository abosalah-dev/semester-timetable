import { useState } from "react";

import { DAY_LABELS, WEEK, type Day, type GlobalFilters } from "../types";
import { Hint } from "./FilterLegend";

/**
 * Hours for one day, when they differ from the rest of the week.
 *
 * Most students have one working day and set it once at the top. This is for
 * the exception - the day with a job in the afternoon, or the one they can
 * only reach campus late. It stays collapsed until asked for, so the common
 * case is not buried under six rows of empty time fields.
 */
export function DayWindows({
  global,
  onChange,
}: {
  global: GlobalFilters;
  onChange: (next: GlobalFilters) => void;
}) {
  const windows = global.dayWindows ?? {};
  const set = Object.entries(windows).filter(
    ([, window]) => window?.start || window?.end,
  );
  const [open, setOpen] = useState(set.length > 0);

  const days = WEEK.filter((day) => day !== "FRIDAY");

  const update = (day: Day, part: "start" | "end", value: string) => {
    const current = windows[day] ?? { start: null, end: null };
    const next = { ...current, [part]: value || null };
    const all = { ...windows, [day]: next };
    if (!next.start && !next.end) delete all[day];
    onChange({ ...global, dayWindows: all });
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-medium text-slate-600">
          Different hours on a particular day
          {set.length > 0 && (
            <span className="ml-1 text-sky-600">· {set.length} set</span>
          )}
        </span>
        <span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <>
          <Hint>
            Leave a box empty and that day follows the hours above.
          </Hint>
          <table className="mt-2 w-full text-[11px]">
            <thead>
              <tr className="text-slate-400">
                <th />
                <th className="font-medium">from</th>
                <th className="font-medium">to</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const window = windows[day];
                const active = Boolean(window?.start || window?.end);
                return (
                  <tr key={day}>
                    <th
                      className={`py-0.5 pr-2 text-right font-medium ${
                        active ? "text-sky-700" : "text-slate-500"
                      }`}
                    >
                      {DAY_LABELS[day].slice(0, 3)}
                    </th>
                    <td className="py-0.5">
                      <TimeCell
                        value={window?.start ?? ""}
                        placeholder={global.earliestStart ?? "any"}
                        onChange={(value) => update(day, "start", value)}
                      />
                    </td>
                    <td className="py-0.5 pl-1">
                      <TimeCell
                        value={window?.end ?? ""}
                        placeholder={global.latestEnd ?? "any"}
                        onChange={(value) => update(day, "end", value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {set.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...global, dayWindows: {} })}
              className="mt-1.5 text-[11px] text-slate-500 underline hover:text-slate-800"
            >
              Clear all day hours
            </button>
          )}
        </>
      )}
    </div>
  );
}

function TimeCell({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      step={1800}
      value={value}
      title={value ? undefined : `follows the week: ${placeholder}`}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded border px-1 py-0.5 text-[11px] ${
        value
          ? "border-sky-300 bg-sky-50 text-slate-800"
          : "border-slate-200 bg-white text-slate-400"
      }`}
    />
  );
}
