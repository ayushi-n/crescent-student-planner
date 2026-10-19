"""
demo.py
-------
Creates a fully populated demo student so the app can be explored (or
presented) in one click, without typing in a whole semester first.
Dates are relative to today, so the demo always looks current.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta

from . import storage, placements_agent
from .services import replan


def create_demo_student() -> dict:
    today = date.today()

    def d(n: int) -> str:
        return (today + timedelta(days=n)).isoformat()

    record = storage.create_student()
    record["profile"].update({
        "name": "Aarav Nair",
        "degree": "B.Tech",
        "branch": "Computer Science",
        "year": 3,
        "semester": 5,
        "subjects": ["DBMS", "Operating Systems", "Machine Learning", "Computer Networks"],
        "goals": ["crack placements", "get into AI/ML", "improve CGPA"],
        "skills": ["python", "sql", "data structures", "git"],
        "study_hours_per_day": 3.5,
        "weekend_hours_per_day": 4,
        "preferred_start_hour": 16,
        "latest_end_hour": 22.5,
        "timetable": [
            {"id": "tt_1", "day": d, "start": "09:00", "end": "15:30", "label": "Classes"} for d in range(5)
        ] + [{"id": "tt_2", "day": 2, "start": "16:00", "end": "17:30", "label": "DBMS lab"}],
        "cgpa": 8.1,
        "active_backlogs": 0,
        "onboarded": True,
        "demo": True,
    })

    add = storage.append_item
    add(record, "assignments", {"title": "Normalization worksheet", "subject": "DBMS", "due_date": d(2), "status": "pending", "priority": "high", "estimated_hours": 3}, "asg")
    add(record, "assignments", {"title": "CPU scheduling simulation", "subject": "Operating Systems", "due_date": d(5), "status": "pending", "priority": "medium"}, "asg")
    add(record, "assignments", {"title": "Subnetting problem set", "subject": "Computer Networks", "due_date": d(-1), "status": "pending", "priority": "medium", "estimated_hours": 1.5}, "asg")
    add(record, "assignments", {"title": "ER diagram for library system", "subject": "DBMS", "due_date": d(-4), "status": "submitted", "priority": "medium"}, "asg")
    add(record, "assignments", {"title": "Linear regression notebook", "subject": "Machine Learning", "due_date": d(9), "status": "pending", "priority": "low"}, "asg")

    add(record, "projects", {"title": "Movie recommender mini-project", "subject": "Machine Learning", "description": "Collaborative filtering on MovieLens", "due_date": d(12), "status": "in_progress", "priority": "high"}, "proj")

    add(record, "exams", {"subject": "Operating Systems", "date": d(6), "type": "internal", "syllabus": "Processes, scheduling, deadlocks"}, "exam")
    add(record, "exams", {"subject": "DBMS", "date": d(15), "type": "external", "syllabus": "Full syllabus"}, "exam")

    add(record, "todos", {"title": "Email Prof. Menon about elective", "due_date": d(1), "priority": "medium", "done": False, "schedulable": True, "subject": "Personal"}, "todo")
    add(record, "todos", {"title": "Renew library books", "due_date": d(3), "priority": "low", "done": False, "schedulable": True, "subject": "Personal"}, "todo")
    add(record, "todos", {"title": "Buy graph paper", "due_date": None, "priority": "low", "done": True, "schedulable": True, "subject": "Personal"}, "todo")

    nested = storage.append_nested_item
    nested(record, "placements", "prep_tasks", {"title": "LeetCode: 5 graph problems", "due_date": d(4), "priority": "high", "done": False}, "prep")
    nested(record, "placements", "prep_tasks", {"title": "Update resume projects section", "due_date": d(7), "priority": "medium", "done": False}, "prep")
    nested(record, "placements", "opportunities", {"company": "Kestrel Labs", "role": "Backend Intern", "deadline": d(8), "status": "open"}, "opp")

    # applications at different stages, each with that company's own rounds
    def application(company, role, rounds, results, dates=None, applied=-10):
        app = nested(record, "placements", "applications", {
            "company": company, "role": role, "applied_date": d(applied),
            "rounds": placements_agent.make_rounds(rounds, first_in_progress=False), "source": "demo",
        }, "app")
        for key, status in results.items():
            placements_agent.update_round(app, key, status)
        for key, offset in (dates or {}).items():
            placements_agent.update_round(app, key, None, d(offset))
        placements_agent.summarize(app)

    application("Acme Systems", "Software Engineer Intern", ["resume", "aptitude", "coding", "interview1", "interview2", "hr"],
                {"resume": "selected", "aptitude": "selected", "coding": "in_progress"}, {"coding": 3, "interview1": 9}, applied=-14)
    application("Nimbus Cloud", "Cloud Engineer Intern", ["resume", "coding", "interview1"],
                {"resume": "selected", "coding": "rejected"}, applied=-20)
    application("Verity AI", "ML Intern", ["coding", "interview1"],
                {"coding": "selected", "interview1": "in_progress"}, {"interview1": 5}, applied=-12)
    application("Brightpath Analytics", "Data Analyst", ["resume", "aptitude", "gd", "interview1", "hr"],
                {"resume": "in_progress"}, applied=-2)
    application("Orbit Fintech", "Backend Developer", ["resume", "coding", "interview1", "hr"],
                {"resume": "selected", "coding": "selected", "interview1": "selected", "hr": "selected"}, applied=-30)

    add(record, "courses", {"name": "Machine Learning Foundations", "provider": "Coursera", "status": "ongoing", "progress": 45}, "crs")
    add(record, "courses", {"name": "SQL & Database Design", "provider": "Coursera", "status": "completed", "progress": 100}, "crs")

    now = datetime.now()
    record["stats"].update({
        "xp": 340,
        "streak": 4,
        "best_streak": 9,
        "last_active_date": (today - timedelta(days=1)).isoformat(),
        "completed_total": 12,
        "focus_minutes": 410,
        "activity": [
            {"text": "Submitted “ER diagram for library system”", "xp": 50, "at": (now - timedelta(days=1, hours=2)).isoformat(timespec="seconds")},
            {"text": "Finished a 50-minute focus session", "xp": 30, "at": (now - timedelta(days=1, hours=4)).isoformat(timespec="seconds")},
            {"text": "Completed course “SQL & Database Design”", "xp": 80, "at": (now - timedelta(days=3)).isoformat(timespec="seconds")},
        ],
    })

    replan(record)
    storage.save_student(record)
    return record
