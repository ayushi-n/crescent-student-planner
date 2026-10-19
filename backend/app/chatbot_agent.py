"""
chatbot_agent.py
-----------------
The Student Assistant ("Crescent"). Two layers:

1. A deterministic intent layer that understands everyday phrasing and acts
   on the student's real data -- adding assignments, exams and to-dos with
   natural dates ("by friday", "on 20th oct"), marking things done, deleting
   tasks, changing study hours, re-planning, and answering questions about
   the plan, deadlines, progress, placements and courses.
2. An LLM layer (any OpenAI-compatible provider, see llm.py) for everything
   else -- e.g. "explain normalization in DBMS" or "make me a revision
   strategy" -- grounded with a compact snapshot of the student's data and
   the recent conversation. Without a key, a helpful offline reply is used.

Every reply comes with `suggestions` (tap-to-send follow-ups) so the chat
never dead-ends.
"""
from __future__ import annotations
import difflib
import random
import re
from datetime import date, datetime, timedelta
from typing import Optional

import json
import os

from . import storage, course_recommender, llm, gamification, actions, placements_agent
from .dates import parse_date_phrase, humanize
from .services import replan

DEFAULT_SUGGESTIONS = ["What should I do now?", "What's due this week?", "Add a task", "How am I doing?"]

# --------------------------------------------------------------------------
# Intent detection
# --------------------------------------------------------------------------

INTENTS: list[tuple[str, str]] = [
    ("busy_time", r"\b(i'?m|i am|i'll be|i will be)\s+(busy|not free|out|unavailable|travell?ing|not available)\b|\bcan'?t study\b|\bno stud(y|ying)\b|\bblock (out )?(time|tonight|today|tomorrow)\b"),
    ("reschedule", r"\b(move|push|postpone|reschedule|shift|extend|prepone)\b.+\b(to|till|until|by)\b|\bis now due\b|\bdeadline (is )?(changed|moved|extended)\b"),
    ("add_application", r"\b(i )?(applied|apply|applying) (to|for|at)\b"),
    ("thanks", r"^\s*(thanks|thank you|thx|ty|cheers|great|awesome|cool|ok(ay)?|nice)\b[\s!.]*$"),
    ("greeting", r"^\s*(hi+|hello|hey+|yo|hola|namaste|good (morning|afternoon|evening))\b[\s!.,a-z]{0,20}$"),
    ("help", r"\b(help|what can you do|what do you do|commands|how do i use|features)\b"),
    ("set_hours", r"\b(set|change|update|i can (only )?study|i want to study|study)\b.*\b\d+(\.\d+)?\s*(hours?|hrs?|h)\b.*\b(a day|per day|daily|each day|every day|weekends?)\b|\bstudy hours?\b.*\b\d+(\.\d+)?\b"),
    ("set_start", r"\b(start|begin)\b.*\b(at|from)\s*\d{1,2}(:\d{2})?\s*(am|pm)?\b"),
    ("add_exam", r"\b(add|have|got|there'?s|schedule)\b.*\bexams?\b|\bexams?\b.*\b(on|is on|is)\b.*\d|\b(mid-?sem|end-?sem|midterm|final|quiz|test)\b.*\b(on|is on)\b"),
    ("add_assignment", r"\b(add|have|got|new|create)\b.*\b(assignment|homework|hw|lab record|lab report|worksheet)\b"),
    ("add_todo", r"\b(remind me|add (a |an )?(task|todo|to-do|reminder)|add .* to my (list|todos?)|^todo:|^task:|^remember to|i need to|i have to|don'?t let me forget)\b"),
    ("delete_item", r"\b(delete|remove|cancel|drop)\b"),
    ("mark_done", r"\b(mark|tick|check off|cross off)\b.*\b(done|complete|completed|finished|submitted)\b|\bi (just )?(finished|completed|submitted|did|wrapped up)\b|\b(done with|finished)\b"),
    ("what_now", r"\b(what should i (do|study|work on)|what('?s| is) next|where (do|should) i start|i'?m (bored|free)|what now)\b"),
    ("show_today", r"\b(today'?s?|tonight)\b.*\b(plan|schedule|tasks?|sessions?|blocks?)\b|\bwhat'?s my (plan|schedule)\b|\bplan for today\b|\bmy day\b"),
    ("show_deadlines", r"\b(deadlines?|due soon|what'?s due|due this|coming up|upcoming)\b"),
    ("show_week", r"\b(this|the|my|next 7 days?|whole)\s*week\b|\bweek(ly)? (plan|schedule)\b"),
    ("list_assignments", r"\b(assignments?|homework)\b"),
    ("list_exams", r"\bexams?\b|\btests?\b"),
    ("list_todos", r"\b(to-?dos?|tasks?|reminders?)\b"),
    ("regenerate_plan", r"\b(regenerate|replan|re-plan|redo|rebuild|refresh|update|reschedule|make)\b.*\b(plan|schedule|timetable)\b"),
    ("progress_check", r"\b(on track|how am i doing|my progress|progress|streak|xp|level|stats)\b"),
    ("cgpa_query", r"\b(cgpa|gpa|grade point|backlogs?)\b"),
    ("workload_query", r"\b(how (busy|much work|many hours)|free time|workload|am i free|hours (left|this week))\b"),
    ("recommend_courses", r"\b(recommend|suggest)\b.*\bcourses?\b|\bwhich courses?\b|\bcourses? (should|to take)\b"),
    ("placement_status", r"\b(placements?|applications?|jobs?|interviews?|offers?|eligible|companies)\b"),
    ("study_tips", r"\b(tips?|advice|motivat\w*|stress\w*|overwhelm\w*|burn ?out|procrastinat\w*|can'?t focus|focus|anxious|tired|lazy)\b"),
]


def classify(message: str) -> str:
    text = message.lower().strip()
    for intent, pattern in INTENTS:
        if re.search(pattern, text):
            return intent
    return "fallback"


# --------------------------------------------------------------------------
# Parsing helpers
# --------------------------------------------------------------------------

def _priority_from(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(urgent|asap|important|high priority|high-priority|critical)\b", t):
        return "high"
    if re.search(r"\b(low priority|low-priority|whenever|no rush|someday)\b", t):
        return "low"
    return "medium"


_FILLER = re.compile(
    r"\b(urgent|asap|important|high priority|high-priority|low priority|low-priority|no rush|whenever|someday|please|pls|plz|"
    r"critical)\b",
    re.I,
)


def _subject_from(text: str, subjects: list[str]) -> tuple[Optional[str], str]:
    """Returns (subject, text_without_subject_phrase)."""
    lowered = text.lower()
    for s in sorted(subjects, key=len, reverse=True):
        idx = lowered.find(s.lower())
        if idx >= 0:
            # remove "for <subject>" / "in <subject>" / "<subject>" from the title
            cleaned = re.sub(rf"\b(for|in|of|on)?\s*{re.escape(s)}\b", " ", text, flags=re.I, count=1)
            return s, cleaned
    m = re.search(r"\b(?:for|in)\s+([A-Z][\w&+.-]*(?:\s+[A-Z][\w&+.-]*){0,3})", text)
    if m:
        return m.group(1).strip(), text[:m.start()] + " " + text[m.end():]
    return None, text


def _clean_title(text: str, strip_patterns: list[str]) -> str:
    out = text
    for p in strip_patterns:
        out = re.sub(p, " ", out, flags=re.I)
    out = _FILLER.sub(" ", out)
    out = re.sub(r"\s+", " ", out).strip(" .:,-!?\"'")
    for _ in range(2):
        out = re.sub(r"^(to|a|an|the|my|on|about|regarding)\s+", "", out, flags=re.I)
    out = re.sub(r"\s+(by|on|due|for|before|until|at)$", "", out, flags=re.I)
    return out[:1].upper() + out[1:] if out else ""


def _hhmm(hour: float) -> str:
    h = int(hour)
    m = int(round((hour - h) * 60))
    suffix = "AM" if h < 12 else "PM"
    return f"{(h % 12) or 12}{f':{m:02d}' if m else ''} {suffix}"


# --------------------------------------------------------------------------
# Item matching (for done / delete)
# --------------------------------------------------------------------------

_MATCH_STOP = {
    "mark", "marked", "as", "done", "complete", "completed", "finish", "finished", "submitted", "submit",
    "i", "the", "a", "an", "my", "with", "check", "off", "tick", "cross", "just", "did", "it", "is", "have",
    "delete", "remove", "cancel", "drop", "task", "todo", "to-do", "assignment", "project", "please", "wrapped", "up",
    "from", "list", "reminder", "prep", "for", "of", "on", "to",
}


def _open_items(record: dict) -> list[tuple[str, dict, str]]:
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
    return items


def _best_match(record: dict, message: str, include_exams: bool = False) -> Optional[tuple[str, dict]]:
    words = [w for w in re.findall(r"[a-z0-9']+", message.lower()) if w not in _MATCH_STOP]
    if not words:
        return None
    target = " ".join(words)
    candidates = _open_items(record)
    if include_exams:
        candidates += [("exam", e, f"{e.get('subject', '')} exam") for e in record.get("exams", [])]
    best, best_score = None, 0.0
    for kind, item, label in candidates:
        label_l = label.lower()
        label_words = set(re.findall(r"[a-z0-9']+", label_l))
        overlap = len(label_words & set(words)) / max(len(set(words)), 1)
        fuzzy = difflib.SequenceMatcher(None, target, label_l).ratio()
        partial = max((difflib.SequenceMatcher(None, w, lw).ratio() for w in words for lw in label_words), default=0)
        score = overlap * 0.6 + fuzzy * 0.25 + (0.15 if partial > 0.85 else 0)
        if score > best_score:
            best, best_score = (kind, item), score
    return best if best_score >= 0.3 else None


def _item_title(kind: str, item: dict) -> str:
    if kind == "exam":
        return f"{item.get('subject', '')} exam"
    return item.get("title", "item")


# --------------------------------------------------------------------------
# Snapshots for replies / LLM
# --------------------------------------------------------------------------

def _today_blocks(record: dict) -> list[dict]:
    return (record.get("schedule") or {}).get("days", {}).get(date.today().isoformat(), [])


def _deadlines(record: dict, within_days: Optional[int] = None) -> list[tuple[str, str, str]]:
    today = date.today().isoformat()
    limit = (date.today() + timedelta(days=within_days)).isoformat() if within_days else "9999-12-31"
    items = []
    for a in record.get("assignments", []):
        if a.get("status") == "pending" and a.get("due_date"):
            items.append((a["due_date"], f"**{a.get('title')}**" + (f" ({a['subject']})" if a.get("subject") else ""), "assignment"))
    for e in record.get("exams", []):
        if e.get("date") and e["date"] >= today:
            items.append((e["date"], f"**{e.get('subject')}** exam", "exam"))
    for p in record.get("projects", []):
        if p.get("status") != "completed" and p.get("due_date"):
            items.append((p["due_date"], f"**{p.get('title')}** (project)", "project"))
    for t in record.get("todos", []):
        if not t.get("done") and t.get("due_date"):
            items.append((t["due_date"], t.get("title", ""), "todo"))
    for op in record.get("placements", {}).get("opportunities", []):
        if op.get("deadline") and op.get("status", "open") == "open":
            items.append((op["deadline"], f"{op.get('company')} — {op.get('role')} application", "placement"))
    items.sort(key=lambda x: x[0])
    return [i for i in items if today <= i[0] <= limit]


def _snapshot(record: dict) -> str:
    p = record.get("profile", {})
    today = date.today()
    lines = [
        f"Today is {today.strftime('%A %d %B %Y')}.",
        f"Student: {p.get('name')}, {p.get('degree')} {p.get('branch')}, year {p.get('year')} sem {p.get('semester')}.",
        f"Subjects: {', '.join(p.get('subjects') or []) or 'none'}. Goals: {', '.join(p.get('goals') or []) or 'none'}. Skills: {', '.join(p.get('skills') or []) or 'none'}.",
        f"Study budget: {p.get('study_hours_per_day')}h on weekdays, {p.get('weekend_hours_per_day') or p.get('study_hours_per_day')}h on weekends, from {_hhmm(float(p.get('preferred_start_hour') or 18))} until {_hhmm(float(p.get('latest_end_hour') or 23))}.",
    ]
    tb = _today_blocks(record)
    if tb:
        lines.append("Today's plan: " + "; ".join(f"{b['start']}-{b['end']} {b['title']}{' (done)' if b.get('done') else ''}" for b in tb))
    dl = _deadlines(record, 21)
    if dl:
        lines.append("Upcoming deadlines: " + "; ".join(f"{d}: {t.replace('**', '')}" for d, t, _ in dl[:10]))
    pend = [a for a in record.get("assignments", []) if a.get("status") == "pending"]
    if pend:
        lines.append("Pending assignments: " + "; ".join(f"{a['title']} ({a.get('subject') or '-'}, due {a.get('due_date') or 'no date'}, {a.get('priority')})" for a in pend[:12]))
    todos = [t for t in record.get("todos", []) if not t.get("done")]
    if todos:
        lines.append("Open to-dos: " + "; ".join(f"{t['title']} (due {t.get('due_date') or 'no date'})" for t in todos[:12]))
    exams = [e for e in record.get("exams", []) if (e.get("date") or "") >= today.isoformat()]
    if exams:
        lines.append("Upcoming exams: " + "; ".join(f"{e['subject']} on {e['date']}" for e in exams[:8]))
    apps = record.get("placements", {}).get("applications", [])
    if apps:
        app_lines = []
        for a in apps[:10]:
            placements_agent.migrate_application(a)
            rounds = ", ".join(f"{r['label']}: {r['status'].replace('_', ' ')}{' on ' + r['date'] if r.get('date') else ''}" for r in a["rounds"] if r["status"] != "na")
            app_lines.append(f"{a['company']} ({a.get('role') or '-'}) -> {a['status']} [{rounds}]")
        lines.append("Job applications: " + " | ".join(app_lines))
    tt = p.get("timetable") or []
    if tt:
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        lines.append("Weekly classes: " + "; ".join(f"{days[int(t['day'])]} {t['start']}-{t['end']} {t.get('label', '')}" for t in tt[:14]))
    stats = gamification.summary(record)
    lines.append(f"Progress: level {stats['level']} ({stats['title']}), {stats['xp']} XP, {stats['streak']}-day streak.")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Main entry point
# --------------------------------------------------------------------------

STUDY_TIPS = [
    "Try a **50/10 rhythm** — 50 minutes of focus, 10 minutes away from the screen. Your planner already spaces sessions with breaks.",
    "Start with the task that's **closest to its deadline**, not the easiest one. Clearing it removes the biggest source of stress first.",
    "Feeling stuck? Shrink the task: \"write the intro paragraph\" is easier to start than \"write the report\". Starting is the hard part.",
    "Do **active recall** instead of re-reading: close the notes and write down everything you remember, then check the gaps.",
    "Put your phone in another room during a focus session. Out of sight really is out of mind.",
    "Study your hardest subject when your energy is highest — usually the first session of your study block.",
]
STRESS_REPLY = (
    "That sounds like a lot right now. A few things that genuinely help:\n"
    "• Pick **one** next step — just the next 25 minutes, not the whole week.\n"
    "• Your plan already orders work by deadline, so you can trust it and stop juggling it in your head.\n"
    "• Take a real break: a walk, water, food. Rest is part of studying.\n"
    "If it keeps feeling heavy, talking to a friend, mentor or your college counsellor really helps."
)


def handle_message(record: dict, message: str) -> dict:
    """
    Returns {"reply", "intent", "action_taken", "suggestions"}.
    May mutate `record`; the caller persists it.
    """
    message = (message or "").strip()[:1000]

    # With an LLM configured, it understands the message and calls tools for
    # any action; the rule layer below is the fallback (no key / call failed).
    if llm.is_enabled() and os.environ.get("LLM_CHAT_MODE", "tools").lower() != "rules":
        result = _llm_turn(record, message)
        if result:
            _remember(record, message, result["reply"])
            return result

    intent = classify(message)
    profile = record.setdefault("profile", {})
    name = (profile.get("name") or "there").split(" ")[0]
    subjects = profile.get("subjects") or []
    action: Optional[dict] = None
    suggestions = DEFAULT_SUGGESTIONS
    reply = ""
    today = date.today()

    # Messages about a company you've applied to -> placement rounds
    app_hit = actions.company_in_text(record, message) if intent not in ("add_application",) else None
    if app_hit and intent not in ("delete_item",):
        low = message.lower()
        key = actions.round_from_text(low)
        due, date_text = parse_date_phrase(message, today)
        status = None
        if re.search(r"\b(cleared|passed|selected|qualified|got through|cracked|made it)\b", low):
            status = "selected"
        elif re.search(r"\b(rejected|failed|didn'?t (clear|make|get)|not selected|not cleared)\b", low):
            status = "rejected"
        elif re.search(r"\b(no|not conducting|skip(ped)?|isn'?t having|don'?t have)\b.*\b(round|test|interview|gd)\b", low):
            status = "na"
        if status or (key and due):
            reply, action = actions.update_placement_round(record, app_hit["company"], key, status, due if due else None)
            intent = "placement_round"
        else:
            reply = actions.placement_status(record, app_hit["company"])
            intent = "placement_status"
        suggestions = [f"I cleared the {app_hit['company']} {placements_agent.ROUND_LABEL.get(app_hit.get('current_round') or 'coding', 'coding test').lower()}", "Show all my applications", "What should I do now?"]

    elif intent == "busy_time":
        due, date_text = parse_date_phrase(message, today)
        low = message.lower()
        start = end = None
        m = re.search(r"\b(?:from|between)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|and|till|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", low)
        if m:
            start, end = m.group(1), m.group(2)
            if not re.search(r"am|pm", start) and re.search(r"pm", end):
                start += "pm"
        else:
            m2 = re.search(r"\b(?:after|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", low)
            m3 = re.search(r"\b(?:until|till|before)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", low)
            if m2:
                start = m2.group(1)
            if m3:
                end = m3.group(1)
            if "tonight" in low or "evening" in low:
                start = start or "17:00"
            elif "morning" in low:
                start, end = start or "06:00", end or "12:00"
            elif "afternoon" in low:
                start, end = start or "12:00", end or "17:00"
        def _pm(v):
            if v and not re.search(r"am|pm|:", v) and int(v) < 8:
                return v + "pm"
            return v
        reply, action = actions.mark_busy(record, due, _pm(start), _pm(end), "Busy")
        suggestions = ["Show today's plan", "Show my week"]

    elif intent == "reschedule":
        due, date_text = parse_date_phrase(message, today)
        if not due:
            reply = "To which date? e.g. “move the OS report to monday”."
        else:
            name_part = message.replace(date_text, " ")
            name_part = re.sub(r"\b(move|push|postpone|reschedule|shift|extend|prepone|the|my|deadline|due date|is now due|to|till|until|by|of)\b", " ", name_part, flags=re.I)
            reply, action = actions.reschedule_item(record, name_part.strip(), due)
        suggestions = ["Show my week", "What's due this week?"]

    elif intent == "add_application":
        m = re.search(r"\b(?:applied|apply|applying)\s+(?:to|for|at)\s+(.+?)(?:\s+(?:for|as)\s+(?:a |an |the )?(.+?))?[.!]?$", message, re.I)
        if not m:
            reply = "Which company did you apply to? e.g. “I applied to Infosys for Systems Engineer”."
        else:
            company, role = m.group(1).strip(), (m.group(2) or "").strip()
            reply, action = actions.add_application(record, company.title() if company.islower() else company, role)
            if action:
                reply += "\nTell me the rounds as they come, e.g. “" + action["item"]["company"] + " coding test is on friday”."
        suggestions = ["Show all my applications", "What should I do now?"]

    elif intent == "greeting":
        hour = datetime.now().hour
        part = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
        pending = len([b for b in _today_blocks(record) if not b.get("done")])
        reply = f"Good {part}, {name}! "
        reply += (f"You have **{pending} study session{'s' if pending != 1 else ''}** planned for today. " if pending
                  else "Your plan for today is clear. ")
        reply += "What can I help with?"
        suggestions = ["What should I do now?", "What's due this week?", "Add an assignment", "Give me a study tip"]

    elif intent == "thanks":
        reply = random.choice(["Anytime! 🙌", "Happy to help — go get it!", "You've got this. 💪"])

    elif intent == "help":
        reply = (
            "Here's what I can do — just type naturally:\n"
            "• **Plan** — \"what should I do now?\", \"show my week\", \"re-plan my schedule\"\n"
            "• **Add things** — \"add DBMS assignment due friday\", \"ML exam on 20th oct\", \"remind me to email prof tomorrow\"\n"
            "• **Finish things** — \"I finished the OS report\", \"mark email prof as done\"\n"
            "• **Remove things** — \"delete the notebook task\"\n"
            "• **Settings** — \"I can study 4 hours a day\", \"start at 7pm\"\n"
            "• **Insights** — deadlines, workload, progress & streak, courses, placements"
        )
        if llm.is_enabled():
            reply += "\n• **Study help** — ask me to explain a concept or quiz you on a topic"
        suggestions = ["What should I do now?", "Add an assignment", "Show my week", "How am I doing?"]

    elif intent in ("add_assignment", "add_exam", "add_todo"):
        due, date_text = parse_date_phrase(message, today)
        text = message.replace(date_text, " ") if date_text else message
        priority = _priority_from(message)

        if intent == "add_exam":
            subject, rest = _subject_from(text, subjects)
            if not subject:
                guess = _clean_title(rest, [r"\b(add|i have|i've got|have|got|there'?s|schedule|an?|my|new)\b",
                                            r"\b(exams?|internal|external|mid-?sem|end-?sem|midterm|final|quiz|test|is|on)\b"])
                subject = guess or None
            if not due:
                reply = f"When is the {subject + ' ' if subject else ''}exam? Try something like \"{subject or 'DBMS'} exam on 24th oct\"."
                suggestions = [f"{subject or 'DBMS'} exam next friday", f"{subject or 'DBMS'} exam in 10 days"]
            elif not subject:
                reply = "Which subject is the exam for? e.g. \"Machine Learning exam on " + humanize(due) + "\""
                suggestions = [f"{s} exam {date_text.strip()}" for s in subjects[:3]] or DEFAULT_SUGGESTIONS
            else:
                kind = "external" if re.search(r"\b(external|end-?sem|final|semester)\b", message, re.I) else "internal"
                item = storage.append_item(record, "exams", {"subject": subject, "date": due, "type": kind, "syllabus": ""}, "exam")
                replan(record)
                action = {"type": "exam_created", "item": item}
                prep = [b for bl in record["schedule"]["days"].values() for b in bl if b["ref_id"] == item["id"]]
                reply = (f"Added your **{subject}** {kind} exam on **{humanize(due)}** ({due}). "
                         f"I've scheduled {len(prep)} prep session{'s' if len(prep) != 1 else ''} before it.")
                suggestions = ["Show my week", "What should I do now?", "Give me a revision strategy" if llm.is_enabled() else "Give me a study tip"]

        elif intent == "add_assignment":
            subject, rest = _subject_from(text, subjects)
            title = _clean_title(rest, [r"\b(add|i have|i've got|have|got|new|create|an?|my)\b",
                                        r"\b(assignment|homework|hw)\b", r"\b(due|by|on|for|subject)\b\s*$"])
            title = title or (f"{subject} assignment" if subject else "New assignment")
            item = storage.append_item(record, "assignments", {
                "title": title, "subject": subject or "", "due_date": due, "status": "pending", "priority": priority,
            }, "asg")
            replan(record)
            action = {"type": "assignment_created", "item": item}
            first = next((b for d in sorted(record["schedule"]["days"]) for b in record["schedule"]["days"][d] if b["ref_id"] == item["id"]), None)
            reply = f"Added assignment **{title}**" + (f" for {subject}" if subject else "") + (f", due **{humanize(due)}**" if due else "") + "."
            if first:
                reply += f" First work session: {humanize(first['date'])} at {first['start']}."
            if not due:
                reply += " Tell me the due date (e.g. \"it's due friday\") so I can prioritise it properly."
            suggestions = ["Show my week", "What should I do now?", "What's due this week?"]

        else:  # add_todo
            title = _clean_title(text, [
                r"\b(remind me to|remind me|add (a |an )?(task|todo|to-do|reminder)( to)?|add|to my (list|todos?)|"
                r"remember to|i need to|i have to|don'?t let me forget to|don'?t let me forget)\b",
                r"^(todo|task):",
            ])
            title = title or "New task"
            item = storage.append_item(record, "todos", {
                "title": title, "due_date": due, "done": False, "priority": priority,
                "schedulable": True, "subject": "Personal", "source": "chatbot",
            }, "todo")
            replan(record)
            action = {"type": "todo_created", "item": item}
            reply = f"Added to your to-dos: **{title}**" + (f" — due {humanize(due)}" if due else "") + ". It's in your plan too."
            suggestions = ["Show my to-dos", "What should I do now?", "Add another task"]

    elif intent == "mark_done":
        match = _best_match(record, message)
        if not match:
            open_titles = [_item_title(k, i) for k, i, _ in _open_items(record)][:4]
            reply = "I couldn't tell which task you mean."
            if open_titles:
                reply += " Did you mean one of these?"
                suggestions = [f"I finished {t}" for t in open_titles]
            else:
                reply += " You don't have any open tasks right now."
        else:
            kind, item = match
            title = _item_title(kind, item)
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
            action = {"type": f"{kind}_completed", "item": item, "xp": xp}
            reply = random.choice(["Nice work!", "Boom, done!", "One less thing!", "Great job!"]) + f" Marked **{title}** as done. **+{xp} XP** ✨"
            suggestions = ["What should I do now?", "How am I doing?", "What's due this week?"]

    elif intent == "delete_item":
        match = _best_match(record, message, include_exams=True)
        if not match:
            reply = "I couldn't find that item. Try naming it more specifically, e.g. \"delete the notebook task\"."
        else:
            kind, item = match
            section = {"todo": "todos", "assignment": "assignments", "project": "projects", "exam": "exams"}.get(kind)
            if section:
                storage.delete_item(record, section, item["id"])
            else:
                storage.delete_nested_item(record, "placements", "prep_tasks", item["id"])
            replan(record)
            action = {"type": f"{kind}_deleted", "item": item}
            reply = f"Removed **{_item_title(kind, item)}** and updated your plan."
            suggestions = ["Show my to-dos", "Show my week"]

    elif intent == "set_hours":
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b", message.lower())
        hours = max(0.5, min(12.0, float(m.group(1)))) if m else None
        if hours is None:
            reply = "How many hours a day can you study? e.g. \"I can study 4 hours a day\"."
        else:
            weekend = "weekend" in message.lower()
            profile["weekend_hours_per_day" if weekend else "study_hours_per_day"] = hours
            replan(record)
            action = {"type": "settings_updated"}
            reply = f"Done — your {'weekend' if weekend else 'daily'} study budget is now **{hours:g}h**. I've rebuilt your plan around it."
            suggestions = ["Show today's plan", "Show my week"]

    elif intent == "set_start":
        m = re.search(r"\b(?:at|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", message.lower())
        if not m:
            reply = "What time should study sessions start? e.g. \"start at 7pm\"."
        else:
            h = int(m.group(1)) % 24
            mins = int(m.group(2) or 0)
            ampm = m.group(3)
            if ampm == "pm" and h < 12:
                h += 12
            if ampm == "am" and h == 12:
                h = 0
            if not ampm and h < 7:
                h += 12  # "start at 6" almost always means 6 PM for students
            profile["preferred_start_hour"] = round(h + mins / 60, 2)
            replan(record)
            action = {"type": "settings_updated"}
            reply = f"Got it — sessions will start at **{_hhmm(profile['preferred_start_hour'])}** from now on. Plan updated."
            suggestions = ["Show today's plan", "Show my week"]

    elif intent in ("what_now", "show_today"):
        if not (record.get("schedule") or {}).get("days"):
            replan(record)
        blocks = _today_blocks(record)
        open_blocks = [b for b in blocks if not b.get("done")]
        if intent == "what_now":
            if open_blocks:
                b = open_blocks[0]
                reply = (f"Next up: **{b['title']}** ({b['start']}–{b['end']})."
                         + (f" It's due {humanize(b['due_date'])}." if b.get("due_date") else "")
                         + " Open the focus timer on your dashboard and go for it 🎯")
                if len(open_blocks) > 1:
                    reply += f"\nAfter that: {open_blocks[1]['title']} at {open_blocks[1]['start']}."
            else:
                dl = _deadlines(record, 7)
                if dl:
                    reply = f"Today's plan is done ✅. If you want to get ahead, start on {dl[0][1]} (due {humanize(dl[0][0])})."
                else:
                    reply = "Nothing is pending today — you're free! A good moment to rest or review a weak topic."
        else:
            if not blocks:
                reply = "Nothing planned for today. Add an assignment, exam or task and I'll schedule it."
            else:
                done = len(blocks) - len(open_blocks)
                lines = [f"{'✅' if b.get('done') else '•'} {b['start']}–{b['end']}  {b['title']}" for b in blocks]
                reply = f"Today's plan ({done}/{len(blocks)} done):\n" + "\n".join(lines)
        suggestions = ["Show my week", "What's due this week?", "Give me a study tip"]

    elif intent == "show_week":
        if not (record.get("schedule") or {}).get("days"):
            replan(record)
        days = record["schedule"]["days"]
        lines = []
        for d in sorted(days)[:7]:
            bl = days[d]
            mins = sum(b.get("minutes", 0) for b in bl)
            label = humanize(d).capitalize()
            if not bl:
                lines.append(f"• **{label}** — free")
            else:
                focus = ", ".join(dict.fromkeys(b["title"] for b in bl))
                lines.append(f"• **{label}** ({mins / 60:g}h) — {focus}")
        reply = "Your week at a glance:\n" + "\n".join(lines)
        suggestions = ["What should I do now?", "Re-plan my schedule", "What's due this week?"]

    elif intent == "show_deadlines":
        within = 7 if re.search(r"\bweek\b", message.lower()) else None
        upcoming = _deadlines(record, within)
        overdue = [o["title"] for o in (record.get("schedule") or {}).get("overdue", [])]
        if not upcoming and not overdue:
            reply = "No upcoming deadlines on record — you're all clear! 🎉"
        else:
            lines = [f"⚠️ **{t}** is overdue" for t in overdue[:3]]
            lines += [f"• {humanize(d).capitalize()} — {t}" for d, t, _ in upcoming[:8]]
            reply = ("Deadlines this week:\n" if within else "Upcoming deadlines:\n") + "\n".join(lines)
        suggestions = ["What should I do now?", "Show my week", "Add an assignment"]

    elif intent == "list_assignments":
        pending = sorted([a for a in record.get("assignments", []) if a.get("status") == "pending"],
                         key=lambda a: a.get("due_date") or "9999")
        if not pending:
            reply = "No pending assignments — nice and clear! Add one by saying e.g. \"add OS assignment due monday\"."
        else:
            lines = [f"• **{a['title']}**" + (f" ({a['subject']})" if a.get("subject") else "") + f" — due {humanize(a.get('due_date'))}" for a in pending[:8]]
            reply = f"You have {len(pending)} pending assignment{'s' if len(pending) != 1 else ''}:\n" + "\n".join(lines)
            suggestions = [f"I finished {pending[0]['title']}", "What should I do now?", "Add an assignment"]

    elif intent == "list_exams":
        upcoming = sorted([e for e in record.get("exams", []) if (e.get("date") or "") >= today.isoformat()], key=lambda e: e["date"])
        if not upcoming:
            reply = "No upcoming exams on record. Tell me like \"DBMS exam on 24th oct\" and I'll plan prep sessions."
        else:
            reply = "Upcoming exams:\n" + "\n".join(f"• **{e['subject']}** — {humanize(e['date'])} ({e['date']}), {e.get('type', 'internal')}" for e in upcoming[:6])
        suggestions = ["Show my week", "Give me a study tip"]

    elif intent == "list_todos":
        pending = [t for t in record.get("todos", []) if not t.get("done")]
        if not pending:
            reply = "Your to-do list is empty! Say \"remind me to …\" to add something."
            suggestions = ["Remind me to review notes tomorrow", "What should I do now?"]
        else:
            order = {"high": 0, "medium": 1, "low": 2}
            pending.sort(key=lambda t: (t.get("due_date") or "9999", order.get(t.get("priority", "medium"), 1)))
            lines = [f"• {t['title']}" + (f" — {humanize(t['due_date'])}" if t.get("due_date") else "") + (" 🔥" if t.get("priority") == "high" else "") for t in pending[:8]]
            reply = f"{len(pending)} open to-do{'s' if len(pending) != 1 else ''}:\n" + "\n".join(lines)
            suggestions = [f"I finished {pending[0]['title']}", "Add a task"]

    elif intent == "regenerate_plan":
        schedule = replan(record, use_llm=True)
        action = {"type": "schedule_regenerated"}
        reply = "Plan rebuilt from your latest assignments, exams, projects and to-dos.\n\n" + schedule["explanation"]
        suggestions = ["Show today's plan", "Show my week"]

    elif intent == "progress_check":
        s = gamification.summary(record)
        pending_a = len([a for a in record.get("assignments", []) if a.get("status") == "pending"])
        overdue = (record.get("schedule") or {}).get("overdue", [])
        blocks = _today_blocks(record)
        done_today = len([b for b in blocks if b.get("done")])
        reply = (f"You're **level {s['level']} · {s['title']}** with {s['xp']} XP"
                 f" ({s['xp_for_next'] - s['xp_into_level']} XP to the next level).\n"
                 f"🔥 Streak: **{s['streak']} day{'s' if s['streak'] != 1 else ''}** (best {s['best_streak']})\n"
                 f"Today: {done_today}/{len(blocks)} sessions done · {pending_a} assignment{'s' if pending_a != 1 else ''} pending")
        reply += f"\n⚠️ {len(overdue)} overdue — catch-up time is in today's plan." if overdue else "\nNothing overdue — you're on track. 🌙"
        suggestions = ["What should I do now?", "What's due this week?"]

    elif intent == "cgpa_query":
        cgpa = profile.get("cgpa")
        backlogs = profile.get("active_backlogs", 0)
        if cgpa:
            reply = f"Your CGPA on record is **{cgpa}** with {backlogs} active backlog{'s' if backlogs != 1 else ''}. You can update it on the Placements page."
        else:
            reply = "You haven't added your CGPA yet — set it on the Placements page so I can check job eligibility for you."

    elif intent == "workload_query":
        if not (record.get("schedule") or {}).get("days"):
            replan(record)
        days = record["schedule"]["days"]
        total = sum(b.get("minutes", 0) for bl in days.values() for b in bl if not b.get("done")) / 60
        free_days = [humanize(d) for d, bl in sorted(days.items()) if not bl]
        busiest = max(days.items(), key=lambda kv: sum(b.get("minutes", 0) for b in kv[1]), default=None)
        reply = f"You have about **{total:g}h** of planned work over the next {len(days)} days."
        if busiest and busiest[1]:
            reply += f" Busiest day: {humanize(busiest[0])} ({sum(b.get('minutes', 0) for b in busiest[1]) / 60:g}h)."
        if free_days:
            reply += f" Free days: {', '.join(free_days[:3])}."
        suggestions = ["Show my week", "I can study 4 hours a day"]

    elif intent == "recommend_courses":
        recs = course_recommender.recommend_courses(profile)
        if not recs:
            reply = "Add your branch, goals or skills in Settings and I'll recommend courses that fit."
        else:
            reply = "Courses that fit your goals:\n" + "\n".join(f"• **{r['name']}** — {r['provider']}, {r['duration_weeks']} weeks" for r in recs[:4])
            suggestions = ["What skills am I missing for jobs?", "What should I do now?"]

    elif intent == "placement_status":
        apps = record.get("placements", {}).get("applications", [])
        if re.search(r"\b(eligible|skills?|missing|which jobs|companies can i)\b", message.lower()) and not apps or re.search(r"\b(eligible|skills?|missing)\b", message.lower()):
            report = placements_agent.build_eligibility_report(profile)
            reply = f"You're eligible for **{len(report['eligible'])}** of {len(report['eligible']) + len(report['not_eligible'])} roles on the job board."
            gaps = placements_agent.resume_suggestions(record)["top_skill_gaps"][:4]
            if gaps:
                reply += "\nSkills that would unlock the most roles: " + ", ".join(f"**{g['skill']}**" for g in gaps) + "."
        else:
            reply = actions.placement_status(record)
        suggestions = ["What skills am I missing for jobs?", "When is my next interview?", "Recommend courses for me"]

    elif intent == "study_tips":
        if re.search(r"stress|overwhelm|anxious|burn ?out|too much|tired", message.lower()):
            reply = STRESS_REPLY
        else:
            reply = random.choice(STUDY_TIPS)
        suggestions = ["Another tip", "What should I do now?"]

    if not reply:  # fallback -> LLM or grounded offline reply
        intent = "fallback"
        reply = _fallback(record, message, name)
        suggestions = DEFAULT_SUGGESTIONS

    _remember(record, message, reply)
    return {"reply": reply, "intent": intent, "action_taken": action, "suggestions": suggestions[:4]}


def _remember(record: dict, message: str, reply: str) -> None:
    history = record.setdefault("chat_history", [])
    now = datetime.now().isoformat(timespec="seconds")
    history.append({"role": "user", "content": message, "timestamp": now})
    history.append({"role": "assistant", "content": reply, "timestamp": now})
    record["chat_history"] = history[-200:]


LLM_SYSTEM = (
    "You are Crescent, a warm, sharp study assistant inside a student planner app. You can see the student's data below "
    "and you can change it ONLY by calling the provided tools.\n"
    "Rules:\n"
    "- When the student asks to add, finish, delete, move, reschedule, block time, change study hours, or update a job "
    "application round, CALL THE MATCHING TOOL. Never claim you did something without calling a tool.\n"
    "- Convert relative dates (tomorrow, friday, 24th oct) to YYYY-MM-DD using today's date below.\n"
    "- For questions about their plan, deadlines or applications, answer ONLY from the data below; never invent items.\n"
    "- You may also explain concepts, make quizzes and revision strategies.\n"
    "- Be concise (under 150 words unless asked). Use **bold** for key terms and '• ' bullets for lists.\n\n"
)


def _llm_turn(record: dict, message: str) -> Optional[dict]:
    history = [m for m in record.get("chat_history", [])[-8:] if m.get("role") in ("user", "assistant")]
    msgs = [{"role": "system", "content": LLM_SYSTEM + "STUDENT DATA:\n" + _snapshot(record)}]
    msgs += [{"role": m["role"], "content": m["content"]} for m in history]
    msgs.append({"role": "user", "content": message})

    out = llm.chat_with_tools(msgs, actions.TOOLS)
    if out is None:
        # provider without tool support: plain answer for questions, rules handle actions
        if classify(message) in ("fallback", "study_tips", "help"):
            text = llm.chat(msgs, temperature=0.5, max_tokens=600)
            if text:
                return {"reply": text, "intent": "llm", "action_taken": None, "suggestions": DEFAULT_SUGGESTIONS}
        return None

    if not out["tool_calls"]:
        if not out["content"]:
            return None
        return {"reply": out["content"], "intent": "llm", "action_taken": None, "suggestions": DEFAULT_SUGGESTIONS}

    replies, last_action, total_xp = [], None, 0
    for call in out["tool_calls"][:5]:
        text, act = actions.run_tool(record, call["name"], call["arguments"] or {})
        replies.append(text)
        if act:
            last_action = act
            total_xp += act.get("xp") or 0
    if last_action is not None and total_xp:
        last_action = {**last_action, "xp": total_xp}
    reply = "\n".join(replies)
    if out["content"] and len(out["content"]) < 400:
        reply = out["content"] + "\n\n" + reply
    return {"reply": reply, "intent": "llm_tools", "action_taken": last_action,
            "suggestions": ["What should I do now?", "Show my week", "How am I doing?"]}


def _fallback(record: dict, message: str, name: str) -> str:
    history = [m for m in record.get("chat_history", [])[-8:] if m.get("role") in ("user", "assistant")]
    if llm.is_enabled():
        system = (
            "You are Crescent, a friendly, sharp study assistant inside a student planner app. "
            "Answer study questions clearly (explain concepts, make quizzes, revision strategies). "
            "When the question is about the student's work, use ONLY the data below — never invent deadlines. "
            "Keep replies under 150 words unless asked for detail. Use **bold** for key terms and '•' bullets for lists. "
            "If they want to add/finish/delete something, tell them the exact phrase to type, e.g. "
            "\"add OS assignment due friday\", \"I finished X\", \"delete X\".\n\n"
            f"STUDENT DATA:\n{_snapshot(record)}"
        )
        msgs = [{"role": "system", "content": system}]
        msgs += [{"role": m["role"], "content": m["content"]} for m in history]
        msgs.append({"role": "user", "content": message})
        text = llm.chat(msgs, temperature=0.5, max_tokens=600)
        if text:
            return text

    # Offline: try to be useful with the student's own data.
    text = message.lower()
    subjects = record.get("profile", {}).get("subjects") or []
    subj = next((s for s in subjects if s.lower() in text), None)
    if subj:
        a = [x for x in record.get("assignments", []) if x.get("subject") == subj and x.get("status") == "pending"]
        e = [x for x in record.get("exams", []) if x.get("subject") == subj and (x.get("date") or "") >= date.today().isoformat()]
        bits = []
        if a:
            bits.append(f"{len(a)} pending assignment{'s' if len(a) != 1 else ''} (next: **{sorted(a, key=lambda x: x.get('due_date') or '9999')[0]['title']}**)")
        if e:
            bits.append(f"an exam on {humanize(sorted(e, key=lambda x: x['date'])[0]['date'])}")
        if bits:
            return f"For **{subj}** you have " + " and ".join(bits) + "."
        return f"Nothing pending for **{subj}** right now."
    return (
        f"I'm not sure how to help with that one, {name}. I'm best at your plan and tasks — try "
        "\"what should I do now?\", \"add DBMS assignment due friday\" or \"I finished the OS report\"."
        + ("" if llm.is_enabled() else
           "\n\n_Tip: add an AI key to backend/.env (see README) and I can also explain concepts and answer study questions._")
    )
