/**
 * The reminder that this is a demonstration.
 *
 * The sample semester carries a real faculty's courses, times and rooms, so a
 * timetable built from it looks exactly like a real one. That is the point -
 * and it is also why it has to say, on every screen, that it is not the
 * current semester and the lecturers are not real people.
 */
export function SampleBanner({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-sky-50 px-4 py-3 ring-1 ring-sky-200">
      <span className="text-sm text-sky-900">
        <strong>You are trying the demo.</strong> Real courses, times and rooms
        from Spring 2026 — a past semester — with made-up lecturer names.
      </span>
      <button
        type="button"
        onClick={onUpload}
        className="ml-auto shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
      >
        Use my own schedule
      </button>
    </div>
  );
}
