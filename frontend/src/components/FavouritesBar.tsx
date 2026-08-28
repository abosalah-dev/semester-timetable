import type { RenderedSchedule } from "../solver/engine";

/**
 * The timetables set aside while browsing.
 *
 * Somewhere in a space of a million there are three or four worth deciding
 * between, and without somewhere to put them the only way back to one is to
 * remember its number. A saved timetable keeps its own copy of everything it
 * needs, so changing the filters afterwards does not take it away.
 */
export function FavouritesBar({
  favourites,
  onOpen,
  onCompare,
  onClear,
}: {
  favourites: RenderedSchedule[];
  onOpen: (schedule: RenderedSchedule) => void;
  onCompare: () => void;
  onClear: () => void;
}) {
  if (favourites.length === 0) return null;

  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
      <span className="text-sm font-medium text-amber-900">
        ⭐ {favourites.length} saved
      </span>

      <div className="flex flex-wrap gap-1.5">
        {favourites.map((schedule) => (
          <button
            key={schedule.index}
            type="button"
            onClick={() => onOpen(schedule)}
            title="Open this timetable"
            className="rounded-md bg-white px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-200 hover:ring-amber-400"
          >
            #{(schedule.index + 1).toLocaleString("en")}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onCompare}
          className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
        >
          Compare
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-amber-700 underline hover:text-amber-900"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** The star itself, used on a card and in the full-size view. */
export function FavouriteStar({
  saved,
  onToggle,
  size = "sm",
}: {
  saved: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save this timetable"}
      title={saved ? "Remove from saved" : "Save this timetable"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`cursor-pointer select-none leading-none transition ${
        size === "md" ? "text-xl" : "text-base"
      } ${saved ? "opacity-100" : "opacity-30 hover:opacity-70"}`}
    >
      ⭐
    </span>
  );
}
