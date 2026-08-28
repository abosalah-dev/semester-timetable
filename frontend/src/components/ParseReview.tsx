import type { Semester } from "../types";

/**
 * What was read, before anything is built on it.
 *
 * The file format changes a little every semester. Rather than hoping the
 * parser keeps up, anything it could not classify is shown here: a student
 * who sees a warning knows to check that course by hand instead of trusting a
 * timetable that quietly lost a session.
 */
export function ParseReview({
  semester,
  onContinue,
  onStartOver,
}: {
  semester: Semester;
  onContinue: () => void;
  onStartOver: () => void;
}) {
  const groups = semester.courses.flatMap((c) => c.components.flatMap((k) => k.groups));
  const sessions = groups.flatMap((group) => group.sessions);
  const types = new Map<string, number>();
  for (const course of semester.courses) {
    for (const component of course.components) {
      types.set(component.type, (types.get(component.type) ?? 0) + component.groups.length);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {semester.title ? `Semester ${semester.title}` : "Schedule read"}
      </h1>
      <p className="mt-2 text-slate-600">
        Here is what the file contained. Check it looks right before choosing
        your courses.
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Courses" value={semester.courses.length} />
        <Stat label="Groups" value={groups.length} />
        <Stat label="Classes" value={sessions.length} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {[...types.entries()].map(([type, count]) => (
          <span
            key={type}
            className="rounded-full bg-white px-3 py-1 text-sm text-slate-600 ring-1 ring-slate-200"
          >
            {type} · {count} groups
          </span>
        ))}
      </div>

      {semester.warnings.length === 0 ? (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Every line of the file was read. Nothing was skipped.
        </p>
      ) : (
        <div className="mt-6 rounded-xl bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            {semester.warnings.length} line
            {semester.warnings.length === 1 ? "" : "s"} could not be read, and
            {semester.warnings.length === 1 ? " it is" : " they are"} not part
            of any course below. Check these by hand.
          </p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-amber-900/80">
            {semester.warnings.map((warning, index) => (
              <li key={index} className="font-mono">
                p{warning.page}: {warning.text} — {warning.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-xl bg-sky-600 px-5 py-2.5 font-medium text-white hover:bg-sky-500"
        >
          Choose my courses
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-xl px-5 py-2.5 font-medium text-slate-600 hover:bg-slate-200"
        >
          Upload a different file
        </button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">
        {value.toLocaleString("en")}
      </dd>
    </div>
  );
}
