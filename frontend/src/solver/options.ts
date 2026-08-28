/**
 * Expanding a course into the concrete choices a student can make.
 *
 * A course is taken as a whole: one group of every component it offers, and
 * lecture, lab and tutorial groups are picked independently of each other -
 * Lecture E with Lab B2 is a normal combination. Each surviving combination
 * becomes an *option*, carrying the cells it occupies so the search never has
 * to look at a session again.
 *
 * Filters are applied here rather than during the search, so an impossible
 * request fails with a reason attached to the course it came from.
 */

import {
  WEEK,
  type Component,
  type ComponentType,
  type Course,
  type CourseChoice,
  type CourseFilter,
  type Day,
  type GlobalFilters,
  type Session,
} from "../types";
import {
  type TimeGrid,
  emptyMask,
  intersects,
  maskOfSessions,
  occupy,
  toMinutes,
  union,
} from "./grid";

/** One class on the timetable, with the choice that put it there. */
export interface Placement {
  type: ComponentType;
  group: string;
  session: Session;
}

export interface CourseOption {
  choice: CourseChoice;
  /** "Lecture E · Lab B2", for display. */
  label: string;
  mask: Uint32Array;
  placements: Placement[];
}

export interface CoursePlan {
  code: string;
  name: string;
  options: CourseOption[];
  /** Why the option list is empty, when it is. */
  blockedReason: string | null;
}

/**
 * The cells no class may occupy.
 *
 * Days off, the hours outside the student's working day, and anything they
 * marked busy all reduce to the same thing: cells that are unavailable. A day
 * may set its own hours, and each end of that window falls back on the
 * whole-week limit independently, so "Sunday starts at 10" does not also have
 * to restate when Sunday finishes.
 */
export function buildBlockedMask(
  grid: TimeGrid,
  filters: GlobalFilters,
): Uint32Array {
  const mask = emptyMask(grid);
  const dayEnd = grid.originMinutes + grid.slotsPerDay * 30;

  for (const day of filters.daysOff) {
    occupy(grid, mask, day, grid.originMinutes, dayEnd);
  }
  for (const day of WEEK) {
    const window = filters.dayWindows?.[day];
    const opens = window?.start ?? filters.earliestStart;
    const closes = window?.end ?? filters.latestEnd;

    if (opens) occupy(grid, mask, day, grid.originMinutes, toMinutes(opens));
    if (closes) occupy(grid, mask, day, toMinutes(closes), dayEnd);
  }
  for (const cell of filters.blockedCells) {
    const [day, time] = cell.split(" ");
    const start = toMinutes(time);
    occupy(grid, mask, day as Day, start, start + 30);
  }
  return mask;
}

/** Every lecturer who teaches anything in this course. */
export function instructorsOf(course: Course): string[] {
  const names = new Set<string>();
  for (const component of course.components) {
    for (const group of component.groups) {
      for (const session of group.sessions) {
        session.instructors.forEach((name) => names.add(name));
      }
    }
  }
  return [...names].sort();
}

/**
 * Fold the whole-timetable lecturer rules into one course's own rules.
 *
 * Exclusions apply everywhere. A preference is only meaningful for a course
 * the lecturer actually teaches: carrying it into a course they have nothing
 * to do with would leave that course with no groups at all, which is not what
 * "I want to be with this lecturer" means. `planCourse` narrows it further,
 * to the components they give.
 */
export function mergeInstructorRules(
  course: Course,
  filter: CourseFilter,
  global: GlobalFilters,
): CourseFilter {
  const teaches = new Set(instructorsOf(course));
  return {
    ...filter,
    excludedInstructors: unique([
      ...filter.excludedInstructors,
      ...(global.excludedInstructors ?? []),
    ]),
    requiredInstructors: unique([
      ...filter.requiredInstructors,
      ...(global.requiredInstructors ?? []).filter((name) => teaches.has(name)),
    ]),
  };
}

function unique(names: string[]): string[] {
  return [...new Set(names)];
}

export function planCourse(
  grid: TimeGrid,
  course: Course,
  filter: CourseFilter,
  blocked: Uint32Array,
): CoursePlan {
  // A lecturer the course does not employ at all cannot be insisted upon.
  const absent = filter.requiredInstructors.filter(
    (name) => !instructorsOf(course).includes(name),
  );
  if (absent.length > 0) {
    return {
      code: course.code,
      name: course.name,
      options: [],
      blockedReason: `${absent.join(" or ")} teaches nothing in this course`,
    };
  }

  const perComponent: CourseOption[][] = [];

  for (const component of course.components) {
    const pinned = filter.pinnedGroups[component.type];
    const excluded = filter.excludedGroups[component.type] ?? [];

    // Wanting a lecturer applies only where they actually teach. Doctors give
    // the lectures and demonstrators run the labs, so carrying the preference
    // into every component would wipe out the lab of any course whose lecturer
    // the student asked for.
    const here = scopeToComponent(filter, component);

    // Why groups fell away, so an empty component can say which rule did it.
    const dropped = { byLecturer: 0, byTime: 0 };

    const choices: CourseOption[] = [];
    for (const group of component.groups) {
      if (pinned && group.name !== pinned) continue;
      if (excluded.includes(group.name)) continue;
      if (!passesInstructorFilter(group.sessions, here)) {
        dropped.byLecturer += 1;
        continue;
      }

      const mask = maskOfSessions(grid, group.sessions);
      if (intersects(mask, blocked)) {
        dropped.byTime += 1;
        continue;
      }

      choices.push({
        choice: { [component.type]: group.name },
        label: `${component.type} ${group.name}`,
        mask,
        placements: group.sessions.map((session) => ({
          type: component.type,
          group: group.name,
          session,
        })),
      });
    }

    if (choices.length === 0) {
      return {
        code: course.code,
        name: course.name,
        options: [],
        blockedReason: describeEmptyComponent(component.type, pinned, here, dropped),
      };
    }
    perComponent.push(choices);
  }

  if (perComponent.length === 0) {
    return {
      code: course.code,
      name: course.name,
      options: [],
      blockedReason: "this course has no timetabled sessions",
    };
  }

  const options = combine(perComponent);
  return {
    code: course.code,
    name: course.name,
    options,
    blockedReason: options.length
      ? null
      : "every combination of this course's own groups clashes with itself",
  };
}

/**
 * Cartesian product of the components, dropping combinations that clash with
 * themselves - a lecture and a lab of the same course can land on the same
 * hour, and that choice is simply not available to the student.
 */
function combine(perComponent: CourseOption[][]): CourseOption[] {
  const wordCount = perComponent[0][0].mask.length;
  let combined: CourseOption[] = [
    { choice: {}, label: "", mask: new Uint32Array(wordCount), placements: [] },
  ];

  for (const choices of perComponent) {
    const next: CourseOption[] = [];
    for (const partial of combined) {
      for (const choice of choices) {
        if (intersects(partial.mask, choice.mask)) continue;
        next.push({
          choice: { ...partial.choice, ...choice.choice },
          label: partial.label ? `${partial.label} · ${choice.label}` : choice.label,
          mask: union(partial.mask, choice.mask),
          placements: [...partial.placements, ...choice.placements],
        });
      }
    }
    combined = next;
    if (combined.length === 0) break;
  }
  return combined;
}

/** The same rules, with preferences narrowed to this component's staff. */
function scopeToComponent(
  filter: CourseFilter,
  component: Component,
): CourseFilter {
  if (filter.requiredInstructors.length === 0) return filter;

  const teaching = new Set(
    component.groups.flatMap((group) =>
      group.sessions.flatMap((session) => session.instructors),
    ),
  );
  const wanted = filter.requiredInstructors.filter((name) => teaching.has(name));
  return wanted.length === filter.requiredInstructors.length
    ? filter
    : { ...filter, requiredInstructors: wanted };
}

function passesInstructorFilter(
  sessions: Session[],
  filter: CourseFilter,
): boolean {
  const names = new Set(sessions.flatMap((s) => s.instructors));
  if (filter.excludedInstructors.some((name) => names.has(name))) return false;
  if (filter.requiredInstructors.length === 0) return true;
  return filter.requiredInstructors.some((name) => names.has(name));
}

function describeEmptyComponent(
  type: string,
  pinned: string | undefined,
  filter: CourseFilter,
  dropped: { byLecturer: number; byTime: number },
): string {
  const only = pinned ? `${type} group ${pinned}` : `every ${type} group`;

  if (dropped.byLecturer > 0 && dropped.byTime === 0) {
    if (filter.requiredInstructors.length) {
      return `no ${type} group is taught by ${filter.requiredInstructors.join(" or ")}`;
    }
    return `${only} is taught by a lecturer you ruled out`;
  }
  if (dropped.byTime > 0 && dropped.byLecturer === 0) {
    return `${only} falls outside the hours you set`;
  }
  if (dropped.byTime > 0 && dropped.byLecturer > 0) {
    return `no ${type} group is left once your lecturer and hour rules are applied`;
  }
  if (pinned) return `${type} group ${pinned} is not offered`;
  return `no ${type} group survives the current filters`;
}

/** Sessions of every group of every course, used to size the time grid. */
export function allSessions(courses: Course[]): Session[] {
  return courses.flatMap((course) =>
    course.components.flatMap((component) =>
      component.groups.flatMap((group) => group.sessions),
    ),
  );
}
