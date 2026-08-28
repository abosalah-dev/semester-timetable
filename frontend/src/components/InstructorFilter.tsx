import { useMemo, useState } from "react";

import type { GlobalFilters, Semester } from "../types";
import { instructorsOf } from "../solver/options";
import { Hint } from "./FilterLegend";

/**
 * Lecturers, across the whole timetable.
 *
 * Ruling out a lecturer is a decision about the semester, not about one
 * course, and having to repeat it inside every course was how it worked
 * before. The list here covers everyone teaching anything the student has
 * chosen, with the count of courses each one appears in, so the effect of a
 * rule is visible before it is applied.
 */
export function InstructorFilter({
  semester,
  selected,
  global,
  onChange,
}: {
  semester: Semester;
  selected: string[];
  global: GlobalFilters;
  onChange: (next: GlobalFilters) => void;
}) {
  const [query, setQuery] = useState("");

  const lecturers = useMemo(() => {
    const courses = semester.courses.filter((c) => selected.includes(c.code));
    const counts = new Map<string, string[]>();
    for (const course of courses) {
      for (const name of instructorsOf(course)) {
        counts.set(name, [...(counts.get(name) ?? []), course.code]);
      }
    }
    return [...counts.entries()]
      .map(([name, codes]) => ({ name, codes }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [semester, selected]);

  const excluded = global.excludedInstructors ?? [];
  const required = global.requiredInstructors ?? [];

  // Cheap enough to redo each render, and the rules it reads change on every
  // click anyway. Lecturers already ruled on are pinned to the top so they
  // stay visible while searching for the next one.
  const needle = query.trim().toLowerCase();
  const isRuled = (name: string) =>
    excluded.includes(name) || required.includes(name);
  const matches = [
    ...lecturers.filter((l) => isRuled(l.name)),
    ...lecturers.filter(
      (l) => !isRuled(l.name) && l.name.toLowerCase().includes(needle),
    ),
  ];

  if (selected.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Lecturers — all courses
      </h2>
      <Hint>
        A rule here applies to every course at once. Wanting a lecturer only
        affects the classes they actually give — asking for a lecturer does
        not rule out that course's labs.
      </Hint>

      {lecturers.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">
          No lecturer is named for these courses.
        </p>
      ) : (
        <>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a lecturer…"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky-500"
          />
          <ul className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {matches.map(({ name, codes }) => {
              const want = required.includes(name);
              const avoid = excluded.includes(name);
              return (
                <li key={name}>
                  <button
                    type="button"
                    title={
                      want
                        ? "Wanted — click to rule out instead"
                        : avoid
                          ? "Ruled out — click to clear"
                          : "Click to keep only this lecturer's groups"
                    }
                    onClick={() => onChange(cycle(global, name))}
                    className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-xs transition ${
                      want
                        ? "bg-emerald-100 text-emerald-900"
                        : avoid
                          ? "bg-rose-50 text-rose-400 line-through"
                          : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="shrink-0 text-[10px] opacity-60">
                      {codes.length === 1 ? codes[0] : `${codes.length} courses`}
                    </span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 && (
              <li className="px-2 py-2 text-xs text-slate-400">
                Nobody matches “{query}”.
              </li>
            )}
          </ul>

          {(excluded.length > 0 || required.length > 0) && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...global,
                  excludedInstructors: [],
                  requiredInstructors: [],
                })
              }
              className="mt-1 text-[11px] text-slate-500 underline hover:text-slate-800"
            >
              Clear lecturer rules
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Untouched → want this lecturer → avoid this lecturer → untouched. */
function cycle(global: GlobalFilters, name: string): GlobalFilters {
  const required = global.requiredInstructors ?? [];
  const excluded = global.excludedInstructors ?? [];

  if (required.includes(name)) {
    return {
      ...global,
      requiredInstructors: required.filter((n) => n !== name),
      excludedInstructors: [...excluded, name],
    };
  }
  if (excluded.includes(name)) {
    return { ...global, excludedInstructors: excluded.filter((n) => n !== name) };
  }
  return { ...global, requiredInstructors: [...required, name] };
}
