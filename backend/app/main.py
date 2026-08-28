"""HTTP surface.

The server does exactly one thing: read the semester PDFs. Timetables are
generated in the browser and a shared link carries its selection in the URL,
so nothing here holds state or grows with the number of students using it.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import Semester
from .parsing import UnknownScheduleFormat, merge_semesters, parse_pdf

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_FILES = 4

app = FastAPI(title="Semester Schedule Creator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.post("/api/parse", response_model=Semester)
async def parse(files: list[UploadFile] = File(...)) -> Semester:
    """Read one or more schedule PDFs into a single semester.

    A file that parses but has unreadable lines still returns 200 with those
    lines listed in ``warnings`` - a partial read is useful, and hiding it
    behind an error would be worse than showing the student what was missed.
    """
    if not files:
        raise HTTPException(400, "no files uploaded")
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"at most {MAX_FILES} files at a time")

    semesters = []
    for upload in files:
        content = await upload.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{upload.filename} is larger than 20 MB")
        if not content.startswith(b"%PDF"):
            raise HTTPException(400, f"{upload.filename} is not a PDF")

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
            handle.write(content)
            temporary = Path(handle.name)
        try:
            semesters.append(parse_pdf(temporary))
        except UnknownScheduleFormat as error:
            raise HTTPException(422, f"{upload.filename}: {error}") from error
        finally:
            temporary.unlink(missing_ok=True)

    return merge_semesters(semesters)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
