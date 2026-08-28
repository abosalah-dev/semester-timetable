import { useMemo, useState } from "react";

import {
  EMPTY_COURSE_FILTER,
  type ComponentType,
  type Course,
  type CourseFilter,
} from "../types";

/**
 * The rules that apply to one course only.
 *
 * Each component's groups and each lecturer are a chip that cycles on
 * clicking: keep only this, then never this, then no preference. Three states
 * on one control keeps a course with twenty lab groups readable, and the
 * tooltip on every chip says what the next click will do.
 */
export function CourseFilters({
  course,
  filter,
  onChange,
}: {
  course: Course;
  filter: CourseFilter;
  onChange: (next: CourseFilter) => void;
}) {
  const [open, setOpen] = useState(false);

  const instructors = useMemo(() => {
    const names = new Set<string>();
    for (const component of course.components) {
      for (const group of component.groups) {
        for (const session of group.sessions) {
          session.instructors.forEach((name) => names.add(name));
        }
      }
    }
    return [...names].sort();
  }, [course]);

  const active =
    Object.keys(filter.pinnedGroups).length +
    Object.values(filter.excludedGroups).flat().length +
    filter.requiredInstructors.length +
    filter.excludedInstructors.length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">
            {course.name}
          </span>
          <span className="text-[11px] text-slate-500">
            {active === 0 ? "any group" : `${active} rule${active === 1 ? "" : "s"}`}
          </span>
        </span>
        <span className="ml-2 shrink-0 text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          {course.components.map((component) => (
            <div key={component.type}>
              <p className="text-xs font-medium text-slate-600">
                {component.type} group
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {component.groups.map((group) => {
                  const pinned = filter.pinnedGroups[component.type] === group.name;
                  const excluded = (
                    filter.excludedGroups[component.type] ?? []
                  ).includes(group.name);
                  return (
                    <button
                      key={group.name}
                      type="button"
                      title={
                        pinned
                          ? "Only this group — click to rule it out instead"
                          : excluded
                            ? "Ruled out — click to allow again"
                            : "Click to use only this group"
                      }
                      onClick={() =>
                        onChange(cycleGroup(filter, component.type, group.name))
                      }
                      className={`rounded-md px-2 py-1 text-xs font-medium ring-1 transition ${
                        pinned
                          ? "bg-sky-600 text-white ring-sky-600"
                          : excluded
                            ? "bg-rose-50 text-rose-400 line-through ring-rose-200"
                            : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400"
                      }`}
                    >
                      {group.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {instructors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-600">Lecturers</p>
              <div className="mt-1.5 space-y-1">
                {instructors.map((name) => {
                  const required = filter.requiredInstructors.includes(name);
                  const excluded = filter.excludedInstructors.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      title={
                        required
                          ? "Wanted — click to rule out instead"
                          : excluded
                            ? "Ruled out — click to clear"
                            : "Click to keep only groups this lecturer teaches"
                      }
                      onClick={() => onChange(cycleInstructor(filter, name))}
                      className={`block w-full truncate rounded-md px-2 py-1 text-left text-xs transition ${
                        required
                          ? "bg-emerald-100 text-emerald-900"
                          : excluded
                            ? "bg-rose-50 text-rose-400 line-through"
                            : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {active > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_COURSE_FILTER)}
              className="text-xs text-slate-500 underline hover:text-slate-800"
            >
              Clear this course
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Untouched → only this group → never this group → untouched. */
function cycleGroup(
  filter: CourseFilter,
  type: ComponentType,
  group: string,
): CourseFilter {
  const pinned = filter.pinnedGroups[type] === group;
  const excluded = (filter.excludedGroups[type] ?? []).includes(group);

  const pinnedGroups = { ...filter.pinnedGroups };
  const excludedGroups = { ...filter.excludedGroups };
  const rest = (excludedGroups[type] ?? []).filter((name) => name !== group);

  if (!pinned && !excluded) {
    pinnedGroups[type] = group;
    excludedGroups[type] = rest;
  } else if (pinned) {
    delete pinnedGroups[type];
    excludedGroups[type] = [...rest, group];
  } else {
    excludedGroups[type] = rest;
  }
  return { ...filter, pinnedGroups, excludedGroups };
}

/** Untouched → want this lecturer → avoid this lecturer → untouched. */
function cycleInstructor(filter: CourseFilter, name: string): CourseFilter {
  const required = filter.requiredInstructors.includes(name);
  const excluded = filter.excludedInstructors.includes(name);

  if (!required && !excluded) {
    return { ...filter, requiredInstructors: [...filter.requiredInstructors, name] };
  }
  if (required) {
    return {
      ...filter,
      requiredInstructors: filter.requiredInstructors.filter((n) => n !== name),
      excludedInstructors: [...filter.excludedInstructors, name],
    };
  }
  return {
    ...filter,
    excludedInstructors: filter.excludedInstructors.filter((n) => n !== name),
  };
}
