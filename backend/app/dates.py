"""
dates.py
--------
Natural-language date parsing for the chatbot, so students can type
"remind me to submit the lab record by friday" instead of an ISO date.

parse_date_phrase(text, today) -> (iso_date | None, matched_text | None)
The matched text is returned so callers can strip it out of task titles.
"""
from __future__ import annotations
import re
from datetime import date, timedelta
from typing import Optional

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WEEKDAY_ALIASES = {
    "mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3, "thur": 3, "thurs": 3,
    "fri": 4, "sat": 5, "sun": 6,
    **{d: i for i, d in enumerate(WEEKDAYS)},
}
MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10, "october": 10,
    "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_WD = "|".join(sorted(WEEKDAY_ALIASES, key=len, reverse=True))
_MO = "|".join(sorted(MONTHS, key=len, reverse=True))
_PREP = r"(?:(?:due|by|on|before|for|until|till)\s+)?"


def _safe_date(y: int, m: int, d: int) -> Optional[date]:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _future(d: Optional[date], today: date) -> Optional[date]:
    """Dates without a year roll to next year if already past."""
    if d and d < today:
        return _safe_date(d.year + 1, d.month, d.day)
    return d


def parse_date_phrase(text: str, today: Optional[date] = None) -> tuple[Optional[str], Optional[str]]:
    today = today or date.today()
    t = text.lower()

    rules: list[tuple[str, callable]] = [
        (rf"{_PREP}\b(\d{{4}}-\d{{2}}-\d{{2}})\b",
         lambda m: _safe_date(*map(int, m.group(1).split("-")))),
        (rf"{_PREP}\b(?:the\s+)?day after tomorrow\b", lambda m: today + timedelta(days=2)),
        (rf"{_PREP}\b(?:tomorrow|tmrw|tmr|tomo)\b", lambda m: today + timedelta(days=1)),
        (rf"{_PREP}\b(?:today|tonight|this evening|eod)\b", lambda m: today),
        (rf"{_PREP}\bin\s+(\d{{1,2}}|a|one|two|three|four|five|six|seven)\s+(day|days|week|weeks)\b",
         lambda m: today + timedelta(days=_num(m.group(1)) * (7 if m.group(2).startswith("week") else 1))),
        (rf"{_PREP}\bnext week\b", lambda m: today + timedelta(days=7 - today.weekday())),
        (rf"{_PREP}\b(?:this\s+)?weekend\b", lambda m: today + timedelta(days=(5 - today.weekday()) % 7)),
        (rf"{_PREP}\bend of (?:the )?week\b", lambda m: today + timedelta(days=(4 - today.weekday()) % 7)),
        (rf"{_PREP}\bnext\s+({_WD})\b", lambda m: _next_weekday(today, WEEKDAY_ALIASES[m.group(1)], force_next_week=True)),
        (rf"{_PREP}\b(?:this\s+|coming\s+)?({_WD})\b", lambda m: _next_weekday(today, WEEKDAY_ALIASES[m.group(1)])),
        (rf"{_PREP}\b(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({_MO})\b",
         lambda m: _future(_safe_date(today.year, MONTHS[m.group(2)], int(m.group(1))), today)),
        (rf"{_PREP}\b({_MO})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b",
         lambda m: _future(_safe_date(today.year, MONTHS[m.group(1)], int(m.group(2))), today)),
        (rf"{_PREP}\b(\d{{1,2}})[/.](\d{{1,2}})(?:[/.](\d{{2,4}}))?\b",  # dd/mm(/yyyy) -- day-first, as used in India/UK
         lambda m: _dmy(m, today)),
        (rf"{_PREP}\b(?:the\s+)?(\d{{1,2}})(?:st|nd|rd|th)\b",
         lambda m: _day_of_month(today, int(m.group(1)))),
    ]
    for pattern, build in rules:
        m = re.search(pattern, t)
        if not m:
            continue
        d = build(m)
        if d:
            return d.isoformat(), text[m.start():m.end()]
    return None, None


_WORDS = {"a": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7}


def _num(s: str) -> int:
    return int(s) if s.isdigit() else _WORDS.get(s, 1)


def _next_weekday(today: date, target: int, force_next_week: bool = False) -> date:
    ahead = (target - today.weekday()) % 7
    if ahead == 0:
        ahead = 7
    if force_next_week and ahead < 7 and (today + timedelta(days=ahead)).isocalendar()[1] == today.isocalendar()[1]:
        ahead += 7
    return today + timedelta(days=ahead)


def _dmy(m, today: date) -> Optional[date]:
    d, mo = int(m.group(1)), int(m.group(2))
    y = m.group(3)
    if y:
        y = int(y)
        if y < 100:
            y += 2000
        return _safe_date(y, mo, d)
    return _future(_safe_date(today.year, mo, d), today)


def _day_of_month(today: date, d: int) -> Optional[date]:
    candidate = _safe_date(today.year, today.month, d)
    if candidate and candidate >= today:
        return candidate
    nm_year, nm_month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    return _safe_date(nm_year, nm_month, d)


def humanize(iso: Optional[str], today: Optional[date] = None) -> str:
    if not iso:
        return "no date"
    today = today or date.today()
    try:
        d = date.fromisoformat(iso[:10])
    except ValueError:
        return iso
    diff = (d - today).days
    if diff == 0:
        return "today"
    if diff == 1:
        return "tomorrow"
    if diff == -1:
        return "yesterday"
    if 1 < diff < 7:
        return d.strftime("%A")
    if diff < 0:
        return f"{d.strftime('%b')} {d.day} ({-diff} days ago)"
    return f"{d.strftime('%a')}, {d.strftime('%b')} {d.day}"
