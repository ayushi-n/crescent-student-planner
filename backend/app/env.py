"""
env.py
------
Tiny, dependency-free .env loader. Reads backend/.env (if present) into
os.environ once at import time, without overwriting variables that are
already set in the real environment.

The original project documented `export $(cat .env | xargs)`, which doesn't
work in Windows terminals -- so the API key was never actually loaded and
the chatbot/planner silently fell back to offline mode. Loading it here
means `uvicorn app.main:app` just works on every OS.
"""
from __future__ import annotations
import os

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_LOADED = False


def load_env() -> None:
    global _LOADED
    if _LOADED:
        return
    _LOADED = True
    path = os.path.join(_BACKEND_DIR, ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip().removeprefix("export ").strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


load_env()

import time as _time

# Plans use local time. Vercel servers run on UTC, so set APP_TIMEZONE
# (e.g. "IST-5:30" for India) to make "today" and session times local.
_tz = os.environ.get("APP_TIMEZONE")
if _tz:
    os.environ["TZ"] = _tz
    _time.tzset()
