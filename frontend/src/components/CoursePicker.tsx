import { useMemo, useState } from "react";

import type { Course, Semester } from "../types";
import { colourOf, type Palette } from "../lib/colors";

/**
 * Choosing what to take.
 *
 * The faculty list runs to dozens of courses, so search comes first and the
 * chosen ones are pulled to the top. Each row shows what the course will cost
 * in commitments - how many lecture, lab or tutorial groups it offers - which
 * is the number that decides how much freedom the timetable will have.
 */
export function CoursePicker({
  semester,
  selected,
  colours,
  onToggle,
}: {
  semester: Semester;
  selected: string[];
  colours: Map<string, Palette>;
  onToggle: (code: string) => void;
}) {
  const [query, setQuery] = useState("");

  const chosen = useMemo(
    () =>
      selected
        .map((code) => semester.courses.find((c) => c.code === code))
        .filter((c): c is Course => Boolean(c)),
    [selected, semester],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return semester.courses.filter((course) => {
      if (selected.includes(course.code)) return false;
      if (!needle) return true;
      return (
        course.code.toLowerCase().includes(needle) ||
        course.name.toLowerCase().includes(needle)
      );
    });
  }, [query, selected, semester]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Courses
        </h2>
        <span className="text-xs text-slate-400">{selected.length} chosen</span>
      </div>

      {chosen.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {chosen.map((course) => (
            <li key={course.code}>
              <button
                type="button"
                onClick={() => onToggle(course.code)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${colourOf(colours, course.code).bg} ${colourOf(colours, course.code).border}`}
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ${colourOf(colours, course.code).dot}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {course.name}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {course.code} · {describe(course)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">remove</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by code or name…"
        className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
      />

      <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto pr-1">
        {matches.map((course) => (
          <li key={course.code}>
            <button
              type="button"
              onClick={() => onToggle(course.code)}
              className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-slate-100"
            >
              <span className="block truncate text-sm text-slate-800">
                {course.name}
              </span>
              <span className="block text-[11px] text-slate-500">
                {course.code} · {describe(course)}
              </span>
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-2.5 py-3 text-sm text-slate-400">
            No course matches “{query}”.
          </li>
        )}
      </ul>
    </div>
  );
}

function describe(course: Course): string {
  return course.components
    .map((component) => `${component.groups.length} ${component.type.toLowerCase()}`)
    .join(", ");
}
