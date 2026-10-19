"""
planner_agent.py
-----------------
The Planner/Scheduling Agent. Deterministic core -- no LLM decides *what*
goes on the schedule. It:

  1. Collects every open work item: assignments, projects, exam prep,
     placement prep and schedulable to-dos -- *including overdue ones*,
     which are scheduled first as "catch-up" work instead of vanishing.
  2. Works out how many hours each item still needs: the student's own
     estimate if they gave one, otherwise a sensible default that grows
     with the runway to the deadline, minus hours already logged by
     ticking off planned blocks.
  3. Scores urgency (deadline proximity x priority x category weight).
  4. Fills each day's study budget with focused sessions (default 60 min)
     separated by short breaks, starting at the student's preferred time --
     and, for today, never earlier than *now*, so the plan is never already
     in the past when you open it. Nothing runs past the student's
     "stop by" time (default 23:00).
  5. Keeps blocks you've already ticked off today in place when re-planning.
  6. Flags items "at risk" when they can't get the hours they need before
     their deadline, so the student finds out early.
  7. Works around the student's weekly class timetable and one-off busy
     times ("I'm busy tonight", skipped sessions) -- sessions only go into
     genuinely free gaps between the start time and the "stop by" time.
  8. Schedules prep before dated placement rounds (coding test, interviews,
     aptitude, GD, HR) handed over by the Placements Agent.

An LLM (if configured) or an offline template only *explains* the result.
"""
from __future__ import annotations
import math
from datetime import date, datetime, timedelta
from typing import Optional

from . import llm

PRIORITY_WEIGHT = {"high": 1.5, "medium": 1.0, "low": 0.7}
CATEGORY_WEIGHT = {
    "exam_prep": 1.35,
    "assignment": 1.15,
    "project": 1.0,
    "placement": 1.0,
    "todo": 0.9,
}
DEFAULT_HOURS = {"assignment": 2.0, "project": 4.0, "placement": 1.5, "todo": 0.5}
LAST_SLOT_HOUR = 23.75          # hard ceiling: 23:45
DEFAULT_LATEST_END = 23.0       # default "stop studying by" time (profile: latest_end_hour)
SLOT = 0.25                     # 15-minute grid
MIN_BLOCK = 0.5                 # no study session shorter than 30 min (unless the task itself is)


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def _snap_up(hour: float) -> float:
    return math.ceil(round(hour / SLOT, 6)) * SLOT


def _format_hour(hour_float: float) -> str:
    total_minutes = int(round(hour_float * 60))
    h, m = divmod(total_minutes, 60)
    return f"{h % 24:02d}:{m:02d}"


def _hours_from_hhmm(value: str) -> float:
    h, m = (int(x) for x in value.split(":"))
    return h + m / 60


def busy_intervals(profile: dict, day: date) -> list[tuple[float, float]]:
    """Weekly classes for that weekday + one-off busy blocks for that date, merged and sorted."""
    spans = []
    for t in profile.get("timetable") or []:
        try:
            if int(t.get("day", -1)) == day.weekday():
                spans.append((_hours_from_hhmm(t["start"]), _hours_from_hhmm(t["end"])))
        except (KeyError, ValueError):
            continue
    for b in profile.get("busy") or []:
        if b.get("date") == day.isoformat():
            try:
                spans.append((_hours_from_hhmm(b["start"]), _hours_from_hhmm(b["end"])))
            except (KeyError, ValueError):
                continue
    spans = sorted((s, e) for s, e in spans if e > s)
    merged: list[tuple[float, float]] = []
    for s_, e_ in spans:
        if merged and s_ <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e_))
        else:
            merged.append((s_, e_))
    return merged


def _free_slot(cursor: float, busy: list[tuple[float, float]], latest: float) -> tuple[float, float]:
    """Moves the cursor out of busy time and returns (cursor, free hours before the next busy span)."""
    while True:
        for s_, e_ in busy:
            if s_ <= cursor < e_:
                cursor = _snap_up(e_)
        nxt = min([s_ for s_, _ in busy if s_ > cursor] + [latest])
        avail = nxt - cursor
        if avail >= MIN_BLOCK - 1e-9 or nxt >= latest:
            return cursor, max(0.0, avail)
        # gap too small for a session: jump past the next busy span
        cursor = _snap_up(next(e_ for s_, e_ in busy if s_ == nxt))


def _default_hours(category: str, due: Optional[date], today: date, priority: str) -> float:
    base = DEFAULT_HOURS[category]
    if due is not None and category in ("assignment", "project"):
        lead = max((due - today).days, 1)
        growth = {"assignment": 0.35, "project": 0.6}[category]
        cap = {"assignment": 7.0, "project": 12.0}[category]
        base = min(cap, base + lead * growth)
    mult = {"high": 1.15, "medium": 1.0, "low": 0.85}.get(priority, 1.0)
    return round(base * mult * 4) / 4


def _remaining(total: float, logged: float) -> float:
    left = total - (logged or 0)
    # still open but already over the estimate -> keep a short wrap-up session
    return max(left, 0.5)


def build_work_pool(record: dict, today: date) -> list[dict]:
    pool: list[dict] = []

    def add(ref_id, category, title, subject, due, priority, total, logged, overdue=False, note=None):
        pool.append({
            "ref_id": ref_id, "category": category, "title": title, "subject": subject or "",
            "due_date": due, "priority": priority, "overdue": overdue, "note": note,
            "total_hours": total, "remaining_hours": _remaining(total, logged),
        })

    for a in record.get("assignments", []):
        if a.get("status") != "pending":
            continue
        due = _parse_date(a.get("due_date"))
        pr = a.get("priority", "medium")
        overdue = bool(due and due < today)
        total = float(a.get("estimated_hours") or 0) or _default_hours("assignment", due, today, pr)
        title = a.get("title") or "Untitled assignment"
        add(a["id"], "assignment", f"Catch up: {title}" if overdue else title, a.get("subject"),
            today if overdue else due, "high" if overdue else pr, total, a.get("hours_logged", 0), overdue)

    for p in record.get("projects", []):
        if p.get("status") not in ("pending", "in_progress"):
            continue
        due = _parse_date(p.get("due_date"))
        pr = p.get("priority", "medium")
        overdue = bool(due and due < today)
        total = float(p.get("estimated_hours") or 0) or _default_hours("project", due, today, pr)
        title = p.get("title") or "Untitled project"
        add(p["id"], "project", f"Catch up: {title}" if overdue else title, p.get("subject"),
            today if overdue else due, "high" if overdue else pr, total, p.get("hours_logged", 0), overdue)

    for e in record.get("exams", []):
        exam_date = _parse_date(e.get("date"))
        if not exam_date or exam_date <= today:
            continue  # prep happens on the days *before* the exam
        lead = (exam_date - today).days
        total = float(e.get("estimated_hours") or 0) or min(12.0, 2.0 + lead * 0.75)
        kind = "Final" if e.get("type") == "external" else "Internal"
        add(e["id"], "exam_prep", f"{e.get('subject', 'Exam')} — {kind.lower()} exam prep", e.get("subject"),
            exam_date - timedelta(days=1), "high", total, e.get("hours_logged", 0))

    for t in record.get("placements", {}).get("prep_tasks", []):
        if t.get("done"):
            continue
        due = _parse_date(t.get("due_date"))
        overdue = bool(due and due < today)
        add(t["id"], "placement", t.get("title") or "Placement prep", "Placement",
            today if overdue else due, t.get("priority", "medium"),
            float(t.get("estimated_hours") or 0) or DEFAULT_HOURS["placement"], t.get("hours_logged", 0), overdue)

    # Dated placement rounds -> targeted prep before the round (from the Placements Agent)
    from .placements_agent import upcoming_rounds, PREP_HOURS, PREP_FOCUS
    for r in upcoming_rounds(record, today.isoformat()):
        hours = PREP_HOURS.get(r["key"])
        round_day = _parse_date(r["date"])
        if not hours or not round_day or round_day <= today:
            continue
        src = find_source_item(record, "placement", f"round:{r['app_id']}:{r['key']}") or {}
        add(f"round:{r['app_id']}:{r['key']}", "placement", f"{r['company']} {r['label'].lower()} prep", "Placement",
            round_day - timedelta(days=1), "high", hours, src.get("hours_logged", 0), note=PREP_FOCUS.get(r["key"]))

    for td in record.get("todos", []):
        if td.get("done") or not td.get("schedulable", True):
            continue
        due = _parse_date(td.get("due_date"))
        overdue = bool(due and due < today)
        add(td["id"], "todo", td.get("title") or "To-do", td.get("subject") or "Personal",
            today if overdue else due, td.get("priority", "medium"),
            float(td.get("estimated_hours") or 0) or DEFAULT_HOURS["todo"], td.get("hours_logged", 0), overdue)

    return pool


def _urgency(item: dict, day: date) -> float:
    if item["overdue"]:
        base = 250.0
    elif item["due_date"] is not None:
        days_left = max((item["due_date"] - day).days, 0)
        base = 100.0 / (days_left + 1)
    else:
        base = 8.0
    return base * PRIORITY_WEIGHT.get(item["priority"], 1.0) * CATEGORY_WEIGHT.get(item["category"], 1.0)


def _per_day_cap(item: dict, day: date) -> float:
    if item["overdue"]:
        return 3.0
    if item["due_date"] is not None and (item["due_date"] - day).days <= 1:
        return 2.5   # final push the day before / day of
    return 1.5


def generate_schedule(
    record: dict,
    days_ahead: int = 7,
    reference_date: Optional[date] = None,
    now: Optional[datetime] = None,
) -> dict:
    today = reference_date or date.today()
    if now is None and reference_date is None:
        now = datetime.now()
    window_end = today + timedelta(days=days_ahead - 1)

    profile = record.get("profile", {})
    weekday_hours = float(profile.get("study_hours_per_day") or 3)
    weekend_hours = float(profile.get("weekend_hours_per_day") or weekday_hours)
    start_hour = float(profile.get("preferred_start_hour") if profile.get("preferred_start_hour") is not None else 18)
    session = max(0.5, min(2.0, float(profile.get("session_minutes") or 60) / 60))
    latest = min(LAST_SLOT_HOUR, float(profile.get("latest_end_hour") or DEFAULT_LATEST_END))
    brk = max(0.0, min(0.5, float(profile.get("break_minutes") if profile.get("break_minutes") is not None else 15) / 60))

    previous = record.get("schedule") or {}
    completed: dict = dict(previous.get("completed") or {})
    # keep 14 days of completion history, drop the rest
    cutoff = (today - timedelta(days=14)).isoformat()
    completed = {k: v for k, v in completed.items() if v.get("date", "") >= cutoff}

    pool_list = build_work_pool(record, today)
    pool = {i["ref_id"]: i for i in pool_list}
    days: dict[str, list[dict]] = {}
    capacity_left: dict[str, float] = {}
    busy_by_day: dict[str, list[dict]] = {}

    # sessions from earlier days that were never ticked off (for the "missed" nudge)
    missed = []
    for d_key, d_blocks in (previous.get("days") or {}).items():
        if (today - timedelta(days=3)).isoformat() <= d_key < today.isoformat():
            missed += [{"date": d_key, "title": b["title"], "minutes": b.get("minutes", 0)} for b in d_blocks if not b.get("done")]

    for offset in range(days_ahead):
        day = today + timedelta(days=offset)
        key = day.isoformat()
        budget = weekend_hours if day.weekday() >= 5 else weekday_hours
        cursor = start_hour

        blocks: list[dict] = []
        if offset == 0:
            # Blocks already ticked off today stay exactly where they were.
            done_today = sorted((b for b in completed.values() if b.get("date") == key), key=lambda b: b["start"])
            for b in done_today:
                blocks.append({**b, "done": True})
                budget -= b.get("minutes", 0) / 60
                cursor = max(cursor, _hours_from_hhmm(b["end"]) + brk)
            if now is not None and now.date() == day:
                cursor = max(cursor, _snap_up(now.hour + now.minute / 60 + 5 / 60))

        cursor = _snap_up(cursor)
        busy = busy_intervals(profile, day)
        used_today: dict[str, float] = {}
        per_ref_count: dict[str, int] = {}
        last_subject = None

        while budget > 0.01 and cursor + SLOT <= latest + 1e-9:
            candidates = [
                it for it in pool.values()
                if it["remaining_hours"] > 0.01
                and (it["due_date"] is None or it["due_date"] >= day)
                and used_today.get(it["ref_id"], 0.0) < _per_day_cap(it, day) - 0.01
            ]
            if not candidates:
                break
            cursor, avail = _free_slot(cursor, busy, latest)
            if avail < SLOT - 1e-9:
                break
            candidates.sort(key=lambda it: -(_urgency(it, day) * (0.85 if it["subject"] == last_subject and len(candidates) > 1 else 1.0)))
            chosen = candidates[0]

            cap_left = _per_day_cap(chosen, day) - used_today.get(chosen["ref_id"], 0.0)
            hours = min(session, chosen["remaining_hours"], budget, cap_left, avail)
            rem = chosen["remaining_hours"]
            # absorb a small leftover into this session instead of leaving a 15-min tail for later
            if 0 < rem - hours < MIN_BLOCK and rem <= min(budget, cap_left, avail) + 1e-9:
                hours = rem
            # pad a tiny final piece up to a proper 30-min session
            if rem < MIN_BLOCK and hours < MIN_BLOCK:
                hours = min(MIN_BLOCK, budget, avail)
            hours = math.floor(round(hours / SLOT, 6)) * SLOT
            if hours < SLOT:
                # leftover crumbs smaller than 15 min aren't worth a block
                if chosen["remaining_hours"] < SLOT:
                    chosen["remaining_hours"] = 0
                    continue
                break
            if hours < MIN_BLOCK - 1e-9 and chosen["remaining_hours"] > hours + 1e-9:
                # Too short to be a useful session. Work out what limited it.
                if cap_left <= hours + 1e-9:
                    used_today[chosen["ref_id"]] = _per_day_cap(chosen, day)   # done with this item today
                    continue
                if avail <= hours + 1e-9 and cursor + avail < latest - 1e-9:
                    nxt_busy = next((e_ for s_, e_ in busy if s_ >= cursor + avail - 1e-9), None)
                    if nxt_busy is not None:
                        cursor = _snap_up(nxt_busy)
                        continue
                break

            n = per_ref_count.get(chosen["ref_id"], 0)
            per_ref_count[chosen["ref_id"]] = n + 1
            block_id = f"{key}_{chosen['ref_id']}_{n}"
            blocks.append({
                "id": block_id,
                "date": key,
                "start": _format_hour(cursor),
                "end": _format_hour(cursor + hours),
                "minutes": int(round(hours * 60)),
                "title": chosen["title"],
                "category": chosen["category"],
                "subject": chosen["subject"],
                "ref_id": chosen["ref_id"],
                "due_date": chosen["due_date"].isoformat() if chosen["due_date"] else None,
                "priority": chosen["priority"],
                "overdue": chosen["overdue"],
                "note": chosen.get("note"),
                "done": False,
            })
            chosen["remaining_hours"] = max(0.0, round(chosen["remaining_hours"] - hours, 2))
            used_today[chosen["ref_id"]] = used_today.get(chosen["ref_id"], 0.0) + hours
            budget = round(budget - hours, 2)
            cursor = _snap_up(cursor + hours + (brk if budget > 0.01 else 0))
            last_subject = chosen["subject"]

        days[key] = blocks
        capacity_left[key] = round(max(budget, 0), 2)
        busy_by_day[key] = [{"start": _format_hour(a), "end": _format_hour(b)} for a, b in busy]

    # Anything with hours left over that has a deadline inside the window is
    # genuinely at risk; undated or far-off leftovers simply continue next week.
    at_risk, unscheduled = [], []
    for it in pool.values():
        if it["remaining_hours"] <= 0.01:
            continue
        entry = {
            "ref_id": it["ref_id"], "title": it["title"], "category": it["category"],
            "remaining_hours": round(it["remaining_hours"], 2),
            "due_date": it["due_date"].isoformat() if it["due_date"] else None,
        }
        if it["due_date"] is not None and it["due_date"] <= window_end:
            at_risk.append(entry)
        else:
            unscheduled.append(entry)

    overdue = [
        {"id": it["ref_id"], "title": it["title"].removeprefix("Catch up: "), "category": it["category"],
         "due_date": _original_due(record, it["ref_id"])}
        for it in pool_list if it["overdue"]
    ]

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "window": {"start": today.isoformat(), "end": window_end.isoformat()},
        "days": days,
        "capacity_left": capacity_left,
        "busy": busy_by_day,
        "missed": missed,
        "completed": completed,
        "overdue": overdue,
        "at_risk": at_risk,
        "unscheduled": unscheduled,
        "settings": {
            "study_hours_per_day": weekday_hours,
            "weekend_hours_per_day": weekend_hours,
            "preferred_start_hour": start_hour,
            "session_minutes": int(session * 60),
            "break_minutes": int(round(brk * 60)),
            "latest_end_hour": latest,
        },
    }


def _original_due(record: dict, ref_id: str) -> Optional[str]:
    for section in ("assignments", "projects", "todos"):
        for it in record.get(section, []):
            if it.get("id") == ref_id:
                return it.get("due_date")
    for it in record.get("placements", {}).get("prep_tasks", []):
        if it.get("id") == ref_id:
            return it.get("due_date")
    return None


# --------------------------------------------------------------------------
# Ticking blocks off
# --------------------------------------------------------------------------

_SECTION_BY_CATEGORY = {
    "assignment": ("assignments", None),
    "project": ("projects", None),
    "exam_prep": ("exams", None),
    "todo": ("todos", None),
    "placement": ("placements", "prep_tasks"),
}


def find_source_item(record: dict, category: str, ref_id: str) -> Optional[dict]:
    if ref_id.startswith("round:"):
        _, app_id, key = ref_id.split(":", 2)
        app = next((a for a in record.get("placements", {}).get("applications", []) if a.get("id") == app_id), None)
        return next((r for r in (app or {}).get("rounds", []) if r.get("key") == key), None)
    section, sub = _SECTION_BY_CATEGORY.get(category, (None, None))
    if not section:
        return None
    items = record[section][sub] if sub else record[section]
    return next((i for i in items if i.get("id") == ref_id), None)


def toggle_block(record: dict, block_id: str) -> Optional[dict]:
    """Marks a planned block done/undone and logs (or un-logs) its hours on the source item."""
    schedule = record.get("schedule") or {}
    for blocks in schedule.get("days", {}).values():
        for b in blocks:
            if b.get("id") != block_id:
                continue
            b["done"] = not b.get("done", False)
            hours = b.get("minutes", 60) / 60
            src = find_source_item(record, b["category"], b["ref_id"])
            if src is not None:
                src["hours_logged"] = round(max(0.0, (src.get("hours_logged") or 0) + (hours if b["done"] else -hours)), 2)
            completed = schedule.setdefault("completed", {})
            if b["done"]:
                completed[block_id] = {k: v for k, v in b.items() if k != "done"}
            else:
                completed.pop(block_id, None)
            return b
    return None


def find_block(record: dict, block_id: str) -> Optional[dict]:
    for blocks in (record.get("schedule") or {}).get("days", {}).values():
        for b in blocks:
            if b.get("id") == block_id:
                return b
    return None


def skip_block(record: dict, block_id: str) -> Optional[dict]:
    """Marks that session's time as busy so the next re-plan moves the work elsewhere."""
    b = find_block(record, block_id)
    if b is None or b.get("done"):
        return None
    from .storage import new_id
    record["profile"].setdefault("busy", []).append({
        "id": new_id("busy"), "date": b["date"], "start": b["start"], "end": b["end"], "label": f"Skipped: {b['title']}",
    })
    return b


def add_busy(record: dict, day: str, start: str, end: str, label: str) -> dict:
    from .storage import new_id
    entry = {"id": new_id("busy"), "date": day, "start": start, "end": end, "label": label}
    record["profile"].setdefault("busy", []).append(entry)
    return entry


# --------------------------------------------------------------------------
# Explanation layer (LLM if configured, grounded offline template otherwise)
# --------------------------------------------------------------------------

def _sum_minutes(blocks: list[dict]) -> int:
    return sum(b.get("minutes", 0) for b in blocks)


def _compact_for_llm(schedule: dict) -> dict:
    return {
        "days": {d: [f"{b['start']}-{b['end']} {b['title']} ({b['category']})" for b in bl] for d, bl in schedule["days"].items()},
        "overdue": [o["title"] for o in schedule.get("overdue", [])],
        "at_risk": [f"{a['title']} needs {a['remaining_hours']}h more before {a['due_date']}" for a in schedule.get("at_risk", [])],
    }


def explain_schedule(schedule: dict, profile: dict, use_llm: bool = True) -> str:
    if use_llm and llm.is_enabled():
        text = llm.chat([
            {"role": "system", "content": (
                "You are a warm, concise study coach. In 3-4 short sentences, explain the student's plan: "
                "what today focuses on and why, the nearest deadline, and one practical tip. "
                "Use only the data given. No headings, no lists."
            )},
            {"role": "user", "content": f"Student: {profile.get('name', '')}. Plan: {_compact_for_llm(schedule)}"},
        ], temperature=0.4, max_tokens=220)
        if text:
            return text
    return offline_explanation(schedule)


def offline_explanation(schedule: dict) -> str:
    today_key = schedule["window"]["start"]
    today_blocks = [b for b in schedule["days"].get(today_key, []) if not b.get("done")]
    all_blocks = [b for bl in schedule["days"].values() for b in bl]
    parts: list[str] = []

    if schedule.get("overdue"):
        names = ", ".join(f"“{o['title']}”" for o in schedule["overdue"][:2])
        parts.append(f"First things first: {names} {'is' if len(schedule['overdue']) == 1 else 'are'} overdue, so catch-up time is scheduled before anything else.")

    if today_blocks:
        top = today_blocks[0]
        mins = _sum_minutes(today_blocks)
        parts.append(
            f"Today starts at {top['start']} with “{top['title']}”, "
            f"{len(today_blocks)} session{'s' if len(today_blocks) != 1 else ''} and about {mins / 60:g}h of focused work."
        )
    elif all_blocks:
        parts.append("Nothing left for today — rest up, the next sessions are lined up for the coming days.")
    else:
        parts.append("Your plan is empty. Add an assignment, exam or to-do and it will be scheduled automatically.")

    dated = sorted((b for b in all_blocks if b.get("due_date") and not b.get("overdue")), key=lambda b: b["due_date"])
    if dated:
        nearest = dated[0]
        parts.append(f"Nearest deadline: “{nearest['title']}” on {nearest['due_date']}.")

    rounds = [b for bl in schedule["days"].values() for b in bl if b.get("ref_id", "").startswith("round:")]
    if rounds:
        parts.append(f"Placement prep is in too: “{rounds[0]['title']}” before the round on {rounds[0]['due_date']}.")

    if schedule.get("at_risk"):
        r = schedule["at_risk"][0]
        parts.append(
            f"Heads up: “{r['title']}” still needs ~{r['remaining_hours']:g}h that doesn't fit before it's due — "
            f"add study hours or start earlier."
        )
    return " ".join(parts)
