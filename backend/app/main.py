"""
main.py
-------
FastAPI backend for Crescent, the student planner.

Run with (from the backend/ directory):
    python -m uvicorn app.main:app --reload --port 8000

All business logic lives in the agent/service modules; this file is the
HTTP wiring. Key behaviours:

* Every change to assignments, projects, exams, to-dos, prep tasks or study
  preferences automatically re-plans the schedule -- the planner is never
  stale and never needs a manual "Regenerate" to pick up new work.
* Completing things awards XP / keeps a daily streak (gamification.py).
* /auth/* provides email+password accounts, session tokens and a one-click
  demo account. Every /students/{id}/... and /dashboard/{id} route requires
  `Authorization: Bearer <token>` for that same student (see the middleware).
* Data lives in SQLite locally, or PostgreSQL when DATABASE_URL is set -- see storage.py.

NOTE: this file deliberately does NOT use `from __future__ import annotations`.
The CRUD-route factory builds endpoints whose Pydantic body type comes from
a local variable; postponed annotations would turn it into an unresolvable
string for FastAPI.
"""
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal

from . import env  # noqa: F401  -- loads backend/.env before anything else
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, field_validator

from . import storage, course_recommender, placements_agent, gamification, auth, llm
from .planner_agent import toggle_block, skip_block, find_block
from .chatbot_agent import handle_message
from .services import replan
from .demo import create_demo_student

app = FastAPI(
    title="Crescent API",
    description="Planner Agent + Assistant Chatbot + Placements Agent for students.",
    version="4.0.0",
)

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

_PROTECTED_PATH = re.compile(r"^/(students|dashboard)/([A-Za-z0-9_\-]+)")


@app.middleware("http")
async def require_session(request: Request, call_next):
    """Every per-student route needs a valid session token for that student."""
    m = _PROTECTED_PATH.match(request.url.path)
    if m and request.method != "OPTIONS":
        header = request.headers.get("authorization", "")
        token = header[7:].strip() if header.lower().startswith("bearer ") else None
        # DB lookup runs in the threadpool so it never blocks other requests
        owner = await run_in_threadpool(auth.student_for_token, token)
        if owner is None:
            return JSONResponse({"detail": "Your session has expired. Please log in again."}, status_code=401)
        if owner != m.group(2):
            return JSONResponse({"detail": "You don't have access to this account."}, status_code=403)
    return await call_next(request)


# added after the auth middleware so CORS headers are also on 401/403 responses
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # e.g. https://crescent-.*\.vercel\.app to also allow Vercel preview deployments
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_record(student_id: str) -> dict:
    if not storage.student_exists(student_id):
        raise HTTPException(status_code=404, detail=f"Student not found: {student_id}")
    return storage.load_student(student_id)


def _blank_to_none(v):
    return v or None


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------

class ProfileIn(BaseModel):
    name: str
    degree: str
    branch: str
    year: int
    semester: int
    subjects: list[str] = []
    goals: list[str] = []
    skills: list[str] = []
    study_hours_per_day: float = Field(3, ge=0.5, le=14)
    preferred_start_hour: float = Field(18, ge=0, le=23.5)
    weekend_hours_per_day: Optional[float] = Field(None, ge=0, le=14)
    session_minutes: Optional[int] = Field(None, ge=25, le=120)
    break_minutes: Optional[int] = Field(None, ge=0, le=30)
    latest_end_hour: Optional[float] = Field(None, ge=1, le=23.75)


class SettingsIn(BaseModel):
    """Partial profile update -- only the fields sent are changed."""
    name: Optional[str] = None
    degree: Optional[str] = None
    branch: Optional[str] = None
    year: Optional[int] = None
    semester: Optional[int] = None
    subjects: Optional[list[str]] = None
    goals: Optional[list[str]] = None
    skills: Optional[list[str]] = None
    study_hours_per_day: Optional[float] = Field(None, ge=0.5, le=14)
    weekend_hours_per_day: Optional[float] = Field(None, ge=0, le=14)
    preferred_start_hour: Optional[float] = Field(None, ge=0, le=23.5)
    session_minutes: Optional[int] = Field(None, ge=25, le=120)
    break_minutes: Optional[int] = Field(None, ge=0, le=30)
    latest_end_hour: Optional[float] = Field(None, ge=1, le=23.75)
    timetable: Optional[list[dict]] = None


class AssignmentIn(BaseModel):
    title: str
    subject: str = ""
    due_date: Optional[str] = None
    status: Literal["pending", "submitted"] = "pending"
    priority: Literal["low", "medium", "high"] = "medium"
    estimated_hours: Optional[float] = Field(None, ge=0, le=100)
    notes: Optional[str] = ""
    clean_dates = field_validator("due_date", mode="before")(_blank_to_none)


class ProjectIn(BaseModel):
    title: str
    subject: Optional[str] = ""
    description: Optional[str] = ""
    due_date: Optional[str] = None
    status: Literal["pending", "in_progress", "completed"] = "pending"
    priority: Literal["low", "medium", "high"] = "medium"
    estimated_hours: Optional[float] = Field(None, ge=0, le=300)
    clean_dates = field_validator("due_date", mode="before")(_blank_to_none)


class ExamIn(BaseModel):
    subject: str
    date: str
    time: Optional[str] = None
    type: Literal["internal", "external"] = "internal"
    syllabus: Optional[str] = ""
    estimated_hours: Optional[float] = Field(None, ge=0, le=200)


class TrackedCourseIn(BaseModel):
    name: str
    provider: Optional[str] = ""
    status: Literal["ongoing", "pending", "completed"] = "pending"
    progress: float = 0


class OpportunityIn(BaseModel):
    company: str
    role: str
    deadline: Optional[str] = None
    status: Literal["open", "closed"] = "open"
    clean_dates = field_validator("deadline", mode="before")(_blank_to_none)


class ApplicationIn(BaseModel):
    company: str
    role: str = ""
    applied_date: Optional[str] = None
    rounds: list[str] = Field(default_factory=lambda: list(placements_agent.DEFAULT_ROUNDS))


class PrepTaskIn(BaseModel):
    title: str
    due_date: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"
    done: bool = False
    estimated_hours: Optional[float] = Field(None, ge=0, le=50)
    clean_dates = field_validator("due_date", mode="before")(_blank_to_none)


class TodoIn(BaseModel):
    title: str
    due_date: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"
    done: bool = False
    schedulable: bool = True
    subject: Optional[str] = "Personal"
    estimated_hours: Optional[float] = Field(None, ge=0, le=50)
    clean_dates = field_validator("due_date", mode="before")(_blank_to_none)


class UpdateIn(BaseModel):
    updates: dict


class LegacyIn(BaseModel):
    student_id: str


class CredentialsIn(BaseModel):
    email: str
    password: str


class TimetableEntry(BaseModel):
    day: int = Field(..., ge=0, le=6)
    start: str
    end: str
    label: str = "Class"


class TimetableIn(BaseModel):
    entries: list[TimetableEntry]


class BusyIn(BaseModel):
    date: str
    start: str
    end: str
    label: str = "Busy"


class RoundUpdateIn(BaseModel):
    status: Optional[Literal["na", "pending", "in_progress", "selected", "rejected"]] = None
    date: Optional[str] = "__keep__"


class ChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)


class SignupIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class FocusIn(BaseModel):
    minutes: int = Field(..., ge=1, le=240)


# Fields a client may never overwrite through the generic update route.
_PROTECTED = {"id", "created_at", "hours_logged"}

# section -> (field, value-that-means-finished, xp event, label)
_COMPLETION_RULES = {
    "assignments": ("status", "submitted", "assignment_submitted", "Submitted “{title}”"),
    "projects": ("status", "completed", "project_completed", "Completed project “{title}”"),
    "todos": ("done", True, "todo_done", "Finished “{title}”"),
    "prep_tasks": ("done", True, "prep_done", "Finished prep “{title}”"),
    "courses": ("status", "completed", "course_completed", "Completed course “{name}”"),
}
_PLAN_SECTIONS = {"assignments", "projects", "exams", "todos", "prep_tasks", "applications"}


def _completion_xp(record: dict, section: str, before: dict, after: dict) -> int:
    rule = _COMPLETION_RULES.get(section)
    if not rule:
        return 0
    field, finished, event, label = rule
    was, now = before.get(field) == finished, after.get(field) == finished
    text = label.format(title=after.get("title", ""), name=after.get("name", ""))
    if now and not was:
        return gamification.award(record, event, text)
    if was and not now:
        return gamification.revoke(record, event, f"Re-opened {text.split(' ', 1)[-1]}")
    return 0


# --------------------------------------------------------------------------
# Health / auth
# --------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "llm": llm.status()}


@app.get("/llm/status")
def llm_status():
    return llm.status()


def _session_response(record: dict) -> dict:
    return {
        "student_id": record["student_id"],
        "token": auth.create_session(record["student_id"]),
        "onboarded": record["profile"].get("onboarded", False),
        "name": record["profile"].get("name", ""),
    }


@app.post("/auth/signup")
def signup(body: SignupIn):
    try:
        record = auth.signup(body.name, body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _session_response(record)


@app.post("/auth/login")
def login(body: LoginIn):
    try:
        record = auth.login(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return _session_response(record)


@app.post("/auth/demo")
def demo_login():
    return _session_response(create_demo_student())


@app.post("/auth/legacy")
def legacy_login(body: LegacyIn):
    """Opens an account created before logins existed (no email/password yet)."""
    try:
        record = auth.legacy_login(body.student_id.strip())
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return _session_response(record)


@app.post("/auth/logout")
def logout(request: Request):
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        auth.revoke_session(header[7:].strip())
    return {"ok": True}


@app.put("/students/{student_id}/credentials")
def set_credentials(student_id: str, body: CredentialsIn):
    record = _get_record(student_id)
    try:
        auth.set_credentials(record, body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    storage.save_student(record)
    return {"ok": True, "email": record["auth"]["email"]}


# --------------------------------------------------------------------------
# Student / profile / settings
# --------------------------------------------------------------------------

@app.get("/students/{student_id}")
def get_student(student_id: str):
    return auth.public_record(_get_record(student_id))


@app.put("/students/{student_id}/profile")
def update_profile(student_id: str, profile: ProfileIn):
    record = _get_record(student_id)
    record["profile"].update({k: v for k, v in profile.model_dump().items() if v is not None})
    record["profile"]["onboarded"] = True
    replan(record)
    storage.save_student(record)
    return record["profile"]


@app.patch("/students/{student_id}/settings")
def update_settings(student_id: str, body: SettingsIn):
    record = _get_record(student_id)
    record["profile"].update(body.model_dump(exclude_none=True))
    replan(record)
    storage.save_student(record)
    return record["profile"]


@app.put("/students/{student_id}/timetable")
def set_timetable(student_id: str, body: TimetableIn):
    record = _get_record(student_id)
    entries = []
    for e in body.entries:
        if not (re.match(r"^\d{2}:\d{2}$", e.start) and re.match(r"^\d{2}:\d{2}$", e.end)) or e.end <= e.start:
            raise HTTPException(status_code=400, detail=f"Check the times for {e.label} — use HH:MM and an end after the start.")
        entries.append({"id": storage.new_id("tt"), **e.model_dump()})
    record["profile"]["timetable"] = entries
    replan(record)
    storage.save_student(record)
    return entries


@app.post("/students/{student_id}/busy")
def add_busy_time(student_id: str, body: BusyIn):
    record = _get_record(student_id)
    if body.end <= body.start:
        raise HTTPException(status_code=400, detail="The end time must be after the start time.")
    from .planner_agent import add_busy
    entry = add_busy(record, body.date, body.start, body.end, body.label)
    replan(record)
    storage.save_student(record)
    return entry


@app.delete("/students/{student_id}/busy/{busy_id}")
def remove_busy_time(student_id: str, busy_id: str):
    record = _get_record(student_id)
    record["profile"]["busy"] = [b for b in record["profile"].get("busy", []) if b.get("id") != busy_id]
    replan(record)
    storage.save_student(record)
    return {"deleted": True}


@app.delete("/students/{student_id}/notices/{key}")
def dismiss_notice(student_id: str, key: str):
    record = _get_record(student_id)
    record.get("notices", {}).pop(key, None)
    storage.save_student(record)
    return {"ok": True}


@app.get("/students/{student_id}/review")
def weekly_review(student_id: str, days: int = 14):
    """Study history and insights for the review page."""
    record = _get_record(student_id)
    _ensure_fresh_plan(record)
    today = date.today()
    hist = record.get("history", {})
    completed = (record.get("schedule") or {}).get("completed", {})
    series = []
    for i in range(days - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        h = hist.get(d, {})
        series.append({"date": d, "planned": h.get("planned", 0), "done": h.get("done", 0)})
    week_cut = (today - timedelta(days=6)).isoformat()
    by_subject: dict[str, int] = {}
    by_category: dict[str, int] = {}
    for b in completed.values():
        if b.get("date", "") >= week_cut:
            subj = b.get("subject") or "Other"
            by_subject[subj] = by_subject.get(subj, 0) + b.get("minutes", 0)
            by_category[b.get("category", "todo")] = by_category.get(b.get("category", "todo"), 0) + b.get("minutes", 0)
    this_week = series[-7:]
    planned = sum(x["planned"] for x in this_week)
    done = sum(x["done"] for x in this_week)
    schedule = record.get("schedule") or {}
    behind: dict[str, dict] = {}
    for item in (schedule.get("overdue") or []) + (schedule.get("at_risk") or []):
        src = next((a for a in record.get("assignments", []) + record.get("projects", []) if a.get("id") in (item.get("id"), item.get("ref_id"))), None)
        subj = (src or {}).get("subject") or ("Placement" if item.get("category") == "placement" else "Other")
        e = behind.setdefault(subj, {"subject": subj, "overdue": 0, "at_risk": 0})
        e["overdue" if item in (schedule.get("overdue") or []) else "at_risk"] += 1
    activity = record.get("stats", {}).get("activity", [])
    week_wins = [a for a in activity if a.get("at", "") >= week_cut and a.get("xp", 0) > 0]
    return {
        "series": series,
        "week": {"planned_minutes": planned, "done_minutes": done, "completion": round(done / planned, 2) if planned else 0,
                 "best_day": max(this_week, key=lambda x: x["done"])["date"] if done else None,
                 "wins": len(week_wins), "xp": sum(a["xp"] for a in week_wins)},
        "by_subject": sorted([{"subject": k, "minutes": v} for k, v in by_subject.items()], key=lambda x: -x["minutes"]),
        "by_category": by_category,
        "behind": sorted(behind.values(), key=lambda x: -(x["overdue"] * 2 + x["at_risk"])),
        "stats": gamification.summary(record),
    }


def _ics_escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@app.get("/students/{student_id}/calendar.ics")
def calendar_export(student_id: str):
    """Study sessions, deadlines, exams and placement rounds as an .ics calendar file."""
    record = _get_record(student_id)
    _ensure_fresh_plan(record)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Crescent//Student Planner//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Crescent study plan"]

    def event(uid, summary, start, end=None, all_day=False, desc=""):
        lines.extend(["BEGIN:VEVENT", f"UID:{uid}@crescent", f"DTSTAMP:{stamp}"])
        if all_day:
            d = start.replace("-", "")
            nxt = (date.fromisoformat(start) + timedelta(days=1)).isoformat().replace("-", "")
            lines.extend([f"DTSTART;VALUE=DATE:{d}", f"DTEND;VALUE=DATE:{nxt}"])
        else:
            lines.extend([f"DTSTART:{start}", f"DTEND:{end}"])
        lines.append(f"SUMMARY:{_ics_escape(summary)}")
        if desc:
            lines.append(f"DESCRIPTION:{_ics_escape(desc)}")
        lines.append("END:VEVENT")

    for day_key, blocks in (record.get("schedule") or {}).get("days", {}).items():
        for b in blocks:
            d = day_key.replace("-", "")
            event(b["id"], f"📚 {b['title']}", f"{d}T{b['start'].replace(':', '')}00", f"{d}T{b['end'].replace(':', '')}00",
                  desc=b.get("note") or f"{b.get('category', '').replace('_', ' ')} · planned by Crescent")
    for a in record.get("assignments", []):
        if a.get("status") == "pending" and a.get("due_date"):
            event(f"due-{a['id']}", f"⏰ Due: {a['title']}", a["due_date"], all_day=True, desc=a.get("subject", ""))
    for e in record.get("exams", []):
        if e.get("date"):
            event(f"exam-{e['id']}", f"📝 {e['subject']} exam", e["date"], all_day=True)
    for r in placements_agent.upcoming_rounds(record):
        event(f"round-{r['app_id']}-{r['key']}", f"💼 {r['company']} — {r['label']}", r["date"], all_day=True)
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar",
                    headers={"Content-Disposition": 'attachment; filename="crescent-plan.ics"'})


@app.get("/students/{student_id}/stats")
def get_stats(student_id: str):
    return gamification.summary(_get_record(student_id))


@app.post("/students/{student_id}/focus")
def log_focus(student_id: str, body: FocusIn):
    record = _get_record(student_id)
    record["stats"]["focus_minutes"] = record["stats"].get("focus_minutes", 0) + body.minutes
    xp = gamification.award(record, "focus_session", f"Finished a {body.minutes}-minute focus session",
                            multiplier=max(0.5, min(2.0, body.minutes / 25)))
    storage.save_student(record)
    return {"xp": xp, "stats": gamification.summary(record)}


# --------------------------------------------------------------------------
# Dashboard
# --------------------------------------------------------------------------

def _ensure_fresh_plan(record: dict) -> bool:
    """Re-plans if the stored plan was made on an earlier day (or never)."""
    schedule = record.get("schedule") or {}
    window = schedule.get("window") or {}
    if window.get("start") != date.today().isoformat():
        replan(record)
        return True
    return False


@app.get("/dashboard/{student_id}")
def get_dashboard(student_id: str):
    record = _get_record(student_id)
    if _ensure_fresh_plan(record):
        storage.save_student(record)
    today = date.today().isoformat()
    schedule = record["schedule"]

    pending_assignments = [a for a in record["assignments"] if a["status"] == "pending"]
    submitted_assignments = [a for a in record["assignments"] if a["status"] == "submitted"]
    active_projects = [p for p in record["projects"] if p["status"] != "completed"]
    upcoming_exams = sorted([e for e in record["exams"] if e.get("date", "") >= today], key=lambda e: e["date"])
    opportunities = record["placements"]["opportunities"]
    applications = record["placements"]["applications"]
    pending_prep = [t for t in record["placements"]["prep_tasks"] if not t["done"]]
    pending_todos = [t for t in record["todos"] if not t["done"]]
    today_blocks = schedule.get("days", {}).get(today, [])

    deadlines = []
    for a in pending_assignments:
        if a.get("due_date"):
            deadlines.append({"type": "assignment", "id": a["id"], "title": a["title"], "subject": a.get("subject", ""), "date": a["due_date"]})
    for p in active_projects:
        if p.get("due_date"):
            deadlines.append({"type": "project", "id": p["id"], "title": p["title"], "subject": p.get("subject", ""), "date": p["due_date"]})
    for e in upcoming_exams:
        deadlines.append({"type": "exam", "id": e["id"], "title": f"{e['subject']} exam", "subject": e["subject"], "date": e["date"]})
    for t in pending_todos:
        if t.get("due_date"):
            deadlines.append({"type": "todo", "id": t["id"], "title": t["title"], "subject": t.get("subject", ""), "date": t["due_date"]})
    for r in placements_agent.upcoming_rounds(record):
        deadlines.append({"type": "placement", "id": f"{r['app_id']}-{r['key']}", "title": f"{r['company']} — {r['label']}", "subject": "Placement", "date": r["date"]})
    for o in opportunities:
        if o.get("deadline") and o.get("status", "open") == "open":
            deadlines.append({"type": "placement", "id": o["id"], "title": f"{o['company']} — {o['role']}", "subject": "Placement", "date": o["deadline"]})
    deadlines.sort(key=lambda d: d["date"])

    return {
        "profile": record["profile"],
        "today_plan": today_blocks,
        "schedule_explanation": schedule.get("explanation", ""),
        "overdue": schedule.get("overdue", []),
        "at_risk": schedule.get("at_risk", []),
        "counts": {
            "pending_assignments": len(pending_assignments),
            "submitted_assignments": len(submitted_assignments),
            "active_projects": len(active_projects),
            "upcoming_exams": len(upcoming_exams),
            "open_opportunities": len([o for o in opportunities if o.get("status", "open") == "open"]),
            "applications": len(applications),
            "pending_prep_tasks": len(pending_prep),
            "pending_todos": len(pending_todos),
        },
        "upcoming_deadlines": deadlines[:10],
        "courses": record["courses"],
        "stats": gamification.summary(record),
        "llm_enabled": llm.is_enabled(),
        "upcoming_rounds": placements_agent.upcoming_rounds(record)[:6],
        "notices": record.get("notices", {}),
        "busy_today": schedule.get("busy", {}).get(today, []),
    }


# --------------------------------------------------------------------------
# Generic CRUD factory
# --------------------------------------------------------------------------

def _register_crud(prefix: str, section: str, subsection: Optional[str], id_prefix: str, schema):
    """Builds list/add/update/delete routes. `subsection` is for placements.* lists."""
    key = subsection or section

    def items_of(record):
        return record[section][subsection] if subsection else record[section]

    def after_change(record):
        if key in _PLAN_SECTIONS:
            replan(record)

    @app.post(f"/students/{{student_id}}/{prefix}", name=f"add_{key}")
    def add_item(student_id: str, item: schema):  # type: ignore
        record = _get_record(student_id)
        data = item.model_dump()
        if key == "applications":
            data["rounds"] = placements_agent.make_rounds(data.get("rounds") or placements_agent.DEFAULT_ROUNDS)
            data["applied_date"] = data.get("applied_date") or date.today().isoformat()
        if subsection:
            created = storage.append_nested_item(record, section, subsection, data, id_prefix)
            if key == "applications":
                placements_agent.summarize(created)
        else:
            created = storage.append_item(record, section, data, id_prefix)
        after_change(record)
        storage.save_student(record)
        return created

    @app.get(f"/students/{{student_id}}/{prefix}", name=f"list_{key}")
    def list_items(student_id: str):
        return items_of(_get_record(student_id))

    @app.put(f"/students/{{student_id}}/{prefix}/{{item_id}}", name=f"update_{key}")
    def update_item_route(student_id: str, item_id: str, body: UpdateIn):
        record = _get_record(student_id)
        updates = {k: v for k, v in body.updates.items() if k not in _PROTECTED}
        for date_field in ("due_date", "deadline"):
            if updates.get(date_field) == "":
                updates[date_field] = None
        before = next((dict(i) for i in items_of(record) if i["id"] == item_id), None)
        if before is None:
            raise HTTPException(status_code=404, detail="Item not found")
        if subsection:
            updated = storage.update_nested_item(record, section, subsection, item_id, updates)
        else:
            updated = storage.update_item(record, section, item_id, updates)
        xp = _completion_xp(record, key, before, updated)
        after_change(record)
        storage.save_student(record)
        return {**updated, "_xp": xp}

    @app.delete(f"/students/{{student_id}}/{prefix}/{{item_id}}", name=f"delete_{key}")
    def delete_item_route(student_id: str, item_id: str):
        record = _get_record(student_id)
        ok = (storage.delete_nested_item(record, section, subsection, item_id) if subsection
              else storage.delete_item(record, section, item_id))
        if not ok:
            raise HTTPException(status_code=404, detail="Item not found")
        after_change(record)
        storage.save_student(record)
        return {"deleted": True}


_register_crud("assignments", "assignments", None, "asg", AssignmentIn)
_register_crud("projects", "projects", None, "proj", ProjectIn)
_register_crud("exams", "exams", None, "exam", ExamIn)
_register_crud("courses", "courses", None, "crs", TrackedCourseIn)
_register_crud("todos", "todos", None, "todo", TodoIn)
_register_crud("placements/opportunities", "placements", "opportunities", "opp", OpportunityIn)
_register_crud("placements/applications", "placements", "applications", "app", ApplicationIn)
_register_crud("placements/prep_tasks", "placements", "prep_tasks", "prep", PrepTaskIn)


# --------------------------------------------------------------------------
# Courses
# --------------------------------------------------------------------------

@app.get("/students/{student_id}/courses/recommended")
def recommended_courses(student_id: str):
    return course_recommender.recommend_courses(_get_record(student_id)["profile"])


@app.get("/catalog")
def catalog():
    return course_recommender.get_catalog()


# --------------------------------------------------------------------------
# Planner Agent
# --------------------------------------------------------------------------

@app.post("/students/{student_id}/plan/generate")
def generate_plan(student_id: str, days_ahead: int = 7):
    record = _get_record(student_id)
    schedule = replan(record, use_llm=True, days_ahead=max(1, min(days_ahead, 14)))
    storage.save_student(record)
    return schedule


@app.get("/students/{student_id}/plan")
def get_plan(student_id: str):
    record = _get_record(student_id)
    if _ensure_fresh_plan(record):
        storage.save_student(record)
    return record["schedule"]


@app.post("/students/{student_id}/plan/blocks/{block_id}/toggle")
def toggle_plan_block(student_id: str, block_id: str):
    record = _get_record(student_id)
    block = toggle_block(record, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="That session is no longer in your plan. Refresh to see the latest plan.")
    if block["date"] == date.today().isoformat():
        h = record.setdefault("history", {}).setdefault(block["date"], {"planned": 0, "done": 0})
        h["done"] = max(0, h.get("done", 0) + (block["minutes"] if block["done"] else -block["minutes"]))
    label = f"Studied “{block['title']}” ({block['start']}–{block['end']})"
    xp = gamification.award(record, "block_done", label) if block["done"] else gamification.revoke(record, "block_done", label)
    storage.save_student(record)
    return {"block": block, "xp": xp, "stats": gamification.summary(record)}


@app.post("/students/{student_id}/plan/blocks/{block_id}/skip")
def skip_plan_block(student_id: str, block_id: str):
    """Can't do this session -> its time becomes busy and the work moves to another free slot."""
    record = _get_record(student_id)
    block = skip_block(record, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="That session is no longer in your plan.")
    schedule = replan(record)
    storage.save_student(record)
    moved = next((b for d in sorted(schedule["days"]) for b in schedule["days"][d]
                  if b["ref_id"] == block["ref_id"] and (d, b["start"]) > (block["date"], block["start"])), None)
    return {"skipped": block, "moved_to": moved, "schedule": schedule}


# --------------------------------------------------------------------------
# Chatbot Agent
# --------------------------------------------------------------------------

@app.post("/students/{student_id}/chat")
def chat(student_id: str, body: ChatIn):
    record = _get_record(student_id)
    result = handle_message(record, body.message)
    storage.save_student(record)
    return result


@app.get("/students/{student_id}/chat/history")
def chat_history(student_id: str):
    return _get_record(student_id).get("chat_history", [])[-60:]


@app.delete("/students/{student_id}/chat/history")
def clear_chat_history(student_id: str):
    record = _get_record(student_id)
    record["chat_history"] = []
    storage.save_student(record)
    return {"cleared": True}


# --------------------------------------------------------------------------
# Placements Agent
# --------------------------------------------------------------------------

class EligibilityProfileIn(BaseModel):
    cgpa: float = Field(0, ge=0, le=10)
    active_backlogs: int = Field(0, ge=0, le=50)


class AdvanceApplicationIn(BaseModel):
    action: Literal["advance", "reject"]


@app.get("/jobs")
def list_jobs():
    return placements_agent.get_jobs()


@app.get("/placements/pipeline-stages")
def pipeline_stages():
    return placements_agent.PIPELINE_STAGES


@app.get("/students/{student_id}/placements/eligibility")
def get_eligibility(student_id: str):
    return placements_agent.build_eligibility_report(_get_record(student_id)["profile"])


@app.put("/students/{student_id}/placements/eligibility-profile")
def update_eligibility_profile(student_id: str, body: EligibilityProfileIn):
    record = _get_record(student_id)
    record["profile"]["cgpa"] = body.cgpa
    record["profile"]["active_backlogs"] = body.active_backlogs
    storage.save_student(record)
    return record["profile"]


@app.post("/students/{student_id}/placements/apply/{job_id}")
def apply_to_job(student_id: str, job_id: str):
    record = _get_record(student_id)
    try:
        application = placements_agent.easy_apply(record, job_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    storage.save_student(record)
    return application


@app.put("/students/{student_id}/placements/applications/{application_id}/advance")
def advance_application_route(student_id: str, application_id: str, body: AdvanceApplicationIn):
    record = _get_record(student_id)
    try:
        updated = placements_agent.advance_application(record, application_id, body.action)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if body.action == "advance":
        gamification.award(record, "application_advanced", f"Cleared a round at {updated['company']}")
    storage.save_student(record)
    return updated


@app.get("/placements/rounds")
def round_types():
    return [{"key": k, "label": l} for k, l in placements_agent.ROUND_TYPES]


@app.put("/students/{student_id}/placements/applications/{application_id}/rounds/{round_key}")
def update_round_route(student_id: str, application_id: str, round_key: str, body: RoundUpdateIn):
    record = _get_record(student_id)
    app_ = placements_agent.find_application(record, application_id)
    if app_ is None:
        raise HTTPException(status_code=404, detail="Application not found")
    before = next((r["status"] for r in placements_agent.migrate_application(app_)["rounds"] if r["key"] == round_key), None)
    try:
        placements_agent.update_round(app_, round_key, body.status, body.date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    xp = 0
    if body.status == "selected" and before != "selected":
        xp = gamification.award(record, "application_advanced", f"Cleared {placements_agent.ROUND_LABEL[round_key].lower()} at {app_['company']}")
    replan(record)
    storage.save_student(record)
    return {**app_, "_xp": xp}


@app.get("/students/{student_id}/placements/resume-suggestions")
def get_resume_suggestions(student_id: str):
    return placements_agent.resume_suggestions(_get_record(student_id))
