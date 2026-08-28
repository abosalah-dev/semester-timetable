import type { Finding } from "../solver/engine";
import type { GlobalFilters, Semester } from "../types";
import { DAY_LABELS, type Day } from "../types";

/**
 * Why there is nothing to show.
 *
 * "No results" on its own leaves a student guessing which of a dozen switches
 * to undo, so this names the obstruction the solver actually found and offers
 * the single change most likely to clear it.
 */
export function Diagnostics({
  findings,
  semester,
  global,
  onRelax,
}: {
  findings: Finding[];
  semester: Semester;
  global: GlobalFilters;
  onRelax: (next: GlobalFilters) => void;
}) {
  const nameOf = (code: string) =>
    semester.courses.find((c) => c.code === code)?.name ?? code;

  // A lecturer rule that emptied a course is the change to offer first; the
  // week's limits are usually innocent bystanders.
  const relaxations = suggestRelaxations(
    global,
    findings.some((f) => "reason" in f && /lecturer/i.test(f.reason)),
  );

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <h3 className="text-lg font-semibold text-amber-900">
        No timetable fits all of this
      </h3>

      <ul className="mt-4 space-y-3">
        {findings.map((finding, index) => (
          <li key={index} className="rounded-xl bg-white/70 px-4 py-3">
            {finding.kind === "course" && (
              <p className="text-sm text-amber-900">
                <strong>{nameOf(finding.code)}</strong> has no group left —{" "}
                {finding.reason}.
              </p>
            )}
            {finding.kind === "pair" && (
              <p className="text-sm text-amber-900">
                <strong>{nameOf(finding.codes[0])}</strong> and{" "}
                <strong>{nameOf(finding.codes[1])}</strong> cannot both be
                taken: {finding.reason}.
              </p>
            )}
            {finding.kind === "drop" && (
              <p className="text-sm text-amber-900">
                Drop <strong>{nameOf(finding.code)}</strong> and the rest fit —{" "}
                {finding.reason}.
              </p>
            )}
          </li>
        ))}
        {findings.length === 0 && (
          <li className="rounded-xl bg-white/70 px-4 py-3 text-sm text-amber-900">
            The courses fit each other, but not within the limits you set on
            your week. Try loosening one of them.
          </li>
        )}
      </ul>

      {relaxations.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Try removing
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {relaxations.map((relaxation) => (
              <button
                key={relaxation.label}
                type="button"
                onClick={() => onRelax(relaxation.apply(global))}
                className="rounded-lg bg-white px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100"
              >
                {relaxation.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Relaxation {
  label: string;
  apply: (filters: GlobalFilters) => GlobalFilters;
}

function suggestRelaxations(
  global: GlobalFilters,
  lecturerFirst: boolean,
): Relaxation[] {
  const out: Relaxation[] = [];
  const lecturers: Relaxation[] = [];

  for (const name of global.excludedInstructors ?? []) {
    lecturers.push({
      label: `Allow ${name}`,
      apply: (filters) => ({
        ...filters,
        excludedInstructors: filters.excludedInstructors.filter((n) => n !== name),
      }),
    });
  }
  for (const name of global.requiredInstructors ?? []) {
    lecturers.push({
      label: `Stop insisting on ${name}`,
      apply: (filters) => ({
        ...filters,
        requiredInstructors: filters.requiredInstructors.filter((n) => n !== name),
      }),
    });
  }

  for (const [day, window] of Object.entries(global.dayWindows ?? {})) {
    if (!window?.start && !window?.end) continue;
    out.push({
      label: `Clear ${DAY_LABELS[day as Day]}'s own hours`,
      apply: (filters) => {
        const rest = { ...filters.dayWindows };
        delete rest[day as Day];
        return { ...filters, dayWindows: rest };
      },
    });
  }

  for (const day of global.daysOff) {
    out.push({
      label: `Allow ${DAY_LABELS[day as Day]}`,
      apply: (filters) => ({
        ...filters,
        daysOff: filters.daysOff.filter((d) => d !== day),
      }),
    });
  }
  if (global.earliestStart) {
    out.push({
      label: `Allow classes before ${global.earliestStart}`,
      apply: (filters) => ({ ...filters, earliestStart: null }),
    });
  }
  if (global.latestEnd) {
    out.push({
      label: `Allow classes after ${global.latestEnd}`,
      apply: (filters) => ({ ...filters, latestEnd: null }),
    });
  }
  if (global.maxDaysPerWeek !== null) {
    out.push({
      label: `Allow more than ${global.maxDaysPerWeek} days a week`,
      apply: (filters) => ({ ...filters, maxDaysPerWeek: null }),
    });
  }
  if (global.blockedCells.length > 0) {
    out.push({
      label: `Clear ${global.blockedCells.length} blocked time${global.blockedCells.length === 1 ? "" : "s"}`,
      apply: (filters) => ({ ...filters, blockedCells: [] }),
    });
  }
  return lecturerFirst ? [...lecturers, ...out] : [...out, ...lecturers];
}
