"""
storage.py
----------
Persistence layer.
  * On your computer: SQLite (Python's built-in sqlite3, nothing to install),
    stored at backend/data/crescent.db.
  * When deployed (e.g. Vercel + Neon): PostgreSQL, used automatically
    whenever DATABASE_URL (or POSTGRES_URL) is set.

Each student is one row: the full record (profile, academics, placements,
to-dos, schedule, chat history, stats) is stored as JSON in `data`, with
`email` broken out into its own indexed column for logins. Login sessions
live in their own table (see auth.py).

Every other module only calls the functions in this file, so moving to
PostgreSQL later means changing this file alone.

Upgrading from the JSON-file version: on first start, any
data/students/*.json files are imported automatically and the originals are
moved to data/legacy_json_backup/ (nothing is deleted).
"""
from __future__ import annotations
import json
import os
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from . import env  # noqa: F401  (DATABASE_PATH may come from .env)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.abspath(os.environ.get("DATABASE_PATH") or os.path.join(BACKEND_DIR, "data", "crescent.db"))
# Old JSON files are looked for next to the database being used, so a test or
# temporary database never touches the real data folder.
DATA_ROOT = os.path.dirname(DB_PATH)
LEGACY_DIR = os.path.join(DATA_ROOT, "students")

_lock = threading.RLock()
_conn = None

# Postgres (e.g. Neon on Vercel) when DATABASE_URL/POSTGRES_URL is set, else SQLite.
DATABASE_URL = (os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))

_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS students (
        id          TEXT PRIMARY KEY,
        email       TEXT UNIQUE,
        data        TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS sessions (
        token_hash  TEXT PRIMARY KEY,
        student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL,
        expires_at  TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id)",
]


def _pg_connect():
    import ssl
    from urllib.parse import urlparse, unquote, parse_qs
    import pg8000.dbapi

    u = urlparse(DATABASE_URL)
    params = parse_qs(u.query)
    local = u.hostname in ("localhost", "127.0.0.1")
    need_ssl = params.get("sslmode", ["require" if not local else "disable"])[0] != "disable"
    conn = pg8000.dbapi.connect(
        user=unquote(u.username or ""), password=unquote(u.password or ""),
        host=u.hostname, port=u.port or 5432, database=(u.path or "/postgres").lstrip("/") or "postgres",
        ssl_context=ssl.create_default_context() if need_ssl else None, timeout=20,
    )
    conn.autocommit = True
    return conn


def connect():
    """Opens (once) and returns the database connection, creating tables on first use."""
    global _conn
    with _lock:
        if _conn is None:
            if USE_POSTGRES:
                _conn = _pg_connect()
                cur = _conn.cursor()
                for stmt in _SCHEMA:
                    cur.execute(stmt)
            else:
                os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
                _conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
                _conn.row_factory = sqlite3.Row
                _conn.execute("PRAGMA journal_mode=WAL")
                _conn.execute("PRAGMA foreign_keys=ON")
                for stmt in _SCHEMA:
                    _conn.execute(stmt)
                _import_legacy_json(_conn)
        return _conn


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Runs one statement and returns rows as dicts. SQL uses `?` placeholders on both databases."""
    global _conn
    with _lock:
        for attempt in (1, 2):
            conn = connect()
            try:
                if USE_POSTGRES:
                    cur = conn.cursor()
                    cur.execute(sql.replace("?", "%s"), params)
                    if not cur.description:
                        return []
                    cols = [c[0] for c in cur.description]
                    return [dict(zip(cols, row)) for row in cur.fetchall()]
                return [dict(r) for r in conn.execute(sql, params).fetchall()]
            except Exception as e:
                # serverless: a pooled connection may have been closed -- reconnect once
                if USE_POSTGRES and attempt == 1 and type(e).__name__ in ("InterfaceError", "OperationalError", "ConnectionResetError", "BrokenPipeError"):
                    _conn = None
                    continue
                raise
    return []


def query_one(sql: str, params: tuple = ()) -> Optional[dict]:
    rows = query(sql, params)
    return rows[0] if rows else None


def _import_legacy_json(conn: sqlite3.Connection) -> None:
    if not os.path.isdir(LEGACY_DIR):
        return
    files = [f for f in os.listdir(LEGACY_DIR) if f.endswith(".json") and not f.startswith("_")]
    if not files:
        return
    backup = os.path.join(DATA_ROOT, "legacy_json_backup")
    os.makedirs(backup, exist_ok=True)
    for fname in files:
        path = os.path.join(LEGACY_DIR, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                record = json.load(f)
            sid = record.get("student_id") or fname[:-5]
            exists = conn.execute("SELECT 1 FROM students WHERE id=?", (sid,)).fetchone()
            if not exists:
                email = (record.get("auth") or {}).get("email")
                conn.execute(
                    "INSERT INTO students (id, email, data, created_at, updated_at) VALUES (?,?,?,?,?)",
                    (sid, email, json.dumps(record, ensure_ascii=False), now_iso(), now_iso()),
                )
            shutil.move(path, os.path.join(backup, fname))
        except Exception as e:  # never block startup on one bad file
            print(f"[storage] could not import {fname}: {e}")
    users_index = os.path.join(LEGACY_DIR, "_users.json")
    if os.path.exists(users_index):
        shutil.move(users_index, os.path.join(backup, "_users.json"))


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def student_exists(student_id: str) -> bool:
    return query_one("SELECT 1 AS ok FROM students WHERE id=?", (student_id,)) is not None


def default_student_record(student_id: str) -> dict:
    return {
        "student_id": student_id,
        "profile": {
            "name": "",
            "degree": "",
            "branch": "",
            "year": 1,
            "semester": 1,
            "subjects": [],
            "goals": [],
            "skills": [],
            "study_hours_per_day": 3,
            "preferred_start_hour": 18,
            "timetable": [],      # weekly classes: [{"id","day":0-6,"start":"09:00","end":"13:00","label"}]
            "busy": [],           # one-off busy times: [{"id","date","start","end","label"}]
            "created_at": now_iso(),
            "onboarded": False,
        },
        "assignments": [],
        "projects": [],
        "exams": [],
        "courses": [],
        "placements": {
            "opportunities": [],
            "applications": [],
            "prep_tasks": [],
        },
        "todos": [],
        "schedule": {"generated_at": None, "days": {}, "explanation": ""},
        "chat_history": [],
        "history": {},          # per-day study log: {"YYYY-MM-DD": {"planned": min, "done": min}}
        "notices": {},          # one-off messages for the dashboard (e.g. missed sessions)
        "stats": default_stats(),
        "auth": {},
    }


def default_stats() -> dict:
    return {
        "xp": 0,
        "streak": 0,
        "best_streak": 0,
        "last_active_date": None,
        "completed_total": 0,
        "focus_minutes": 0,
        "activity": [],   # recent wins: [{"text", "xp", "at"}]
    }


def _migrate(record: dict) -> dict:
    """
    Fills in any keys added after a record was first created, so older
    student files keep working with newer code (no manual migration needed).
    """
    template = default_student_record(record.get("student_id", "unknown"))
    for key, value in template.items():
        if key not in record:
            record[key] = value
    for key, value in template["profile"].items():
        record["profile"].setdefault(key, value)
    for key, value in template["placements"].items():
        record["placements"].setdefault(key, value)
    for key, value in default_stats().items():
        record["stats"].setdefault(key, value)
    record["schedule"].setdefault("days", {})
    from .placements_agent import migrate_application
    for app in record["placements"]["applications"]:
        migrate_application(app)
    record["schedule"].setdefault("explanation", "")
    return record


def load_student(student_id: str) -> dict:
    row = query_one("SELECT data FROM students WHERE id=?", (student_id,))
    if row is None:
        raise FileNotFoundError(f"No student record for id={student_id}")
    return _migrate(json.loads(row["data"]))


def save_student(record: dict) -> None:
    email = (record.get("auth") or {}).get("email") or None
    data = json.dumps(record, ensure_ascii=False)
    query(
        """INSERT INTO students (id, email, data, created_at, updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET email=excluded.email, data=excluded.data, updated_at=excluded.updated_at""",
        (record["student_id"], email, data, now_iso(), now_iso()),
    )


def find_student_by_email(email: str) -> Optional[dict]:
    row = query_one("SELECT data FROM students WHERE email=?", (email,))
    return _migrate(json.loads(row["data"])) if row else None


def create_student(student_id: Optional[str] = None) -> dict:
    sid = student_id or new_id("stu")
    if student_exists(sid):
        raise ValueError(f"Student id already exists: {sid}")
    record = default_student_record(sid)
    save_student(record)
    return record


def get_or_create(student_id: str) -> dict:
    if student_exists(student_id):
        return load_student(student_id)
    record = default_student_record(student_id)
    save_student(record)
    return record


def delete_student(student_id: str) -> None:
    query("DELETE FROM students WHERE id=?", (student_id,))


def list_student_ids() -> list[str]:
    return [r["id"] for r in query("SELECT id FROM students")]


# ---- generic list helpers (used for assignments/projects/exams/todos/etc.) ----

def append_item(record: dict, section: str, item: dict, id_prefix: str) -> dict:
    item = dict(item)
    item.setdefault("id", new_id(id_prefix))
    item.setdefault("created_at", now_iso())
    record[section].append(item)
    return item


def update_item(record: dict, section: str, item_id: str, updates: dict) -> Optional[dict]:
    for item in record[section]:
        if item["id"] == item_id:
            item.update(updates)
            item["updated_at"] = now_iso()
            return item
    return None


def delete_item(record: dict, section: str, item_id: str) -> bool:
    before = len(record[section])
    record[section] = [i for i in record[section] if i["id"] != item_id]
    return len(record[section]) != before


def append_nested_item(record: dict, section: str, subsection: str, item: dict, id_prefix: str) -> dict:
    item = dict(item)
    item.setdefault("id", new_id(id_prefix))
    item.setdefault("created_at", now_iso())
    record[section][subsection].append(item)
    return item


def update_nested_item(record: dict, section: str, subsection: str, item_id: str, updates: dict) -> Optional[dict]:
    for item in record[section][subsection]:
        if item["id"] == item_id:
            item.update(updates)
            item["updated_at"] = now_iso()
            return item
    return None


def delete_nested_item(record: dict, section: str, subsection: str, item_id: str) -> bool:
    before = len(record[section][subsection])
    record[section][subsection] = [i for i in record[section][subsection] if i["id"] != item_id]
    return len(record[section][subsection]) != before
