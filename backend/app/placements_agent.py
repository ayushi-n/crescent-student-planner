"""
placements_agent.py
--------------------
The Placements Agent:

  * check_eligibility / build_eligibility_report -- rule engine (CGPA, branch,
    backlogs, required skills) over the job catalog, with reasons.
  * easy_apply -- one-click application, pre-filled with the rounds that
    company actually conducts (others are marked N/A).
  * Per-company recruitment rounds -- every application tracks the same
    round types (resume screening, aptitude, coding, group discussion,
    interview 1, interview 2, HR). Each round is one of:
        na          the company doesn't conduct this round
        pending     not reached yet / scheduled
        in_progress happening now (e.g. resume screening under review)
        selected    cleared
        rejected    not cleared -> the application ends here
    Rounds can carry a date; dated upcoming rounds are handed to the Planner,
    which schedules targeted prep sessions before them.
  * resume_suggestions -- aggregates skill gaps into prioritised advice.
"""
from __future__ import annotations
import json
import os
from datetime import datetime
from typing import Optional

from . import course_recommender

CATALOG_PATH = os.path.join(os.path.dirname(__file__), "job_catalog.json")

with open(CATALOG_PATH, "r") as f:
    _JOBS = json.load(f)["jobs"]

ROUND_TYPES: list[tuple[str, str]] = [
    ("resume", "Resume screening"),
    ("aptitude", "Aptitude test"),
    ("coding", "Coding test"),
    ("gd", "Group discussion"),
    ("interview1", "Interview 1"),
    ("interview2", "Interview 2"),
    ("hr", "HR interview"),
]
ROUND_LABEL = dict(ROUND_TYPES)
ROUND_KEYS = [k for k, _ in ROUND_TYPES]
ROUND_STATUSES = ("na", "pending", "in_progress", "selected", "rejected")
DEFAULT_ROUNDS = ["resume", "coding", "interview1", "interview2", "hr"]
# Prep the planner schedules before a dated round (hours). Resume screening needs none.
PREP_HOURS = {"aptitude": 2.0, "coding": 4.0, "gd": 1.5, "interview1": 3.0, "interview2": 3.0, "hr": 1.5}
PREP_FOCUS = {
    "aptitude": "quant, logical reasoning & verbal practice",
    "coding": "DSA problems in the company's usual pattern",
    "gd": "current topics & structuring arguments",
    "interview1": "core CS + DSA revision, past interview questions",
    "interview2": "project deep-dive & system design basics",
    "hr": "your story, strengths, why this company",
}

# kept for older API clients
PIPELINE_STAGES = [label for _, label in ROUND_TYPES]


def make_rounds(conducted: list[str], first_in_progress: bool = True) -> list[dict]:
    conducted_set = set(conducted or DEFAULT_ROUNDS)
    rounds = []
    for key in ROUND_KEYS:
        rounds.append({"key": key, "label": ROUND_LABEL[key], "status": "pending" if key in conducted_set else "na", "date": None})
    if first_in_progress:
        for r in rounds:
            if r["status"] == "pending":
                r["status"] = "in_progress"
                break
    return rounds


def summarize(app: dict) -> dict:
    """Derives overall result + current round from the rounds, and keeps `status` readable."""
    rounds = app.get("rounds") or []
    active = [r for r in rounds if r["status"] != "na"]
    rejected = next((r for r in active if r["status"] == "rejected"), None)
    current = next((r for r in active if r["status"] in ("pending", "in_progress")), None)
    if rejected:
        result, status = "rejected", f"Rejected at {rejected['label']}"
    elif active and all(r["status"] == "selected" for r in active):
        result, status = "offer", "Selected 🎉"
    elif current:
        result = "in_progress"
        status = f"{current['label']} — {'in progress' if current['status'] == 'in_progress' else 'upcoming'}"
    else:
        result, status = "in_progress", "Applied"
    app["result"] = result
    app["status"] = status
    app["current_round"] = current["key"] if current and not rejected else None
    app["rejected"] = result == "rejected"
    return app


def migrate_application(app: dict) -> dict:
    """Converts applications from the old single-pipeline format (idempotent)."""
    if app.get("rounds"):
        # make sure every round type is present (catalog may have grown)
        have = {r["key"] for r in app["rounds"]}
        for key in ROUND_KEYS:
            if key not in have:
                app["rounds"].append({"key": key, "label": ROUND_LABEL[key], "status": "na", "date": None})
        app["rounds"].sort(key=lambda r: ROUND_KEYS.index(r["key"]) if r["key"] in ROUND_KEYS else 99)
        for r in app["rounds"]:
            r["label"] = ROUND_LABEL.get(r["key"], r.get("label", r["key"]))
        return summarize(app)

    rounds = make_rounds(DEFAULT_ROUNDS, first_in_progress=False)
    active = [r for r in rounds if r["status"] != "na"]
    # old pipeline: Applied, Shortlisted, OA, Interview 1, Interview 2, HR, Selected
    old_to_active = {0: 0, 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}
    if "pipeline_stage_index" in app:
        reached = old_to_active.get(int(app.get("pipeline_stage_index") or 0), 0)
    else:  # manually logged: applied / shortlisted / interview / offer / rejected
        reached = {"applied": 0, "shortlisted": 1, "interview": 2, "offer": 5}.get(str(app.get("status", "applied")).lower(), 0)
    for i, r in enumerate(active):
        if i < reached:
            r["status"] = "selected"
        elif i == reached and reached < len(active):
            r["status"] = "rejected" if app.get("rejected") or str(app.get("status", "")).lower() == "rejected" else "in_progress"
    app["rounds"] = rounds
    app.pop("pipeline_stage_index", None)
    app.pop("rejected_at_stage", None)
    return summarize(app)


def update_round(app: dict, key: str, status: Optional[str] = None, date: Optional[str] = "__keep__") -> dict:
    if key not in ROUND_KEYS:
        raise ValueError(f"Unknown round: {key}")
    if status is not None and status not in ROUND_STATUSES:
        raise ValueError(f"Unknown status: {status}")
    migrate_application(app)
    rounds = app["rounds"]
    idx = ROUND_KEYS.index(key)
    r = rounds[idx]
    if status is not None:
        r["status"] = status
        if status == "selected":
            # the next round the company conducts is now underway
            nxt = next((x for x in rounds[idx + 1:] if x["status"] != "na"), None)
            if nxt and nxt["status"] == "pending":
                nxt["status"] = "in_progress"
        if status == "na":
            r["date"] = None
    if date != "__keep__":
        r["date"] = date or None
    app["updated_at"] = datetime.now().isoformat()
    return summarize(app)


def upcoming_rounds(record: dict, today: Optional[str] = None) -> list[dict]:
    today = today or datetime.now().date().isoformat()
    out = []
    for app in record.get("placements", {}).get("applications", []):
        migrate_application(app)
        if app.get("result") != "in_progress":
            continue
        for r in app["rounds"]:
            if r["status"] in ("pending", "in_progress") and r.get("date") and r["date"] >= today:
                out.append({"app_id": app["id"], "company": app["company"], "role": app["role"],
                            "key": r["key"], "label": r["label"], "date": r["date"], "status": r["status"]})
    out.sort(key=lambda x: x["date"])
    return out


def get_jobs() -> list[dict]:
    return _JOBS


def _get_job(job_id: str) -> Optional[dict]:
    for j in _JOBS:
        if j["id"] == job_id:
            return j
    return None


# --------------------------------------------------------------------------
# 1 & 2. Eligibility
# --------------------------------------------------------------------------

def check_eligibility(profile: dict, job: dict) -> tuple[bool, list[str]]:
    """Returns (is_eligible, [reasons for ineligibility]). Empty reasons list means eligible."""
    reasons: list[str] = []

    cgpa = profile.get("cgpa", 0) or 0
    if cgpa < job["min_cgpa"]:
        reasons.append(f"CGPA {cgpa:.1f} is below the cutoff of {job['min_cgpa']:.1f}")

    allowed = job.get("allowed_branches", ["Any"])
    branch = (profile.get("branch") or "").strip()
    if "Any" not in allowed and branch not in allowed:
        reasons.append(f"Branch \"{branch or 'not set'}\" is not eligible (allowed: {', '.join(allowed)})")

    backlogs = profile.get("active_backlogs", 0) or 0
    if backlogs > job.get("max_backlogs", 0):
        reasons.append(f"{backlogs} active backlog(s) exceed the allowed limit of {job['max_backlogs']}")

    student_skills = {s.lower().strip() for s in (profile.get("skills") or [])}
    required = [s.lower().strip() for s in job.get("required_skills", [])]
    missing = [s for s in required if s not in student_skills]
    if required and len(missing) == len(required):
        reasons.append(f"Missing all required skills: {', '.join(job['required_skills'])}")
    elif missing:
        reasons.append(f"Missing some required skills: {', '.join(missing)}")

    return (len(reasons) == 0, reasons)


def build_eligibility_report(profile: dict) -> dict:
    eligible, not_eligible = [], []
    for job in _JOBS:
        is_eligible, reasons = check_eligibility(profile, job)
        entry = {**job, "eligible": is_eligible, "reasons": reasons}
        (eligible if is_eligible else not_eligible).append(entry)
    return {"eligible": eligible, "not_eligible": not_eligible}


# --------------------------------------------------------------------------
# 3. Easy Apply
# --------------------------------------------------------------------------

def find_application_by_job(record: dict, job_id: str) -> Optional[dict]:
    for app in record["placements"]["applications"]:
        if app.get("job_id") == job_id:
            return app
    return None


def easy_apply(record: dict, job_id: str) -> dict:
    """
    Creates (or returns the existing) application for this job, auto-filled
    from the student's current profile. Raises ValueError if the job doesn't
    exist or the student is not eligible.
    """
    job = _get_job(job_id)
    if job is None:
        raise ValueError(f"Unknown job_id: {job_id}")

    existing = find_application_by_job(record, job_id)
    if existing is not None:
        return existing

    is_eligible, reasons = check_eligibility(record["profile"], job)
    if not is_eligible:
        raise ValueError(f"Not eligible for this role: {'; '.join(reasons)}")

    from . import storage  # local import to avoid a circular import with main.py at module load time
    application = storage.append_nested_item(
        record, "placements", "applications",
        {
            "job_id": job_id,
            "company": job["company"],
            "role": job["role"],
            "applied_date": datetime.now().date().isoformat(),
            "rounds": make_rounds(job.get("rounds") or DEFAULT_ROUNDS),
            "source": "easy_apply",
        },
        id_prefix="app",
    )
    return summarize(application)


def find_application(record: dict, application_id: str) -> Optional[dict]:
    return next((a for a in record["placements"]["applications"] if a["id"] == application_id), None)


# --------------------------------------------------------------------------
# 4. Pipeline progression
# --------------------------------------------------------------------------

def advance_application(record: dict, application_id: str, action: str) -> dict:
    """
    Shortcut used by the chatbot and older clients: "advance" marks the current
    round selected (and starts the next one); "reject" marks it rejected.
    """
    app = find_application(record, application_id)
    if app is None:
        raise ValueError(f"Unknown application_id: {application_id}")
    migrate_application(app)
    if app["result"] != "in_progress" or not app.get("current_round"):
        return app
    if action == "advance":
        return update_round(app, app["current_round"], "selected")
    if action == "reject":
        return update_round(app, app["current_round"], "rejected")
    raise ValueError(f"Unknown action: {action}")


# --------------------------------------------------------------------------
# 5. Resume improvement suggestions
# --------------------------------------------------------------------------

def resume_suggestions(record: dict) -> dict:
    profile = record["profile"]
    report = build_eligibility_report(profile)

    # count how many missed-out jobs each missing skill would have unlocked
    skill_gap_counts: dict[str, int] = {}
    cgpa_blocked_count = 0
    backlog_blocked_count = 0

    for job in report["not_eligible"]:
        for reason in job["reasons"]:
            if reason.startswith("CGPA"):
                cgpa_blocked_count += 1
            elif "backlog" in reason:
                backlog_blocked_count += 1

        student_skills = {s.lower().strip() for s in (profile.get("skills") or [])}
        for skill in job.get("required_skills", []):
            if skill.lower().strip() not in student_skills:
                skill_gap_counts[skill] = skill_gap_counts.get(skill, 0) + 1

    # also factor in rejected applications -- these are skills that mattered
    # enough to get through screening but not the interview loop
    for app in record["placements"]["applications"]:
        if app.get("rejected"):
            job = _get_job(app.get("job_id", ""))
            if job:
                student_skills = {s.lower().strip() for s in (profile.get("skills") or [])}
                for skill in job.get("required_skills", []):
                    if skill.lower().strip() not in student_skills:
                        skill_gap_counts[skill] = skill_gap_counts.get(skill, 0) + 2  # weighted higher

    top_gaps = sorted(skill_gap_counts.items(), key=lambda kv: kv[1], reverse=True)[:6]

    suggestions: list[str] = []
    if top_gaps:
        skill_list = ", ".join(s for s, _ in top_gaps[:3])
        suggestions.append(
            f"Learning {skill_list} would unlock the most currently-closed roles for you."
        )
    if cgpa_blocked_count > 0:
        suggestions.append(
            f"{cgpa_blocked_count} role(s) are out of reach due to CGPA cutoffs -- "
            f"raising your CGPA even slightly would open these up."
        )
    if backlog_blocked_count > 0:
        suggestions.append(
            f"{backlog_blocked_count} role(s) require fewer active backlogs than you currently have -- "
            f"clearing backlogs should be a priority before placement season."
        )
    if not suggestions:
        suggestions.append("You're eligible for every role in the current catalog on paper -- focus on interview prep next.")

    recommended_courses = []
    if top_gaps:
        pseudo_profile = {
            "branch": profile.get("branch", ""),
            "goals": profile.get("goals", []),
            "skills": [s for s, _ in top_gaps],  # search FOR courses that teach the missing skills
        }
        recommended_courses = course_recommender.recommend_courses(pseudo_profile, top_k=4)

    return {
        "top_skill_gaps": [{"skill": s, "roles_blocked": c} for s, c in top_gaps],
        "suggestions": suggestions,
        "recommended_courses": recommended_courses,
        "eligible_count": len(report["eligible"]),
        "not_eligible_count": len(report["not_eligible"]),
    }
