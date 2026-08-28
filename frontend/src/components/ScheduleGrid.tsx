/**
 * A week, drawn the way the university prints it.
 *
 * Rows are the time bands shared by every timetable, columns are the days of
 * the week, and each class is a coloured block carrying the four things a
 * student needs at a glance: the course, which kind of session it is and
 * which group, the room, and who teaches it.
 *
 * Rows nobody uses are dropped so a timetable takes only the height it needs.
 * The bands themselves are shared by every timetable on screen, so two of them
 * side by side still line up row for row.
 */

import { WEEK, DAY_LABELS, type Day } from "../types";
import type { RenderedSchedule } from "../solver/engine";
import type { Placement } from "../solver/options";
import { colourOf, type Palette } from "../lib/colors";
import { bandSpan, formatBand, formatTime, type Band } from "../lib/time";

interface Block {
  code: string;
  name: string;
  placement: Placement;
  day: Day;
  first: number;
  last: number;
}

type ScheduleGridProps = Parameters<typeof ScheduleGrid>[0];

export function ScheduleGrid({
  schedule,
  bands,
  colours,
  compact = false,
  onBlockClick,
}: {
  schedule: RenderedSchedule;
  bands: Band[];
  colours: Map<string, Palette>;
  compact?: boolean;
  /** Given, every class becomes a button that reports where it was clicked. */
  onBlockClick?: (
    block: { code: string; name: string; placement: Placement },
    at: { x: number; y: number },
  ) => void;
}) {
  const blocks = layout(schedule, bands);
  const days = WEEK.filter(
    (day) => day !== "FRIDAY" || blocks.some((b) => b.day === "FRIDAY"),
  );
  const rows = bands
    .map((band, index) => ({ band, index }))
    .filter(({ index }) =>
      blocks.some((b) => b.first <= index && index <= b.last),
    );

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
        This timetable has no classes.
      </p>
    );
  }

  return (
    <div className="scroll-x rounded-2xl border border-slate-200 bg-white p-1.5">
      <table
        className={`w-full table-fixed border-separate border-spacing-1 ${
          compact ? "min-w-[30rem]" : "min-w-[52rem]"
        }`}
      >
        <thead>
          <tr>
            <th className={`${headCell(compact)} ${compact ? "w-16" : "w-36"}`}>
              Time
            </th>
            {days.map((day) => (
              <th key={day} className={`${headCell(compact)} min-w-32`}>
                {compact ? DAY_LABELS[day].slice(0, 3) : DAY_LABELS[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ band, index }) => (
            <tr key={index}>
              <th
                className={`whitespace-nowrap rounded-lg bg-slate-100 text-left font-medium text-slate-600 ${
                  compact ? "px-1.5 py-1 text-[10px]" : "px-3 py-2 text-xs"
                }`}
              >
                {compact ? formatTime(band.startMinutes) : formatBand(band)}
              </th>
              {days.map((day) => (
                <Cell
                  key={day}
                  day={day}
                  bandIndex={index}
                  blocks={blocks}
                  colours={colours}
                  compact={compact}
                  onBlockClick={onBlockClick}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  day,
  bandIndex,
  blocks,
  colours,
  compact,
  onBlockClick,
}: {
  day: Day;
  bandIndex: number;
  blocks: Block[];
  colours: Map<string, Palette>;
  compact: boolean;
  onBlockClick?: ScheduleGridProps["onBlockClick"];
}) {
  const starting = blocks.filter((b) => b.day === day && b.first === bandIndex);

  // A block taller than one band has already claimed this cell via rowSpan.
  const continued = blocks.some(
    (b) => b.day === day && b.first < bandIndex && bandIndex <= b.last,
  );
  if (starting.length === 0) {
    return continued ? null : (
      <td className={`rounded-lg bg-slate-50 ${compact ? "h-7" : "h-16"}`} />
    );
  }

  const span = Math.max(...starting.map((b) => b.last - b.first + 1));
  return (
    // Centred rather than top-aligned: a row is as tall as its longest block,
    // and a short one hanging from the top reads as a rendering fault.
    <td rowSpan={span} className="align-middle">
      <div className="flex flex-col gap-1">
        {starting.map((block) => (
          <BlockView
            key={`${block.code}-${block.placement.type}-${block.placement.group}-${block.first}`}
            block={block}
            palette={colourOf(colours, block.code)}
            compact={compact}
            onBlockClick={onBlockClick}
          />
        ))}
      </div>
    </td>
  );
}

function BlockView({
  block,
  palette,
  compact,
  onBlockClick,
}: {
  block: Block;
  palette: Palette;
  compact: boolean;
  onBlockClick?: ScheduleGridProps["onBlockClick"];
}) {
  const { type, group, session } = block.placement;
  const staff = session.instructors.join(", ");
  const clickable = Boolean(onBlockClick);

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? (event) => {
              event.stopPropagation();
              const box = event.currentTarget.getBoundingClientRect();
              onBlockClick?.(
                { code: block.code, name: block.name, placement: block.placement },
                { x: Math.min(box.left, window.innerWidth - 272), y: box.bottom + 4 },
              );
            }
          : undefined
      }
      className={`flex flex-col justify-center break-words rounded-lg border text-center ${palette.bg} ${palette.border} ${palette.text} ${
        compact ? "px-1 py-1" : "px-2 py-2"
      } ${clickable ? "cursor-pointer hover:brightness-95" : ""}`}
      title={
        clickable
          ? `${block.name} — ${type} (${group}) — click for options`
          : `${block.name} — ${type} (${group})${staff ? ` — ${staff}` : ""}`
      }
    >
      <div
        className={`font-semibold leading-tight ${compact ? "text-[10px]" : "text-sm"}`}
      >
        {block.name}
      </div>
      <div className={`leading-tight opacity-75 ${compact ? "text-[9px]" : "text-xs"}`}>
        {type} ({group})
      </div>
      <div className={`leading-tight opacity-60 ${compact ? "text-[9px]" : "text-xs"}`}>
        {session.room ? `Room ${session.room}` : "No room"}
      </div>
      {!compact && staff && (
        <div className="mt-0.5 text-[11px] leading-tight opacity-55">{staff}</div>
      )}
    </div>
  );
}

function headCell(compact: boolean): string {
  return `rounded-lg bg-slate-200/70 font-semibold text-slate-700 ${
    compact ? "px-1 py-1 text-[10px]" : "px-3 py-2 text-sm"
  }`;
}

/** Every class of a timetable, positioned on the band grid. */
function layout(schedule: RenderedSchedule, bands: Band[]): Block[] {
  const blocks: Block[] = [];
  for (const course of schedule.courses) {
    for (const placement of course.placements) {
      const [first, last] = bandSpan(bands, placement.session);
      blocks.push({
        code: course.code,
        name: course.name,
        placement,
        day: placement.session.day,
        first,
        last,
      });
    }
  }
  return blocks.sort((a, b) => a.first - b.first || a.code.localeCompare(b.code));
}
