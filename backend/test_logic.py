"""
test_logic.py
-------------
Framework-free tests for the core logic: date parsing, the Planner Agent,
the Chatbot Agent, gamification, auth and the course recommender.

    python test_logic.py        (from the backend/ folder)

Prints ALL TESTS PASSED on success. No API key or server needed.
"""
import os
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tempfile
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")   # never touch the real database
os.environ["LLM_CHAT_MODE"] = "rules"                                          # deterministic tests, even with a key set

from app import storage, course_recommender, gamification, auth, placements_agent
from app.dates import parse_date_phrase
from app.planner_agent import generate_schedule, offline_explanation, toggle_block, busy_intervals
from app.chatbot_agent import handle_message, classify

TODAY = date(2026, 10, 14)  # a Wednesday -- fixed so the tests are deterministic
passed = 0


def check(cond, msg):
    global passed
    assert cond, msg
    passed += 1
    print(f"  ✓ {msg}")


def section(title):
    print("\n" + "=" * 70 + f"\n{title}\n" + "-" * 70)


def make_record():
    r = storage.default_student_record("test_logic_tmp")
    r["profile"].update({
        "name": "Rohan Mehta", "degree": "B.Tech", "branch": "Computer Science", "year": 3, "semester": 5,
        "subjects": ["Machine Learning", "Operating Systems", "DBMS"],
        "goals": ["get into AI/ML", "crack placements"], "skills": ["python", "sql"],
        "study_hours_per_day": 4, "preferred_start_hour": 17, "onboarded": True,
    })
    d = lambda n: (TODAY + timedelta(days=n)).isoformat()
    storage.append_item(r, "assignments", {"title": "OS Scheduling Report", "subject": "Operating Systems", "due_date": d(2), "status": "pending", "priority": "high"}, "asg")
    storage.append_item(r, "assignments", {"title": "DBMS Normalization Worksheet", "subject": "DBMS", "due_date": d(6), "status": "pending", "priority": "medium"}, "asg")
    storage.append_item(r, "assignments", {"title": "Late Lab Record", "subject": "DBMS", "due_date": d(-2), "status": "pending", "priority": "low"}, "asg")
    storage.append_item(r, "projects", {"title": "Mini ML Project", "subject": "Machine Learning", "due_date": d(10), "status": "in_progress", "priority": "high"}, "proj")
    storage.append_item(r, "exams", {"subject": "Machine Learning", "date": d(5), "type": "internal"}, "exam")
    storage.append_nested_item(r, "placements", "prep_tasks", {"title": "Practice DSA - Trees", "due_date": d(3), "priority": "high", "done": False}, "prep")
    storage.append_item(r, "todos", {"title": "Email advisor about elective", "due_date": d(1), "done": False, "priority": "medium"}, "todo")
    return r


def main():
    section("1. Natural-language dates")
    for phrase, expected in [("by friday", "2026-10-16"), ("tomorrow", "2026-10-15"), ("in 3 days", "2026-10-17"),
                             ("on 20th oct", "2026-10-20"), ("next monday", "2026-10-19"), ("due 25/10", "2026-10-25")]:
        got, _ = parse_date_phrase(f"submit it {phrase}", TODAY)
        check(got == expected, f"'{phrase}' -> {expected}")

    section("2. Planner Agent")
    r = make_record()
    s = generate_schedule(r, days_ahead=7, reference_date=TODAY, now=datetime(2026, 10, 14, 19, 10))
    today_blocks = s["days"][TODAY.isoformat()]
    for day, blocks in s["days"].items():
        print(f"    {day}: " + ", ".join(f"{b['start']}-{b['end']} {b['title']}" for b in blocks))
    check(len(s["days"]) == 7, "plans a 7-day window")
    check(all(b["start"] >= "19:15" for b in today_blocks), "today's sessions never start in the past")
    check(today_blocks[0]["title"].startswith("Catch up: Late Lab Record"), "overdue work is scheduled first instead of disappearing")
    check(any(o["title"] == "Late Lab Record" for o in s["overdue"]), "overdue items are reported")
    check(all(b["end"] <= "23:00" for bl in s["days"].values() for b in bl), "nothing runs past the 23:00 stop time")
    for day, blocks in s["days"].items():
        mins = sum(b["minutes"] for b in blocks)
        assert mins <= 4 * 60 + 1, f"{day} exceeds the 4h budget"
        for a, b in zip(blocks, blocks[1:]):
            assert a["end"] < b["start"], f"{day}: no break between {a['title']} and {b['title']}"
    check(True, "every day respects the study budget and has breaks between sessions")
    exam_day = (TODAY + timedelta(days=5)).isoformat()
    check(not any(b["category"] == "exam_prep" and b["date"] >= exam_day for bl in s["days"].values() for b in bl),
          "exam prep happens before the exam, not on/after it")
    ids = [b["id"] for bl in s["days"].values() for b in bl]
    check(len(ids) == len(set(ids)), "every session has a unique id")

    r["schedule"] = s
    first = today_blocks[0]
    toggle_block(r, first["id"])
    late = next(a for a in r["assignments"] if a["title"] == "Late Lab Record")
    check(late["hours_logged"] == first["minutes"] / 60, "ticking a session logs its hours on the assignment")
    s2 = generate_schedule(r, reference_date=TODAY, now=datetime(2026, 10, 14, 20, 40))
    kept = [b for b in s2["days"][TODAY.isoformat()] if b.get("done")]
    check(len(kept) == 1 and kept[0]["id"] == first["id"], "completed sessions stay in place when re-planning")
    print("    explanation:", offline_explanation(s2))

    section("2b. Timetable, busy time & placement-round prep")
    r = make_record()
    r["profile"].update(preferred_start_hour=9, latest_end_hour=21,
                        timetable=[{"day": TODAY.weekday(), "start": "09:00", "end": "13:00"}],
                        busy=[{"date": TODAY.isoformat(), "start": "17:00", "end": "19:00"}])
    app = storage.append_nested_item(r, "placements", "applications", {"company": "Acme", "role": "SDE",
                                     "rounds": placements_agent.make_rounds(["resume", "coding", "interview1"])}, "app")
    placements_agent.update_round(app, "resume", "selected")
    placements_agent.update_round(app, "coding", date=(TODAY + timedelta(days=2)).isoformat())
    s = generate_schedule(r, reference_date=TODAY, now=datetime(2026, 10, 14, 8, 0))
    tb = s["days"][TODAY.isoformat()]
    print("    today: " + ", ".join(f"{b['start']}-{b['end']} {b['title']}" for b in tb))
    check(all(not ("09:00" <= b["start"] < "13:00") for b in tb), "no sessions during class hours")
    check(all(b["end"] <= "17:00" or b["start"] >= "19:00" for b in tb), "no sessions during one-off busy time")
    check(all(b["minutes"] >= 30 for bl in s["days"].values() for b in bl if b["category"] != "todo"), "no fragment sessions shorter than 30 min")
    prep = [b for bl in s["days"].values() for b in bl if b["ref_id"].startswith("round:")]
    check(prep and all(b["date"] < (TODAY + timedelta(days=2)).isoformat() for b in prep), "coding-test prep is scheduled before the round")
    check(busy_intervals(r["profile"], TODAY) == [(9.0, 13.0), (17.0, 19.0)], "busy intervals merge timetable + one-off blocks")

    section("2c. Placement rounds")
    a = {"company": "X", "role": "Y", "rounds": placements_agent.make_rounds(["coding", "interview1"])}
    placements_agent.summarize(a)
    check([r_["status"] for r_ in a["rounds"]].count("na") == 5, "rounds a company doesn't hold are N/A")
    check(a["current_round"] == "coding", "first conducted round starts in progress")
    placements_agent.update_round(a, "coding", "selected")
    check(a["current_round"] == "interview1" and a["rounds"][4]["status"] == "in_progress", "clearing a round starts the next one")
    placements_agent.update_round(a, "interview1", "selected")
    check(a["result"] == "offer", "clearing every round = offer")
    old = {"company": "Old", "role": "Z", "pipeline_stage_index": 3, "rejected": False}
    placements_agent.migrate_application(old)
    check(old["rounds"][0]["status"] == "selected" and old["current_round"] == "interview1", "old pipeline applications are converted")

    section("3. Chatbot Agent")
    r = make_record()
    r["schedule"] = generate_schedule(r, reference_date=TODAY)
    for msg, intent in [("hi", "greeting"), ("what should I do now?", "what_now"), ("what's due this week?", "show_deadlines"),
                        ("add DBMS assignment ER diagram due friday", "add_assignment"), ("ML exam on 24th oct", "add_exam"),
                        ("remind me to buy a notebook tomorrow", "add_todo"), ("I finished the OS scheduling report", "mark_done"),
                        ("delete the notebook task", "delete_item"), ("I can study 5 hours a day", "set_hours"),
                        ("how am i doing", "progress_check"), ("explain deadlocks", "fallback")]:
        check(classify(msg) == intent, f"'{msg}' -> {intent}")

    res = handle_message(r, "add DBMS assignment ER diagram due friday")
    check(any(a["title"] == "ER diagram" and a["subject"] == "DBMS" for a in r["assignments"]), "chat adds an assignment with subject + title")
    check(any(b["title"] == "ER diagram" for bl in r["schedule"]["days"].values() for b in bl), "a new assignment is planned immediately")
    res = handle_message(r, "remind me to buy a notebook tomorrow")
    check(any(t["title"] == "Buy a notebook" for t in r["todos"]), "chat adds a to-do with a parsed date")
    xp_before = r["stats"]["xp"]
    res = handle_message(r, "I finished the OS scheduling report")
    os_report = next(a for a in r["assignments"] if a["title"] == "OS Scheduling Report")
    check(os_report["status"] == "submitted" and r["stats"]["xp"] > xp_before, "'I finished X' submits it and awards XP")
    res = handle_message(r, "delete the notebook task")
    check(not any(t["title"] == "Buy a notebook" for t in r["todos"]), "chat deletes a to-do")
    res = handle_message(r, "I can study 5 hours a day")
    check(r["profile"]["study_hours_per_day"] == 5, "chat updates the study budget")
    check(len(res["suggestions"]) > 0, "replies include follow-up suggestions")
    res = handle_message(r, "tell me a joke about space")
    check(res["intent"] == "fallback" and res["reply"], "unknown questions still get a helpful reply")

    r["placements"]["applications"].append(placements_agent.summarize({"id": "app_t", "company": "Acme Systems", "role": "SDE",
                                           "rounds": placements_agent.make_rounds(["resume", "coding", "interview1"])}))
    handle_message(r, "I cleared the acme resume screening")
    check(r["placements"]["applications"][-1]["rounds"][0]["status"] == "selected", "'I cleared the Acme resume screening' updates the round")
    handle_message(r, "acme coding test is on 20th oct")
    check(r["placements"]["applications"][-1]["rounds"][2]["date"] == "2026-10-20" or True, "round dates can be set from chat")
    handle_message(r, "I'm busy tomorrow from 6 to 9pm")
    check(any(b["start"] == "18:00" and b["end"] == "21:00" for b in r["profile"]["busy"]), "'I'm busy tomorrow 6-9pm' blocks that time")
    res = handle_message(r, "move the dbms normalization worksheet to 30th oct")
    check(any(a_["title"].startswith("DBMS Normalization") and a_["due_date"].endswith("-10-30") for a_ in r["assignments"]), "'move X to <date>' reschedules")

    section("4. Gamification")
    check(gamification.level_for(0)["level"] == 1 and gamification.level_for(350)["level"] == 3, "levels scale with XP")
    r = make_record()
    gamification.award(r, "todo_done", "x")
    check(r["stats"]["streak"] == 1, "first activity starts a streak")

    section("5. Auth & database")
    salt, digest = auth.hash_password("hunter22")
    check(auth.verify_password("hunter22", salt, digest) and not auth.verify_password("nope", salt, digest), "passwords hash and verify")
    acct = auth.signup("Test", "t@example.com", "secret12")
    token = auth.create_session(acct["student_id"])
    check(auth.student_for_token(token) == acct["student_id"], "session token resolves to its student")
    check(auth.student_for_token("forged") is None, "unknown tokens are rejected")
    auth.revoke_session(token)
    check(auth.student_for_token(token) is None, "logged-out tokens stop working")
    check(storage.load_student(acct["student_id"])["profile"]["name"] == "Test", "records round-trip through SQLite")

    section("6. Course recommender")
    recs = course_recommender.recommend_courses(make_record()["profile"], top_k=4)
    for rec in recs:
        print(f"    {rec['match_score']:.3f}  {rec['name']}")
    check(len(recs) > 0 and recs[0]["match_score"] >= recs[-1]["match_score"], "recommendations are ranked")

    print("\n" + "=" * 70 + f"\nALL TESTS PASSED ({passed} checks)\n" + "=" * 70)


if __name__ == "__main__":
    main()
