# Crescent · Student Planner

*Built by **Ayushi N***

A free student planner. It builds your study plan around your classes and deadlines,
updates it whenever something changes, tracks every placement round, and comes with an
assistant that can make changes for you. That assistant can use a cloud AI or one
running on your own computer.

## Quick start

You need **Python 3.10+** and **Node 18+**. Use two terminals.

**Terminal 1 — backend** (from `backend/`)

```bash
python -m venv venv
venv\Scripts\activate            # Windows   (macOS/Linux: source venv/bin/activate)
pip install -r ../requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend** (from `frontend/`)

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. Click **Try the live demo**, or create an account.

**Coming from the old version?** On first start, your old student files are copied into
the new database. The originals are moved to `backend/data/legacy_json_backup/`, and
nothing is deleted. To open an old account, go to **Log in → "Have an older account
with only a student ID?"**. Then add an email and password in Settings. After that,
the account can only be opened with your email and password.

## Connecting an AI model (optional)

Copy `backend/.env.example` to `backend/.env`, choose one of the options inside, and
restart the backend.

| Option | What to set | Notes |
|---|---|---|
| Groq (cloud, free tier) | `LLM_API_KEY=gsk_…` | Fast. Uses llama-3.3-70b |
| OpenAI / xAI / OpenRouter | `LLM_API_KEY=sk-…` / `xai-…` / `sk-or-…` | Detected from the key prefix |
| **Ollama (local)** | `LLM_PROVIDER=ollama` and `LLM_MODEL=llama3.1` | Private and offline. Run `ollama pull llama3.1` first |
| LM Studio, llama.cpp, vLLM | `LLM_BASE_URL=http://localhost:1234/v1` and `LLM_MODEL=…` | Any OpenAI-compatible server |

Settings → AI assistant shows which model is connected.

**How the AI is used:**
- **Chat.** The model reads your plan, deadlines and applications, then calls real
  actions:
  - add assignments, exams or to-dos
  - finish, delete or reschedule things
  - mark time as busy
  - change your study hours
  - track applications and update their rounds
- **Questions.** It answers study questions, for example "explain deadlocks" or "quiz
  me on normalization".
- **The plan itself** is always worked out by code, never by the AI, so it can't
  invent times or deadlines. The AI only writes the plan summary.
- **If no model is set, or a call fails,** the built-in rules handle everything. They
  understand phrases like "I'm busy tonight", "move X to monday" and "I cleared the
  Acme coding test".

> Tool calling works best with capable models (llama3.1 8B or larger, qwen2.5,
> gpt-4o-mini, llama-3.3-70b). If a local model doesn't support tools, Crescent
> notices and falls back to the rules for actions.

## What it does

**Planner** (`backend/app/planner_agent.py`)
- **Uses only your free time.** Sessions go into gaps between your **class timetable**
  and any **busy times**, from your start time to your "stop by" time.
- **Prioritises by urgency.** Closer deadlines, higher priority and exams count for
  more. Overdue work is scheduled first as catch-up time.
- **Prepares you for placement rounds.** When a round has a date, prep sessions go in
  before it (coding test → DSA practice, interviews → revision, and so on).
- **Sensible sessions.** Each session is focused, with breaks in between and a
  30-minute minimum. Today's sessions never start in the past.
- **Re-plans after every change.** This includes skipping a session and saying you're
  busy.
- **Learns from ticked-off sessions.** Ticking one off logs the hours, which shrinks
  that item's remaining time, and earns XP. Missed sessions show a notice the next day
  and are re-planned.
- **Warns you early** when something won't fully fit before its deadline.

**Placements** (`backend/app/placements_agent.py`)
- **Applications table.** One row per company, with these round columns: resume
  screening, aptitude, coding, GD, interview 1, interview 2, HR.
- **Round statuses.** Each round is Selected, Rejected, In progress, Upcoming (with a
  date), or **N/A** if that company doesn't hold it. A dash means the round was never
  reached.
- **Updating rounds.** Click a cell, or tell the assistant. Clearing a round starts the
  next one, and clearing them all marks the application as an offer.
- **Other features:** an eligibility checker with reasons, one-click Easy apply using
  each company's own rounds, resume insights, prep tasks and opportunities.

**Everything else**
- Assignments, projects, exams and subjects, each showing its next planned session
- To-dos you can type naturally ("call home on sunday")
- Courses, with recommendations based on your goals and skills
- **Weekly review:** planned vs. done, hours by subject, and what's falling behind
- **Calendar export** (.ics file) for Google, Outlook or Apple Calendar
- **Browser reminders** before sessions, deadlines and rounds, while the app is open
- **Dark mode,** XP, levels, streaks, a focus timer, and quick add (Ctrl/⌘ + K)
- **100% free.** No payments.

## Deploying (Vercel + Neon Postgres)

Both parts run on **Vercel** as two projects from this one repo. The data lives in a free **Neon Postgres** database, added through Vercel's Storage tab.

| Vercel project | Root Directory | Environment variables |
|---|---|---|
| `crescent-api` (FastAPI) | `backend` | `DATABASE_URL` (added by Neon), `CORS_ORIGINS=https://<web>.vercel.app`, optional `LLM_API_KEY` |
| `crescent-student-planner` (Next.js) | `frontend` | `NEXT_PUBLIC_API_BASE_URL=https://<api>.vercel.app` |

1. Import the repo into Vercel twice, setting the root directories above.
2. In the API project, open **Storage**, create a **Neon** database and connect it. `DATABASE_URL` is set automatically, and the tables are created on first request.
3. Set the variables in the table, then redeploy both projects.
4. Check that `https://<api>.vercel.app/health` returns `{"status":"ok"}`.

Every push to `main` redeploys both projects. Locally, the same code uses SQLite automatically, so there's no database setup on your computer.

## Security and data

- **Database.** Locally, data is stored in **SQLite** at `backend/data/crescent.db`, so
  there's nothing to install. When deployed, it uses **PostgreSQL** (Neon) whenever
  `DATABASE_URL` is set. All database code lives in `storage.py`.
- **Passwords** are hashed with PBKDF2-SHA256.
- **Logins** use random session tokens, and only a hash of each token is stored. Every
  `/students/{id}` request must carry the token for that same student. Logging out
  cancels the token.
- **CORS** only accepts requests from `CORS_ORIGINS` (by default, localhost:3000).
- **Before putting it on the public internet,** serve it over HTTPS, add rate limiting
  to the login routes, and back up the `.db` file.

## Tests

```bash
cd backend
python test_logic.py        # planner, timetable/busy, rounds, chatbot, auth, DB (57 checks)
python test_placements.py   # placements agent
```

Both use a temporary database, so your real data is never touched.

## Project layout

```
backend/app/
  main.py              API routes + session check
  storage.py           SQLite locally / PostgreSQL when deployed (+ old JSON import)
  auth.py              accounts, password hashing, session tokens
  planner_agent.py     scheduler (timetable, busy times, round prep)
  placements_agent.py  eligibility, Easy apply, per-company rounds
  chatbot_agent.py     assistant: AI tool-calling + rule-based fallback
  actions.py           every action the assistant can take (shared by both layers)
  llm.py               cloud + local LLM client (OpenAI-compatible, tool calling)
  dates.py             "friday", "24th oct", "in 3 days"…
  gamification.py      XP, levels (moon phases), streaks
  demo.py              demo account
frontend/
  app/                 pages: landing, login/signup, onboarding, dashboard, planner,
                       academics, to-dos, placements, review, courses, settings
  components/          design system, planner, placements table, chat, shell
  lib/                 API client, session, theme, reminders, utils
```

To rename the app, edit one file: `frontend/lib/brand.ts`.

## Author

Ayushi N
