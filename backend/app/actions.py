"""
actions.py
----------
Every change the assistant can make, as plain functions. Used by:
  * the LLM tool-calling layer (chatbot_agent._llm_turn) -- the model picks a
    tool, these functions do the actual work with validation;
  * the rule-based layer for the newer intents (busy time, rescheduling,
    placement rounds).
Each returns (message_for_the_student, action_dict). They mutate the record
and re-plan; the caller saves it.
"""
from __future__ import annotations
import difflib
import re
from datetime import date, datetime
from typing import Optional

from . import storage, gamification, placements_agent
from .dates import humanize
from .services import replan
from .planner_agent import add_busy

ROUND_ALIASES = [
    ("interview2", r"\b(interview\s*(2|ii|two)|second interview|2nd interview|round\s*3|technical\s*2)\b"),
    ("interview1", r"\b(interview\s*(1|i|one)?|first interview|1st interview|technical interview|technical|tech round)\b"),
    ("coding", r"\b(coding|oa|online assessment|online test|programming test|hackerrank|round\s*1)\b"),
    ("aptitude", r"\b(aptitude|apti|quant|reasoning test)\b"),
    ("gd", r"\b(gd|group discussion)\b"),
    ("hr", r"\b(hr|hr interview|hr round|managerial)\b"),
    ("resume", r"\b(resume|cv|shortlist|shortlisting|screening)\b"),
]


def _valid_date(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        return None


def _hhmm(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    m = re.match(r"^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$", str(v).lower())
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


# ------------------------------------------------------------------ lookup

def open_items(record: dict, include_exams: bool = False) -> list[tuple[str, dict, str]]:
    items = []
    for t in record.get("todos", []):
        if not t.get("done"):
            items.append(("todo", t, t.get("title", "")))
    for a in record.get("assignments", []):
        if a.get("status") == "pending":
            items.append(("assignment", a, f"{a.get('title', '')} {a.get('subject', '')}"))
    for p in record.get("projects", []):
        if p.get("status") != "completed":
            items.append(("project", p, f"{p.get('title', '')} {p.get('subject', '')}"))
    for t in record.get("placements", {}).get("prep_tasks", []):
        if not t.get("done"):
            items.append(("prep", t, t.get("title", "")))
    if include_exams:
        items += [("exam", e, f"{e.get('subject', '')} exam") for e in record.get("exams", [])]
    return items


def find_item(record: dict, name: str, include_exams: bool = False) -> Optional[tuple[str, dict]]:
    name_l = (name or "").lower().strip()
    if not name_l:
        return None
    words = set(re.findall(r"[a-z0-9']+", name_l))
    best, best_score = None, 0.0
    for kind, item, label in open_items(record, include_exams):
        label_l = label.lower()
        lw = set(re.findall(r"[a-z0-9']+", label_l))
        overlap = len(lw & words) / max(len(words), 1)
        fuzzy = difflib.SequenceMatcher(None, name_l, label_l).ratio()
        score = overlap * 0.6 + fuzzy * 0.4 + (0.3 if name_l in label_l else 0)
        if score > best_score:
            best, best_score = (kind, item), score
    return best if best_score >= 0.35 else None


def title_of(kind: str, item: dict) -> str:
    return f"{item.get('subject', '')} exam" if kind == "exam" else item.get("title", "item")


def find_application(record: dict, company: str) -> Optional[dict]:
    c = (company or "").lower().strip()
    if not c:
        return None
    apps = record.get("placements", {}).get("applications", [])
    for a in apps:
        if a.get("company", "").lower() == c:
            return a
    for a in apps:
        name = a.get("company", "").lower()
        if c in name or name.split(" ")[0] == c.split(" ")[0]:
            return a
    return None


def company_in_text(record: dict, text: str) -> Optional[dict]:
    t = text.lower()
    for a in record.get("placements", {}).get("applications", []):
        name = a.get("company", "").lower()
        if name and (name in t or (len(name.split()[0]) > 3 and re.search(rf"\b{re.escape(name.split()[0])}\b", t))):
            return a
    return None


def round_from_text(text: str) -> Optional[str]:
    t = text.lower()
    for key, pattern in ROUND_ALIASES:
        if re.search(pattern, t):
            return key
    return None


# ------------------------------------------------------------------ actions

def add_assignment(record, title, subject="", due_date=None, priority="medium", estimated_hours=None):
    item = storage.append_item(record, "assignments", {
        "title": (title or "New assignment").strip()[:120], "subject": (subject or "").strip(),
        "due_date": _valid_date(due_date), "status": "pending",
        "priority": priority if priority in ("low", "medium", "high") else "medium",
        "estimated_hours": float(estimated_hours) if estimated_hours else None,
    }, "asg")
    replan(record)
    first = next((b for d in sorted(record["schedule"]["days"]) for b in record["schedule"]["days"][d] if b["ref_id"] == item["id"]), None)
    msg = f"Added assignment **{item['title']}**" + (f" for {item['subject']}" if item["subject"] else "") + (f", due **{humanize(item['due_date'])}**" if item["due_date"] else "") + "."
    if first:
        msg += f" First session: {humanize(first['date'])} at {first['start']}."
    return msg, {"type": "assignment_created", "item": item}


def add_exam(record, subject, date_str, type="internal"):
    d = _valid_date(date_str)
    if not subject or not d:
        return "I need the subject and the exam date to add it.", None
    item = storage.append_item(record, "exams", {"subject": subject.strip(), "date": d, "type": "external" if type == "external" else "internal", "syllabus": ""}, "exam")
    replan(record)
    n = sum(1 for bl in record["schedule"]["days"].values() for b in bl if b["ref_id"] == item["id"])
    return f"Added your **{item['subject']}** exam on **{humanize(d)}** ({d}) and planned {n} prep session{'s' if n != 1 else ''}.", {"type": "exam_created", "item": item}


def add_todo(record, title, due_date=None, priority="medium"):
    item = storage.append_item(record, "todos", {
        "title": (title or "New task").strip()[:120], "due_date": _valid_date(due_date), "done": False,
        "priority": priority if priority in ("low", "medium", "high") else "medium",
        "schedulable": True, "subject": "Personal", "source": "chatbot",
    }, "todo")
    replan(record)
    return f"Added to your to-dos: **{item['title']}**" + (f" — due {humanize(item['due_date'])}" if item["due_date"] else "") + ".", {"type": "todo_created", "item": item}


def complete_item(record, name):
    match = find_item(record, name)
    if not match:
        return f"I couldn't find an open task matching “{name}”.", None
    kind, item = match
    title = title_of(kind, item)
    if kind == "todo":
        item["done"] = True
        xp = gamification.award(record, "todo_done", f"Finished “{title}”")
    elif kind == "assignment":
        item["status"] = "submitted"
        xp = gamification.award(record, "assignment_submitted", f"Submitted “{title}”")
    elif kind == "project":
        item["status"] = "completed"
        xp = gamification.award(record, "project_completed", f"Completed project “{title}”")
    else:
        item["done"] = True
        xp = gamification.award(record, "prep_done", f"Finished prep “{title}”")
    replan(record)
    return f"Marked **{title}** as done. **+{xp} XP** ✨", {"type": f"{kind}_completed", "item": item, "xp": xp}


def delete_item(record, name):
    match = find_item(record, name, include_exams=True)
    if not match:
        return f"I couldn't find “{name}”.", None
    kind, item = match
    section = {"todo": "todos", "assignment": "assignments", "project": "projects", "exam": "exams"}.get(kind)
    if section:
        storage.delete_item(record, section, item["id"])
    else:
        storage.delete_nested_item(record, "placements", "prep_tasks", item["id"])
    replan(record)
    return f"Removed **{title_of(kind, item)}** and updated your plan.", {"type": f"{kind}_deleted", "item": item}


def reschedule_item(record, name, new_date):
    d = _valid_date(new_date)
    if not d:
        return "What's the new date?", None
    match = find_item(record, name, include_exams=True)
    if not match:
        return f"I couldn't find “{name}”.", None
    kind, item = match
    if kind == "exam":
        item["date"] = d
    else:
        item["due_date"] = d
    replan(record)
    return f"Moved **{title_of(kind, item)}** to **{humanize(d)}** ({d}) and re-planned your week.", {"type": f"{kind}_rescheduled", "item": item}


def set_study_preferences(record, weekday_hours=None, weekend_hours=None, start_time=None, stop_time=None, session_minutes=None):
    p = record["profile"]
    changed = []
    if weekday_hours:
        p["study_hours_per_day"] = max(0.5, min(12.0, float(weekday_hours)))
        changed.append(f"{p['study_hours_per_day']:g}h on weekdays")
    if weekend_hours is not None and weekend_hours != "":
        p["weekend_hours_per_day"] = max(0.0, min(12.0, float(weekend_hours)))
        changed.append(f"{p['weekend_hours_per_day']:g}h on weekends")
    st = _hhmm(start_time)
    if st:
        h, m = map(int, st.split(":"))
        p["preferred_start_hour"] = round(h + m / 60, 2)
        changed.append(f"starting at {st}")
    en = _hhmm(stop_time)
    if en:
        h, m = map(int, en.split(":"))
        p["latest_end_hour"] = round(h + m / 60, 2)
        changed.append(f"stopping by {en}")
    if session_minutes:
        p["session_minutes"] = int(max(25, min(120, int(session_minutes))))
        changed.append(f"{p['session_minutes']}-minute sessions")
    if not changed:
        return "Tell me what to change — hours per day, start time, or stop time.", None
    replan(record)
    return "Updated: " + ", ".join(changed) + ". Your plan is rebuilt around it.", {"type": "settings_updated"}


def mark_busy(record, date_str=None, start=None, end=None, reason="Busy"):
    d = _valid_date(date_str) or date.today().isoformat()
    p = record["profile"]
    st = _hhmm(start)
    if not st:
        if d == date.today().isoformat():
            now = datetime.now()
            st = f"{now.hour:02d}:{(now.minute // 15) * 15:02d}"
        else:
            h = float(p.get("preferred_start_hour") or 18)
            st = f"{int(h):02d}:{int(round((h % 1) * 60)):02d}"
    en = _hhmm(end) or "23:59"
    if en <= st:
        return "That time range doesn't look right — the end should be after the start.", None
    add_busy(record, d, st, en, reason or "Busy")
    replan(record)
    moved = "tonight's" if d == date.today().isoformat() else f"{humanize(d)}'s"
    return f"Got it — you're busy {humanize(d)} from {st} to {en if en != '23:59' else 'the end of the day'}. I moved {moved} sessions to other free slots.", {"type": "busy_added"}


def update_placement_round(record, company, round_key=None, status=None, date_str=None):
    app = find_application(record, company)
    if not app:
        return f"I couldn't find an application to **{company}**. Add it on the Placements page (or say “I applied to {company} for <role>”).", None
    placements_agent.migrate_application(app)
    key = round_key if round_key in placements_agent.ROUND_KEYS else (app.get("current_round") or None)
    if not key:
        return f"Which round at {app['company']}? (resume, aptitude, coding, GD, interview 1/2, HR)", None
    status = status if status in placements_agent.ROUND_STATUSES else None
    d = _valid_date(date_str) if date_str else "__keep__"
    if status is None and d == "__keep__":
        return f"What happened in the {placements_agent.ROUND_LABEL[key].lower()} at {app['company']}?", None
    before = app.get("result")
    placements_agent.update_round(app, key, status, d)
    xp = 0
    if status == "selected":
        xp = gamification.award(record, "application_advanced", f"Cleared {placements_agent.ROUND_LABEL[key].lower()} at {app['company']}")
    replan(record)
    label = placements_agent.ROUND_LABEL[key]
    if status == "selected":
        msg = f"Congrats! 🎉 Marked **{label}** at **{app['company']}** as cleared. **+{xp} XP**"
        if app["result"] == "offer":
            msg += f"\nThat was the last round — **{app['company']} is an offer!**"
        elif app.get("current_round"):
            msg += f"\nNext: {placements_agent.ROUND_LABEL[app['current_round']]}."
    elif status == "rejected":
        msg = f"Sorry about **{app['company']}** — marked {label.lower()} as not cleared. Every round is practice for the next one; the Resume insights tab shows which skills would help most."
    elif status == "na":
        msg = f"Marked {label.lower()} as not conducted (N/A) for {app['company']}."
    else:
        msg = f"Updated **{app['company']} {label.lower()}**" + (f" — scheduled for **{humanize(d)}**" if d not in (None, "__keep__") else "") + "."
        if d not in (None, "__keep__") and placements_agent.PREP_HOURS.get(key):
            msg += " I've added prep sessions before it."
    return msg, {"type": "placement_round_updated", "item": app, "xp": xp or None, "was": before}


def add_application(record, company, role="", rounds=None):
    if not company:
        return "Which company?", None
    if find_application(record, company):
        return f"You already have an application to {company} tracked.", None
    keys = [r for r in (rounds or []) if r in placements_agent.ROUND_KEYS] or placements_agent.DEFAULT_ROUNDS
    app = storage.append_nested_item(record, "placements", "applications", {
        "company": company.strip(), "role": (role or "").strip(), "applied_date": date.today().isoformat(),
        "rounds": placements_agent.make_rounds(keys), "source": "chatbot",
    }, "app")
    placements_agent.summarize(app)
    return f"Tracking your application to **{app['company']}**" + (f" ({app['role']})" if app["role"] else "") + ". Resume screening is in progress.", {"type": "application_created", "item": app}


def placement_status(record, company=None) -> str:
    apps = record.get("placements", {}).get("applications", [])
    for a in apps:
        placements_agent.migrate_application(a)
    if company:
        a = find_application(record, company)
        if not a:
            return f"No application to {company} on record."
        lines = []
        for r in a["rounds"]:
            if r["status"] == "na":
                continue
            icon = {"selected": "✅", "rejected": "❌", "in_progress": "⏳", "pending": "•"}[r["status"]]
            word = {"selected": "cleared", "rejected": "not cleared", "in_progress": "in progress", "pending": "upcoming"}[r["status"]]
            lines.append(f"{icon} {r['label']} — {word}" + (f" ({humanize(r['date'])})" if r.get("date") else ""))
        return f"**{a['company']}** — {a.get('role') or 'role not set'}: **{a['status']}**\n" + "\n".join(lines)
    if not apps:
        return "You haven't tracked any applications yet. Use Easy apply on the Job board, or tell me “I applied to <company> for <role>”."
    active = [a for a in apps if a["result"] == "in_progress"]
    offers = [a for a in apps if a["result"] == "offer"]
    lines = [f"• **{a['company']}** — {a['status']}" for a in apps[:8]]
    head = f"{len(apps)} application{'s' if len(apps) != 1 else ''}: {len(active)} active, {len(offers)} offer{'s' if len(offers) != 1 else ''}."
    nxt = placements_agent.upcoming_rounds(record)
    if nxt:
        n = nxt[0]
        head += f"\nNext round: **{n['company']} {n['label'].lower()}** on {humanize(n['date'])}."
    return head + "\n" + "\n".join(lines)


# ------------------------------------------------------------------ tool schema for the LLM

def _fn(name, desc, props, required=()):
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": list(required)}}}


DATE = {"type": "string", "description": "ISO date YYYY-MM-DD (convert relative dates using today's date)"}
PRIORITY = {"type": "string", "enum": ["low", "medium", "high"]}
TOOLS = [
    _fn("add_assignment", "Add an assignment/homework. It is scheduled automatically.",
        {"title": {"type": "string"}, "subject": {"type": "string"}, "due_date": DATE, "priority": PRIORITY,
         "estimated_hours": {"type": "number"}}, ["title"]),
    _fn("add_exam", "Add an exam; prep sessions are planned before it.",
        {"subject": {"type": "string"}, "date": DATE, "type": {"type": "string", "enum": ["internal", "external"]}}, ["subject", "date"]),
    _fn("add_todo", "Add a to-do / reminder.", {"title": {"type": "string"}, "due_date": DATE, "priority": PRIORITY}, ["title"]),
    _fn("complete_item", "Mark an assignment, project, to-do or prep task as done/submitted.", {"name": {"type": "string"}}, ["name"]),
    _fn("delete_item", "Delete an assignment, project, exam, to-do or prep task.", {"name": {"type": "string"}}, ["name"]),
    _fn("reschedule_item", "Change the due date of an assignment/project/to-do, or the date of an exam.",
        {"name": {"type": "string"}, "new_date": DATE}, ["name", "new_date"]),
    _fn("set_study_preferences", "Change study hours per day, start time, stop time or session length.",
        {"weekday_hours": {"type": "number"}, "weekend_hours": {"type": "number"},
         "start_time": {"type": "string", "description": "HH:MM 24h"}, "stop_time": {"type": "string", "description": "HH:MM 24h"},
         "session_minutes": {"type": "integer"}}),
    _fn("mark_busy", "Block time when the student can't study (e.g. 'I'm busy tonight', 'no study saturday afternoon'). Sessions move elsewhere.",
        {"date": DATE, "start": {"type": "string", "description": "HH:MM 24h, omit for 'from now'"},
         "end": {"type": "string", "description": "HH:MM 24h, omit for 'rest of the day'"}, "reason": {"type": "string"}}),
    _fn("update_placement_round", "Update one recruitment round of a company the student applied to: its result and/or date.",
        {"company": {"type": "string"}, "round": {"type": "string", "enum": [k for k, _ in placements_agent.ROUND_TYPES]},
         "status": {"type": "string", "enum": list(placements_agent.ROUND_STATUSES)}, "date": DATE}, ["company"]),
    _fn("add_application", "Start tracking a job application. `rounds` = the rounds this company conducts.",
        {"company": {"type": "string"}, "role": {"type": "string"},
         "rounds": {"type": "array", "items": {"type": "string", "enum": [k for k, _ in placements_agent.ROUND_TYPES]}}}, ["company"]),
    _fn("replan", "Rebuild the study plan from scratch.", {}),
]


def run_tool(record: dict, name: str, args: dict) -> tuple[str, Optional[dict]]:
    try:
        if name == "add_assignment":
            return add_assignment(record, args.get("title"), args.get("subject", ""), args.get("due_date"), args.get("priority", "medium"), args.get("estimated_hours"))
        if name == "add_exam":
            return add_exam(record, args.get("subject"), args.get("date"), args.get("type", "internal"))
        if name == "add_todo":
            return add_todo(record, args.get("title"), args.get("due_date"), args.get("priority", "medium"))
        if name == "complete_item":
            return complete_item(record, args.get("name", ""))
        if name == "delete_item":
            return delete_item(record, args.get("name", ""))
        if name == "reschedule_item":
            return reschedule_item(record, args.get("name", ""), args.get("new_date"))
        if name == "set_study_preferences":
            return set_study_preferences(record, args.get("weekday_hours"), args.get("weekend_hours"), args.get("start_time"), args.get("stop_time"), args.get("session_minutes"))
        if name == "mark_busy":
            return mark_busy(record, args.get("date"), args.get("start"), args.get("end"), args.get("reason") or "Busy")
        if name == "update_placement_round":
            return update_placement_round(record, args.get("company", ""), args.get("round"), args.get("status"), args.get("date"))
        if name == "add_application":
            return add_application(record, args.get("company", ""), args.get("role", ""), args.get("rounds"))
        if name == "replan":
            replan(record, use_llm=False)
            return "Rebuilt your plan from your latest work.", {"type": "schedule_regenerated"}
    except (TypeError, ValueError) as e:
        return f"I couldn't do that ({e}).", None
    return f"Unknown action {name}.", None
