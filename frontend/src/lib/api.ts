import type { Semester } from "../types";

export class ApiError extends Error {}

// Sharing needs no endpoint: a link carries its selection in the URL.

export async function parseFiles(files: File[]): Promise<Semester> {
  const body = new FormData();
  for (const file of files) body.append("files", file);

  const response = await fetch("/api/parse", { method: "POST", body });
  if (!response.ok) {
    throw new ApiError(await readError(response));
  }
  return response.json();
}

/**
 * The built-in semester, for trying the site without a schedule to hand.
 *
 * It is a real faculty's courses, times and rooms with every lecturer
 * replaced by a pseudonym, served as already-parsed JSON - so the demo starts
 * instantly instead of spending several seconds reading a PDF.
 */
export async function loadSample(): Promise<Semester> {
  const response = await fetch("/sample-semester.json");
  if (!response.ok) throw new ApiError("the sample schedule could not be loaded");
  return response.json();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // fall through to the status text
  }
  return `${response.status} ${response.statusText}`;
}
