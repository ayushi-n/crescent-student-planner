"""
services.py
-----------
Cross-cutting helpers shared by the HTTP layer and the chatbot.
"""
from __future__ import annotations
from datetime import date, timedelta

from .planner_agent import generate_schedule, explain_schedule


def replan(record: dict, use_llm: bool = False, days_ahead: int = 7) -> dict:
    """
    Rebuilds the schedule from the record's current data. Called after every
    change to assignments, exams, projects, to-dos, prep tasks, placement
    rounds, timetable/busy times or study preferences, so the plan is never
    stale. Auto re-plans use the fast offline explanation; the explicit
    "Re-plan" button asks the LLM (if configured) for a richer summary.
    """
    today = date.today()
    profile = record.setdefault("profile", {})
    # forget one-off busy blocks once they're in the past
    profile["busy"] = [b for b in profile.get("busy") or [] if b.get("date", "") >= (today - timedelta(days=1)).isoformat()]

    previous_start = ((record.get("schedule") or {}).get("window") or {}).get("start")
    schedule = generate_schedule(record, days_ahead=days_ahead)
    schedule["explanation"] = explain_schedule(schedule, profile, use_llm=use_llm)
    record["schedule"] = schedule

    # new day -> leave a one-time note about sessions that were never ticked off
    if previous_start and previous_start != today.isoformat() and schedule.get("missed"):
        record.setdefault("notices", {})["missed"] = {"date": today.isoformat(), "items": schedule["missed"][:6]}

    # daily study log for the weekly review
    key = today.isoformat()
    hist = record.setdefault("history", {})
    planned = sum(b.get("minutes", 0) for b in schedule["days"].get(key, []))
    done = sum(b.get("minutes", 0) for b in schedule["days"].get(key, []) if b.get("done"))
    entry = hist.setdefault(key, {"planned": 0, "done": 0})
    entry["planned"] = max(entry.get("planned", 0), planned)
    entry["done"] = done
    cutoff = (today - timedelta(days=60)).isoformat()
    record["history"] = {k: v for k, v in hist.items() if k >= cutoff}
    return schedule
