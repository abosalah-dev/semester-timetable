import { useRef, useState } from "react";

import { ApiError, parseFiles } from "../lib/api";
import type { Semester } from "../types";

/**
 * The way in: drop this semester's PDFs and get a parsed semester back.
 *
 * The English schedule is a separate file that only some students need, so
 * both are accepted at once and neither is required to be first - the server
 * works out which layout each file uses.
 */
export function UploadStep({
  pendingCourses,
  onParsed,
}: {
  /** Courses a shared link is waiting to apply, if this page came from one. */
  pendingCourses: string[] | null;
  onParsed: (semester: Semester) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (incoming: FileList | null) => {
    if (!incoming) return;
    const pdfs = [...incoming].filter((file) =>
      file.name.toLowerCase().endsWith(".pdf"),
    );
    setError(pdfs.length === incoming.length ? null : "Only PDF files can be read.");
    setFiles((previous) => dedupe([...previous, ...pdfs]));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onParsed(await parseFiles(files));
    } catch (problem) {
      setError(
        problem instanceof ApiError
          ? problem.message
          : "Could not reach the server. Is the backend running?",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Build your semester timetable
      </h1>
      <p className="mt-3 text-slate-600">
        Upload the class schedule your faculty published for this semester. Add
        the English schedule too if you are taking an English course. Every
        conflict-free timetable is then yours to browse.
      </p>

      {pendingCourses && pendingCourses.length > 0 && (
        <p className="mt-6 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          This link has {pendingCourses.length} course
          {pendingCourses.length === 1 ? "" : "s"} and their filters ready:{" "}
          <strong>{pendingCourses.join(", ")}</strong>. Upload the schedule and
          they will be applied straight away.
        </p>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(event.dataTransfer.files);
        }}
        className={`mt-8 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging
            ? "border-sky-400 bg-sky-50"
            : "border-slate-300 bg-white hover:border-slate-400"
        }`}
      >
        <p className="text-slate-700">Drop your PDF files here</p>
        <p className="mt-1 text-sm text-slate-500">or</p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(event) => add(event.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span className="truncate text-slate-700">{file.name}</span>
              <button
                type="button"
                onClick={() =>
                  setFiles((previous) => previous.filter((f) => f !== file))
                }
                className="ml-3 shrink-0 text-slate-400 hover:text-rose-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={files.length === 0 || busy}
        onClick={submit}
        className="mt-6 w-full rounded-xl bg-sky-600 px-4 py-3 font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {busy ? "Reading the schedule…" : "Read the schedule"}
      </button>
    </section>
  );
}

function dedupe(files: File[]): File[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
