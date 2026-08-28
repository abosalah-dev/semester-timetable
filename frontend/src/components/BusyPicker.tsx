import { DAY_LABELS, WEEK, type Day, type GlobalFilters } from "../types";
import { toHHMM } from "../solver/grid";
import { formatTime, type Band } from "../lib/time";

/**
 * Marking the hours that are already spoken for.
 *
 * A student's obligations - a job, a commute, prayer, the gym - are not in any
 * file, and describing them as rules would be tedious. Clicking them straight
 * onto an empty week is faster and is exactly how they picture it.
 *
 * A cell is stored as every half hour it covers, because the solver works on a
 * half-hour grid and the bands drawn here depend on which courses are chosen.
 */
export function BusyPicker({
  bands,
  global,
  onChange,
}: {
  bands: Band[];
  global: GlobalFilters;
  onChange: (next: GlobalFilters) => void;
}) {
  const days = WEEK.filter((day) => day !== "FRIDAY");
  const blocked = new Set(global.blockedCells);

  if (bands.length === 0) return null;

  const toggle = (day: Day, band: Band) => {
    const cells = halfHours(day, band);
    const isBlocked = cells.every((cell) => blocked.has(cell));
    const next = new Set(blocked);
    for (const cell of cells) {
      if (isBlocked) next.delete(cell);
      else next.add(cell);
    }
    onChange({ ...global, blockedCells: [...next] });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-slate-600">Times you are busy</p>
        {blocked.size > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...global, blockedCells: [] })}
            className="text-[11px] text-slate-500 underline hover:text-slate-800"
          >
            clear
          </button>
        )}
      </div>

      <table className="mt-1.5 w-full border-separate border-spacing-[2px] text-[10px]">
        <thead>
          <tr>
            <th />
            {days.map((day) => (
              <th key={day} className="font-medium text-slate-500">
                {DAY_LABELS[day].slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bands.map((band) => (
            <tr key={band.startMinutes}>
              <th className="whitespace-nowrap pr-1 text-right font-normal text-slate-400">
                {formatTime(band.startMinutes)}
              </th>
              {days.map((day) => {
                const cells = halfHours(day, band);
                const active = cells.every((cell) => blocked.has(cell));
                return (
                  <td key={day}>
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={`${DAY_LABELS[day]} ${formatTime(band.startMinutes)}`}
                      onClick={() => toggle(day, band)}
                      className={`h-5 w-full rounded transition ${
                        active
                          ? "bg-slate-800 hover:bg-slate-700"
                          : "bg-slate-100 hover:bg-slate-300"
                      }`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function halfHours(day: Day, band: Band): string[] {
  const cells: string[] = [];
  for (let at = band.startMinutes; at < band.endMinutes; at += 30) {
    cells.push(`${day} ${toHHMM(at)}`);
  }
  return cells.length > 0 ? cells : [`${day} ${toHHMM(band.startMinutes)}`];
}
