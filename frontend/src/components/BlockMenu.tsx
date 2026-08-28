import { useEffect, useRef } from "react";

import { DAY_LABELS, type CourseFilter, type GlobalFilters } from "../types";
import type { Placement } from "../solver/options";
import { busyCellsOf, formatTime } from "../lib/time";
import { toMinutes } from "../solver/grid";

export interface BlockTarget {
  courseCode: string;
  courseName: string;
  placement: Placement;
  /** Where on screen the block was, so the menu opens beside it. */
  at: { x: number; y: number };
}

/**
 * Acting on a class from the timetable itself.
 *
 * Liking one lecture and wanting the rest reshuffled used to mean leaving the
 * timetable, finding the course in the sidebar, and setting the rule by hand.
 * Every rule the sidebar offers about a single class is reachable from the
 * class itself here - which is where the student is looking when they decide.
 */
export function BlockMenu({
  target,
  courseFilter,
  global,
  onCourseFilter,
  onGlobal,
  onClose,
}: {
  target: BlockTarget;
  courseFilter: CourseFilter;
  global: GlobalFilters;
  onCourseFilter: (code: string, next: CourseFilter, description: string) => void;
  onGlobal: (next: GlobalFilters, description: string) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { placement, courseCode, courseName } = target;
  const { type, group, session } = placement;

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // A frame's delay, so the click that opened the menu does not close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", dismiss);
      document.addEventListener("keydown", escape);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  const pinned = courseFilter.pinnedGroups[type] === group;
  const excludedGroups = courseFilter.excludedGroups[type] ?? [];
  const when = `${DAY_LABELS[session.day]} ${formatTime(toMinutes(session.start))}`;

  const keepGroup = () => {
    onCourseFilter(
      courseCode,
      {
        ...courseFilter,
        pinnedGroups: { ...courseFilter.pinnedGroups, [type]: group },
        excludedGroups: {
          ...courseFilter.excludedGroups,
          [type]: excludedGroups.filter((name) => name !== group),
        },
      },
      `Keeping ${type} ${group} of ${courseName}`,
    );
  };

  const dropGroup = () => {
    const pinnedGroups = { ...courseFilter.pinnedGroups };
    if (pinnedGroups[type] === group) delete pinnedGroups[type];
    onCourseFilter(
      courseCode,
      {
        ...courseFilter,
        pinnedGroups,
        excludedGroups: {
          ...courseFilter.excludedGroups,
          [type]: [...excludedGroups, group],
        },
      },
      `Ruled out ${type} ${group} of ${courseName}`,
    );
  };

  const avoidLecturer = (name: string) => {
    onGlobal(
      {
        ...global,
        excludedInstructors: [...(global.excludedInstructors ?? []), name],
      },
      `Avoiding ${name} in every course`,
    );
  };

  const blockTime = () => {
    const cells = busyCellsOf(session);
    const already = new Set(global.blockedCells);
    onGlobal(
      {
        ...global,
        blockedCells: [...global.blockedCells, ...cells.filter((c) => !already.has(c))],
      },
      `Blocked ${when}`,
    );
  };

  return (
    <div
      ref={box}
      role="menu"
      style={{ left: target.at.x, top: target.at.y }}
      className="fixed z-[60] w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
    >
      <div className="border-b border-slate-100 px-3 py-2">
        <p className="truncate text-sm font-semibold text-slate-800">{courseName}</p>
        <p className="text-[11px] text-slate-500">
          {type} ({group}) · {when}
        </p>
      </div>

      <div className="py-1">
        <Item onClick={keepGroup} disabled={pinned} icon="📌">
          {pinned ? `Already keeping ${group} only` : `Keep ${type.toLowerCase()} ${group} only`}
        </Item>
        <Item onClick={dropGroup} icon="🚫">
          Never {type.toLowerCase()} {group}
        </Item>

        {session.instructors.map((name) => (
          <Item key={name} onClick={() => avoidLecturer(name)} icon="👤">
            <span className="truncate">Avoid {name}</span>
          </Item>
        ))}

        <Item onClick={blockTime} icon="⏰">
          Block {when}
        </Item>
      </div>
    </div>
  );
}

function Item({
  onClick,
  icon,
  disabled = false,
  children,
}: {
  onClick: () => void;
  icon: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
