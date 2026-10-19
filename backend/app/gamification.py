"""
gamification.py
---------------
XP, levels and daily streaks. Small, deterministic rewards for finishing
real work (submitting an assignment, ticking off a planned study block,
finishing a focus session) so the app feels alive without being noisy.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta

XP_REWARDS = {
    "assignment_submitted": 50,
    "project_completed": 120,
    "todo_done": 15,
    "prep_done": 25,
    "block_done": 20,
    "focus_session": 30,
    "course_completed": 80,
    "application_advanced": 30,
}

LEVEL_TITLES = [
    "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
    "Full Moon", "Moon Watcher", "Night Navigator", "Star Charter", "Constellation",
]


def level_for(xp: int) -> dict:
    # each level needs 100 more XP than the last: 100, 200, 300...
    level, needed, floor = 1, 100, 0
    while xp >= floor + needed:
        floor += needed
        level += 1
        needed = 100 * level
    title = LEVEL_TITLES[min(level - 1, len(LEVEL_TITLES) - 1)]
    return {
        "level": level,
        "title": title,
        "xp_into_level": xp - floor,
        "xp_for_next": needed,
        "progress": round((xp - floor) / needed, 3),
    }


def touch_streak(record: dict, today: date | None = None) -> None:
    stats = record["stats"]
    today = today or date.today()
    last = stats.get("last_active_date")
    if last == today.isoformat():
        return
    if last == (today - timedelta(days=1)).isoformat():
        stats["streak"] = stats.get("streak", 0) + 1
    else:
        stats["streak"] = 1
    stats["best_streak"] = max(stats.get("best_streak", 0), stats["streak"])
    stats["last_active_date"] = today.isoformat()


def award(record: dict, event: str, label: str, multiplier: float = 1.0) -> int:
    xp = int(round(XP_REWARDS.get(event, 10) * multiplier))
    stats = record["stats"]
    stats["xp"] = max(0, stats.get("xp", 0) + xp)
    if xp > 0:
        stats["completed_total"] = stats.get("completed_total", 0) + 1
        touch_streak(record)
    stats.setdefault("activity", []).insert(0, {"text": label, "xp": xp, "at": datetime.now().isoformat(timespec="seconds")})
    stats["activity"] = stats["activity"][:25]
    return xp


def revoke(record: dict, event: str, label: str) -> int:
    """Undo an award when something is un-ticked (keeps XP honest)."""
    xp = XP_REWARDS.get(event, 10)
    stats = record["stats"]
    stats["xp"] = max(0, stats.get("xp", 0) - xp)
    stats["completed_total"] = max(0, stats.get("completed_total", 0) - 1)
    stats.setdefault("activity", []).insert(0, {"text": label, "xp": -xp, "at": datetime.now().isoformat(timespec="seconds")})
    stats["activity"] = stats["activity"][:25]
    return -xp


def summary(record: dict) -> dict:
    stats = record["stats"]
    # a streak is only "alive" if the student was active today or yesterday
    last = stats.get("last_active_date")
    streak = stats.get("streak", 0)
    if last and last < (date.today() - timedelta(days=1)).isoformat():
        streak = 0
    return {
        "xp": stats.get("xp", 0),
        "streak": streak,
        "best_streak": stats.get("best_streak", 0),
        "completed_total": stats.get("completed_total", 0),
        "focus_minutes": stats.get("focus_minutes", 0),
        "activity": stats.get("activity", [])[:8],
        **level_for(stats.get("xp", 0)),
    }
