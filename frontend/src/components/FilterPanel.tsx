import {
  DAY_LABELS,
  EMPTY_COURSE_FILTER,
  WEEK,
  type CourseFilter,
  type Day,
  type GlobalFilters,
  type Semester,
} from "../types";
import type { Band } from "../lib/time";
import { BusyPicker } from "./BusyPicker";
import { CourseFilters } from "./CourseFilters";
import { DayWindows } from "./DayWindows";
import { FilterLegend, Hint } from "./FilterLegend";
import { InstructorFilter } from "./InstructorFilter";

/**
 * Everything the student can rule in or out, in three widening scopes.
 *
 * The week comes first, because most people know when they can be on campus
 * before they know which lecturer they want. Lecturers come next, as a
 * decision about the semester as a whole. Rules for a single course come
 * last. Every rule applies at once; none of them cancels another.
 */
export function FilterPanel({
  semester,
  selected,
  global,
  bands,
  courseFilters,
  onGlobal,
  onCourseFilter,
}: {
  semester: Semester;
  selected: string[];
  global: GlobalFilters;
  bands: Band[];
  courseFilters: Record<string, CourseFilter>;
  onGlobal: (next: GlobalFilters) => void;
  onCourseFilter: (code: string, next: CourseFilter) => void;
}) {
  const days = WEEK.filter((day) => day !== "FRIDAY");

  return (
    <div className="space-y-6">
      <FilterLegend />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your week
        </h2>
        <Hint>Applies to every course at once.</Hint>

        <p className="mt-3 text-xs font-medium text-slate-600">
          Days off — keep completely free
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {days.map((day) => (
            <Toggle
              key={day}
              active={global.daysOff.includes(day)}
              onClick={() =>
                onGlobal({ ...global, daysOff: toggle(global.daysOff, day) })
              }
            >
              {DAY_LABELS[day].slice(0, 3)}
            </Toggle>
          ))}
        </div>
        <Hint>A dark day will have no classes at all.</Hint>

        <p className="mt-4 text-xs font-medium text-slate-600">
          Hours you can be on campus
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          <TimeField
            label="Not before"
            value={global.earliestStart}
            onChange={(earliestStart) => onGlobal({ ...global, earliestStart })}
          />
          <TimeField
            label="Not after"
            value={global.latestEnd}
            onChange={(latestEnd) => onGlobal({ ...global, latestEnd })}
          />
        </div>

        <DayWindows global={global} onChange={onGlobal} />

        <label className="mt-4 block text-xs font-medium text-slate-600">
          Come to campus at most
          <select
            value={global.maxDaysPerWeek ?? ""}
            onChange={(event) =>
              onGlobal({
                ...global,
                maxDaysPerWeek: event.target.value
                  ? Number(event.target.value)
                  : null,
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
          >
            <option value="">any number of days</option>
            {[1, 2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count} day{count === 1 ? "" : "s"} a week
              </option>
            ))}
          </select>
        </label>
        <Hint>An upper limit — fewer days is always allowed.</Hint>

        <div className="mt-4">
          <BusyPicker bands={bands} global={global} onChange={onGlobal} />
          <Hint>Click any square to block that hour on that day.</Hint>
        </div>
      </section>

      <InstructorFilter
        semester={semester}
        selected={selected}
        global={global}
        onChange={onGlobal}
      />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Per course
        </h2>
        <Hint>Pin a group, or rule one out, for a single course.</Hint>
        {selected.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Choose a course to pin a group or rule out a lecturer.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {selected.map((code) => {
              const course = semester.courses.find((c) => c.code === code);
              if (!course) return null;
              return (
                <CourseFilters
                  key={code}
                  course={course}
                  filter={courseFilters[code] ?? EMPTY_COURSE_FILTER}
                  onChange={(next) => onCourseFilter(code, next)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition ${
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input
        type="time"
        step={1800}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
      />
    </label>
  );
}

function toggle(days: Day[], day: Day): Day[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
}
