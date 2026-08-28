"""Vercel's entry point for `POST /api/parse`.

Vercel routes a request to the file whose path matches it and hands the ASGI
application below the original URL, so the route in `backend/app/main.py`
matches as it does locally. One file per endpoint, and no rewrites: a rewrite
would deliver the *rewritten* path and nothing would match.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.main import app  # noqa: E402

__all__ = ["app"]
