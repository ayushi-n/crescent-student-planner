"""
test_placements.py
------------------
Tests for the Placements Agent (eligibility, easy apply, per-company rounds,
resume suggestions). Uses a throwaway database.

    python test_placements.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")

from app import storage, placements_agent  # noqa: E402


def main():
    record = storage.create_student()
    record["profile"].update({"name": "Divya Nair", "branch": "Computer Science", "cgpa": 7.2, "active_backlogs": 0,
                              "skills": ["python", "sql", "data structures"], "goals": ["crack placements"]})

    print("TEST 1: Eligibility report")
    report = placements_agent.build_eligibility_report(record["profile"])
    print(f"  eligible {len(report['eligible'])}, not eligible {len(report['not_eligible'])}")
    assert report["eligible"] and report["not_eligible"]
    verity = next(j for j in report["not_eligible"] if j["id"] == "job_004")
    assert any("CGPA" in r for r in verity["reasons"])

    print("TEST 2: Easy apply uses the company's own rounds")
    job = report["eligible"][0]
    app = placements_agent.easy_apply(record, job["id"])
    conducted = [r["key"] for r in app["rounds"] if r["status"] != "na"]
    print(f"  {app['company']}: {conducted} -> {app['status']}")
    assert conducted == job["rounds"], "rounds should match the catalog entry"
    assert app["result"] == "in_progress" and app["rounds"][[r["key"] for r in app["rounds"]].index(job["rounds"][0])]["status"] == "in_progress"
    assert placements_agent.easy_apply(record, job["id"])["id"] == app["id"], "applying twice returns the same application"

    print("TEST 3: Not eligible -> refused")
    try:
        placements_agent.easy_apply(record, "job_004")
        raise AssertionError("should have refused")
    except ValueError as e:
        print(f"  refused: {str(e)[:70]}")

    print("TEST 4: Rounds progress, reject ends the application")
    first = app["current_round"]
    placements_agent.advance_application(record, app["id"], "advance")
    assert app["current_round"] != first
    second = app["current_round"]
    placements_agent.advance_application(record, app["id"], "reject")
    assert app["result"] == "rejected" and app["status"].startswith("Rejected at")
    print(f"  {app['status']}")
    noop = placements_agent.advance_application(record, app["id"], "advance")
    assert noop["result"] == "rejected", "rejected applications don't advance"

    print("TEST 5: Dated rounds feed the planner")
    app2 = storage.append_nested_item(record, "placements", "applications",
                                      {"company": "Z", "role": "R", "rounds": placements_agent.make_rounds(["coding", "hr"])}, "app")
    placements_agent.update_round(app2, "coding", date="2099-01-10")
    up = placements_agent.upcoming_rounds(record, "2099-01-01")
    assert up and up[0]["key"] == "coding"
    print(f"  upcoming: {up[0]['company']} {up[0]['label']} on {up[0]['date']}")

    print("TEST 6: Resume suggestions")
    sug = placements_agent.resume_suggestions(record)
    assert sug["suggestions"]
    print(f"  {sug['suggestions'][0][:80]}")
    print("\nALL PLACEMENTS AGENT TESTS PASSED")


if __name__ == "__main__":
    main()
