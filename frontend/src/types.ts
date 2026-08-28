/** The semester model, mirroring what the backend's parser produces. */

export type ComponentType =
  | "Lecture"
  | "Lab"
  | "Tutorial"
  | "Workshop"
  | "Project";

export type Day =
  | "SATURDAY"
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY";

export const WEEK: Day[] = [
  "SATURDAY",
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
];

export const DAY_LABELS: Record<Day, string> = {
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
};

export interface Session {
  day: Day;
  start: string;
  end: string;
  room: string | null;
  instructors: string[];
}

export interface Group {
  name: string;
  sessions: Session[];
  max_load: number | null;
  enrolled: number | null;
}

export interface Component {
  type: ComponentType;
  groups: Group[];
}

export interface Course {
  code: string;
  name: string;
  components: Component[];
}

export interface ParseWarning {
  page: number;
  text: string;
  reason: string;
}

export interface Semester {
  title: string | null;
  courses: Course[];
  warnings: ParseWarning[];
}

// --- what the student asks for ------------------------------------------

/** Filters that apply to one course only. */
export interface CourseFilter {
  /** Component type -> the only group allowed. Empty means "any". */
  pinnedGroups: Partial<Record<ComponentType, string>>;
  /** Component type -> groups that must not be used. */
  excludedGroups: Partial<Record<ComponentType, string[]>>;
  /** Only keep groups taught by at least one of these instructors. */
  requiredInstructors: string[];
  /** Drop any group taught by one of these instructors. */
  excludedInstructors: string[];
}

/** The hours of a single day, when they differ from the rest of the week. */
export interface DayWindow {
  /** Nothing may start before this. `null` follows the whole-week limit. */
  start: string | null;
  /** Nothing may end after this. `null` follows the whole-week limit. */
  end: string | null;
}

export interface GlobalFilters {
  /** Days that must stay completely free. */
  daysOff: Day[];
  /** No session may start before this, as "HH:MM". */
  earliestStart: string | null;
  /** No session may end after this, as "HH:MM". */
  latestEnd: string | null;
  /**
   * Per-day hours, overriding `earliestStart` / `latestEnd` for that day.
   * Each end of the window falls back on its own, so a day can set only a
   * start and still follow the week's limit for when it finishes.
   */
  dayWindows: Partial<Record<Day, DayWindow>>;
  /** Individual half-hour cells the student has marked busy: "DAY HH:MM". */
  blockedCells: string[];
  /** Reject any timetable that uses more than this many days. */
  maxDaysPerWeek: number | null;
  /** Lecturers to avoid in every course that offers them. */
  excludedInstructors: string[];
  /**
   * Lecturers to insist on.
   *
   * The rule reaches only as far as the person actually teaches: courses they
   * have nothing to do with are untouched, and within a course only the
   * components they give. Anything wider would be unsatisfiable - a doctor who
   * lectures does not also run the labs.
   */
  requiredInstructors: string[];
}

export const EMPTY_COURSE_FILTER: CourseFilter = {
  pinnedGroups: {},
  excludedGroups: {},
  requiredInstructors: [],
  excludedInstructors: [],
};

export const EMPTY_GLOBAL_FILTERS: GlobalFilters = {
  daysOff: [],
  earliestStart: null,
  latestEnd: null,
  dayWindows: {},
  blockedCells: [],
  maxDaysPerWeek: null,
  excludedInstructors: [],
  requiredInstructors: [],
};

// --- what comes back ----------------------------------------------------

/** One course's chosen groups: component type -> group name. */
export type CourseChoice = Record<string, string>;

export interface ScheduleMetrics {
  /** Bit i set means WEEK[i] is used. */
  daysMask: number;
  dayCount: number;
  /** Minutes spent waiting between classes, summed over the week. */
  gapMinutes: number;
  /** Earliest and latest clock times used, in minutes past midnight. */
  earliestStart: number;
  latestEnd: number;
  /** Days with a class at or after 17:00 - evenings spent on campus. */
  eveningDays: number;
  /** Minutes between the first and last class of each day, summed. */
  campusMinutes: number;
}

export type SortPreset =
  | "fewestDays"
  | "leastGaps"
  | "mostGaps"
  | "latestStart"
  | "earliestFinish"
  | "fewestEvenings"
  | "shortestDays";

export const SORT_PRESETS: { id: SortPreset; label: string; hint: string }[] = [
  { id: "fewestDays", label: "Fewest days", hint: "Come to campus as rarely as possible" },
  { id: "leastGaps", label: "Least waiting", hint: "Back-to-back classes, no dead time" },
  { id: "mostGaps", label: "Most breathing room", hint: "Long breaks between classes" },
  { id: "latestStart", label: "Latest start", hint: "No early mornings" },
  { id: "earliestFinish", label: "Earliest finish", hint: "Home before the evening" },
  { id: "fewestEvenings", label: "Fewest evenings", hint: "Fewest days that run into the evening" },
  { id: "shortestDays", label: "Shortest days", hint: "Least time on campus overall" },
];
