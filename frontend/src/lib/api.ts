import type { Semester } from "../types";

export class ApiError extends Error {}

export async function parseFiles(files: File[]): Promise<Semester> {
  const body = new FormData();
  for (const file of files) body.append("files", file);

  const response = await fetch("/api/parse", { method: "POST", body });
  if (!response.ok) {
    throw new ApiError(await readError(response));
  }
  return response.json();
}

export async function createShare(payload: unknown): Promise<string> {
  const response = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  if (!response.ok) throw new ApiError(await readError(response));
  const { id } = await response.json();
  return id;
}

export async function readShare<T>(id: string): Promise<T> {
  const response = await fetch(`/api/share/${encodeURIComponent(id)}`);
  if (!response.ok) throw new ApiError(await readError(response));
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
