/**
 * One colour per course, stable across every view.
 *
 * The palette is assigned by position in the student's selection rather than
 * by hashing the code, so a small selection always gets maximally distinct
 * colours instead of whatever two neighbouring hashes happen to collide on.
 */

export interface Palette {
  /** Block background. */
  bg: string;
  /** Block border, one step darker than the background. */
  border: string;
  /** Title text, dark enough to read on `bg`. */
  text: string;
  /** Solid swatch for legends and chips. */
  dot: string;
}

const PALETTE: Palette[] = [
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900", dot: "bg-emerald-500" },
  { bg: "bg-sky-100", border: "border-sky-300", text: "text-sky-900", dot: "bg-sky-500" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-900", dot: "bg-amber-500" },
  { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-900", dot: "bg-violet-500" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-900", dot: "bg-rose-500" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-900", dot: "bg-orange-500" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-900", dot: "bg-teal-500" },
  { bg: "bg-fuchsia-100", border: "border-fuchsia-300", text: "text-fuchsia-900", dot: "bg-fuchsia-500" },
  { bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-900", dot: "bg-lime-600" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-900", dot: "bg-cyan-500" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", dot: "bg-indigo-500" },
  { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-900", dot: "bg-pink-500" },
];

const FALLBACK: Palette = {
  bg: "bg-slate-100",
  border: "border-slate-300",
  text: "text-slate-900",
  dot: "bg-slate-500",
};

export function paletteFor(codes: string[]): Map<string, Palette> {
  const colours = new Map<string, Palette>();
  codes.forEach((code, index) => {
    colours.set(code, PALETTE[index % PALETTE.length] ?? FALLBACK);
  });
  return colours;
}

export function colourOf(
  colours: Map<string, Palette>,
  code: string,
): Palette {
  return colours.get(code) ?? FALLBACK;
}
