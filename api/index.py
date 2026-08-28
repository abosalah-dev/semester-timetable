"""Vercel's entry point.

Vercel serves this directory as serverless functions and looks for an ASGI
application called `app`. The application itself lives in `backend/`, where it
can be run and tested normally; this file only puts it on the path.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.main import app  # noqa: E402

__all__ = ["app"]
