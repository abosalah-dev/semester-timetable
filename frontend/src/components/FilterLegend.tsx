/**
 * What the coloured chips mean.
 *
 * The group and lecturer chips cycle through three states on repeated
 * clicks. That is compact once you know it and invisible until you do, so the
 * key sits above the filters where it is read before anything is clicked.
 */
export function FilterLegend() {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Click a chip again to change it
      </p>
      <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
        <Item swatch="bg-sky-600" label="only this one" />
        <Item swatch="bg-emerald-500" label="this lecturer, please" />
        <Item swatch="bg-rose-300" label="never this one" />
        <Item swatch="bg-slate-200" label="no preference" />
      </ul>
    </div>
  );
}

function Item({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`size-3 shrink-0 rounded ${swatch}`} />
      {label}
    </li>
  );
}

/** A one-line explanation under a filter heading. */
export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{children}</p>;
}
