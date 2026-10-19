"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RefreshCw, Sparkles, AlertTriangle, Clock3, ClipboardList, CalendarDays, ListChecks, FolderKanban, Flame, Trophy, Briefcase, GraduationCap, MessageCircle, X, CalendarClock, Ban } from "lucide-react";
import { getDashboard, getPlan, generatePlan, dismissNotice } from "@/lib/api";
import { useDataChanged, openChat } from "@/lib/events";
import type { DashboardData, Schedule, ScheduleBlock } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import { PageLoader } from "@/components/Spinner";
import Moon from "@/components/brand/Moon";
import { DoodleField } from "@/components/brand/Doodles";
import PlanTimeline from "@/components/plan/PlanTimeline";
import FocusTimer from "@/components/plan/FocusTimer";
import WeekBars from "@/components/plan/WeekBars";
import { cn, firstName, greeting, groupByBucket, BUCKET_META, relativeDay, todayKey, urgencyLabel, CATEGORY_META } from "@/lib/utils";

const TYPE_ICON: Record<string, string> = { assignment: "📝", exam: "📚", project: "🛠️", todo: "✅", placement: "💼" };

export default function DashboardPage() {
  const { studentId } = useStudent();
  const [data, setData] = useState<DashboardData | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [replanning, setReplanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([getDashboard(studentId), getPlan(studentId)]);
      setData(d);
      setSchedule(s);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);
  useDataChanged(load);

  async function replan() {
    setReplanning(true);
    try {
      await generatePlan(studentId);
      await load();
    } finally {
      setReplanning(false);
    }
  }

  const today = data?.today_plan ?? [];
  const doneCount = today.filter((b) => b.done).length;
  const progress = today.length ? doneCount / today.length : 0;
  const next = today.find((b) => !b.done);
  const groups = useMemo(() => (data ? groupByBucket(data.upcoming_deadlines, (d) => d.date) : null), [data]);

  function onBlocksChange(blocks: ScheduleBlock[]) {
    setData((d) => (d ? { ...d, today_plan: blocks } : d));
  }

  if (error && !data) {
    return (
      <>
        <TopBar title="Dashboard" />
        <div className="p-8"><Card><EmptyState doodle="cloud" title="Couldn't load your dashboard" description={error} action={<Button onClick={load}>Try again</Button>} /></Card></div>
      </>
    );
  }
  if (!data) return (<><TopBar title="Dashboard" /><PageLoader /></>);

  const { profile, counts, stats } = data;
  const minutesLeft = today.filter((b) => !b.done).reduce((s, b) => s + b.minutes, 0);

  return (
    <div>
      <TopBar title="Dashboard" subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} />

      <div className="space-y-6 p-4 md:p-8">
        {/* ---------- hero */}
        <section className="marble-night relative overflow-hidden rounded-4xl px-6 py-8 text-white md:px-10 md:py-10">
          <DoodleField count={12} seed={8} tone="dark" />
          <svg className="pointer-events-none absolute bottom-0 left-0 w-full" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 70 C200 40 360 90 560 60 C760 30 960 80 1200 50 L1200 120 L0 120Z" fill="#30415A" opacity=".55" />
            <path d="M0 100 C220 80 420 112 640 92 C860 72 1020 104 1200 88 L1200 120 L0 120Z" fill="#4B6382" opacity=".45" />
          </svg>
          <div className="relative flex flex-col-reverse items-start gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-sand-300">{greeting()},</p>
              <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
                {firstName(profile.name)}.
              </motion.h2>
              <p className="mt-3 text-lg leading-relaxed text-mist-200">
                {today.length === 0
                  ? "Nothing planned for today. Add an assignment or exam and your plan builds itself."
                  : next
                  ? <>Next up: <strong className="text-white">{next.title}</strong> at {next.start}. {Math.round(minutesLeft / 6) / 10}h left today.</>
                  : "Today's plan is done. The moon is full — rest well. 🌕"}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {next && (
                  <a href="#focus"><Button variant="gold"><Clock3 size={16} /> Start a focus session</Button></a>
                )}
                <Button variant="glass" onClick={replan} disabled={replanning}>
                  <RefreshCw size={16} className={replanning ? "animate-spin" : ""} /> {replanning ? "Re-planning…" : "Re-plan"}
                </Button>
                <Button variant="glass" onClick={() => openChat("What should I do now?")}>
                  <MessageCircle size={16} /> Ask the assistant
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <Moon value={progress} size={150} />
              <div>
                <p className="font-display text-4xl font-semibold tabular-nums">{doneCount}<span className="text-mist-400">/{today.length}</span></p>
                <p className="text-sm text-mist-300">sessions done today</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-sand-300"><Flame size={15} /> {stats.streak}-day streak</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- missed sessions (one-time) */}
        {data.notices?.missed && data.notices.missed.items.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-3xl bg-dusk-50 p-4 ring-1 ring-dusk-100">
            <CalendarClock className="mt-0.5 shrink-0 text-dusk-500" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-night-700">You missed {data.notices.missed.items.length} session{data.notices.missed.items.length > 1 ? "s" : ""} recently — no stress.</p>
              <p className="mt-0.5 text-sm text-dusk-700">The unfinished work ({Array.from(new Set(data.notices.missed.items.map((m) => m.title))).slice(0, 3).join(", ")}) has already been moved into this week's plan.</p>
            </div>
            <button aria-label="Dismiss" onClick={async () => { await dismissNotice(studentId, "missed"); setData((d) => (d ? { ...d, notices: {} } : d)); }} className="rounded-lg p-1 text-mist-500 hover:bg-white hover:text-night-700"><X size={16} /></button>
          </motion.div>
        )}

        {/* ---------- alerts */}
        {(data.overdue.length > 0 || data.at_risk.length > 0) && (
          <div className={cn("grid gap-3", data.overdue.length > 0 && data.at_risk.length > 0 && "md:grid-cols-2")}>
            {data.overdue.length > 0 && (
              <div className="flex items-start gap-3 rounded-3xl bg-ember-50 p-4 ring-1 ring-ember-100">
                <AlertTriangle className="mt-0.5 shrink-0 text-ember-500" size={20} />
                <div>
                  <p className="font-semibold text-ember-600">{data.overdue.length} overdue — catch-up time is in today's plan</p>
                  <p className="mt-0.5 text-sm text-ember-600/80">{data.overdue.map((o) => o.title).join(", ")}</p>
                </div>
              </div>
            )}
            {data.at_risk.length > 0 && (
              <div className="flex items-start gap-3 rounded-3xl bg-sand-100 p-4 ring-1 ring-sand-200">
                <Clock3 className="mt-0.5 shrink-0 text-sand-700" size={20} />
                <div>
                  <p className="font-semibold text-sand-900">{data.at_risk.length} item{data.at_risk.length > 1 ? "s" : ""} won't fully fit before the deadline</p>
                  <p className="mt-0.5 text-sm text-sand-800">
                    {data.at_risk.slice(0, 2).map((a) => `${a.title} (${a.remaining_hours}h short)`).join(", ")}.{" "}
                    <Link href="/settings" className="font-semibold underline underline-offset-2">Add study time</Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- quick stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { href: "/academics", label: "Assignments due", value: counts.pending_assignments, icon: ClipboardList, cls: "bg-white" },
            { href: "/academics?tab=exams", label: "Upcoming exams", value: counts.upcoming_exams, icon: CalendarDays, cls: "bg-white" },
            { href: "/todos", label: "Open to-dos", value: counts.pending_todos, icon: ListChecks, cls: "bg-white" },
            { href: "/academics?tab=projects", label: "Active projects", value: counts.active_projects, icon: FolderKanban, cls: "bg-white" },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
              <Link href={s.href} className="group flex items-center gap-4 rounded-3xl bg-white/85 p-4 shadow-paper ring-1 ring-white transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className={cn("grid h-12 w-12 place-items-center rounded-2xl transition group-hover:rotate-6", i === 0 ? "marble-dusk text-white" : i === 1 ? "marble-night text-sand-300" : i === 2 ? "marble-mist text-night-700" : "marble-sand text-night-700")}>
                  <s.icon size={21} />
                </span>
                <div>
                  <p className="font-display text-3xl font-semibold tabular-nums leading-none text-night-700">{s.value}</p>
                  <p className="mt-1 text-[13px] font-medium text-mist-600">{s.label}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* ---------- today + focus */}
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader
              icon={<Clock3 size={18} />}
              title="Today's plan"
              hint={today.length ? "Tick sessions off as you finish them" : undefined}
              right={<Link href="/planner"><Button size="sm" variant="secondary">Full week</Button></Link>}
            />
            {today.length === 0 ? (
              <EmptyState
                doodle="moon"
                title="A free day"
                description="Add an assignment, exam or task and it will be scheduled automatically."
                action={<Button variant="night" onClick={() => openChat("Add an assignment")}>Add something</Button>}
              />
            ) : (
              <PlanTimeline studentId={studentId} blocks={today} dateKey={todayKey()} onBlocksChange={onBlocksChange} />
            )}
            {data.busy_today.length > 0 && (
              <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-mist-600">
                <Ban size={12} /> Planned around:
                {data.busy_today.map((b, i) => <span key={i} className="rounded-full bg-mist-100 px-2 py-0.5 font-semibold text-dusk-700">{b.start}–{b.end === "23:59" ? "late" : b.end}</span>)}
              </p>
            )}
            {data.schedule_explanation && (
              <div className="mt-5 flex gap-3 rounded-3xl bg-dusk-50 p-4 text-sm leading-relaxed text-dusk-800 ring-1 ring-dusk-100">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-sand-600" />
                <p>{data.schedule_explanation}</p>
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <Card id="focus" className="scroll-mt-24">
              <CardHeader icon={<Clock3 size={18} />} title="Focus timer" hint="Finished sessions earn XP" />
              <FocusTimer studentId={studentId} focusOn={next?.title} />
            </Card>
          </div>
        </div>

        {/* ---------- week + deadlines */}
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader icon={<CalendarDays size={18} />} title="This week" hint="Planned study hours by type" right={<Link href="/planner"><Button size="sm" variant="ghost">Open planner</Button></Link>} />
            {schedule && Object.keys(schedule.days).length > 0 ? <WeekBars days={schedule.days} /> : <EmptyState title="No plan yet" doodle="pencil" />}
          </Card>

          <Card>
            <CardHeader icon={<AlertTriangle size={18} />} title="Coming up" hint="Deadlines and exams" />
            {data.upcoming_deadlines.length === 0 ? (
              <EmptyState doodle="check" title="Nothing due" description="You're all caught up." />
            ) : (
              <div className="max-h-[22rem] space-y-4 overflow-y-auto pr-1">
                {(["overdue", "today", "this_week", "later"] as const).map((bucket) =>
                  groups && groups[bucket].length > 0 ? (
                    <div key={bucket}>
                      <p className={cn("mb-2 text-xs font-bold", bucket === "overdue" ? "text-ember-600" : "text-mist-600")}>{BUCKET_META[bucket].label}</p>
                      <div className="space-y-1.5">
                        {groups[bucket].map((d) => {
                          const u = urgencyLabel(d.date);
                          return (
                            <div key={d.type + d.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-mist-50">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mist-50 text-base">{TYPE_ICON[d.type] || "•"}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-night-700">{d.title}</p>
                                <p className="text-xs text-mist-600">{relativeDay(d.date)}{d.subject && d.subject !== "Personal" ? ` · ${d.subject}` : ""}</p>
                              </div>
                              <Badge tone={u.tone}>{u.label}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ---------- progress + more */}
        <div id="progress" className="grid scroll-mt-24 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader icon={<Trophy size={18} />} title={`Level ${stats.level} · ${stats.title}`} hint={`${stats.xp} XP total · ${stats.xp_for_next - stats.xp_into_level} XP to level ${stats.level + 1}`} />
            <div className="h-3 overflow-hidden rounded-full bg-mist-100">
              <motion.div className="marble-sand h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.max(3, stats.progress * 100)}%` }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[
                { v: stats.streak, l: "day streak", s: `best ${stats.best_streak}` },
                { v: stats.completed_total, l: "things finished", s: "all time" },
                { v: Math.round(stats.focus_minutes / 6) / 10, l: "focus hours", s: "logged" },
              ].map((x) => (
                <div key={x.l} className="rounded-3xl bg-mist-50 p-4 ring-1 ring-mist-100">
                  <p className="font-display text-3xl font-semibold text-night-700">{x.v}</p>
                  <p className="text-xs font-semibold text-dusk-700">{x.l}</p>
                  <p className="text-[11px] text-mist-500">{x.s}</p>
                </div>
              ))}
            </div>
            {stats.activity.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-xs font-bold text-mist-600">Recent wins</p>
                <ul className="space-y-1.5">
                  {stats.activity.slice(0, 5).map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-dusk-800">{a.text}</span>
                      <span className={cn("shrink-0 font-bold tabular-nums", a.xp > 0 ? "text-sand-700" : "text-mist-500")}>{a.xp > 0 ? `+${a.xp}` : a.xp} XP</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <Link href="/placements" className="block">
              <Card interactive className="marble-dusk !border-0 text-white">
                <div className="flex items-center justify-between">
                  <Briefcase className="text-sand-200" />
                  <span className="text-xs font-semibold text-mist-100">{counts.applications} application{counts.applications !== 1 ? "s" : ""}</span>
                </div>
                <p className="mt-3 font-display text-xl font-semibold">Upcoming rounds</p>
                {data.upcoming_rounds.length === 0 ? (
                  <p className="mt-1 text-sm text-mist-100">No dated rounds. Add dates in the applications table and prep gets planned.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.upcoming_rounds.slice(0, 3).map((r) => (
                      <li key={r.app_id + r.key} className="flex items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate"><strong>{r.company}</strong> · {r.label}</span>
                        <span className="shrink-0 rounded-full bg-sand-300 px-2 py-0.5 text-[11px] font-bold text-night-700">{relativeDay(r.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Link>
            <Link href="/courses" className="block">
              <Card interactive>
                <GraduationCap className="text-dusk-500" />
                <p className="mt-3 font-display text-xl font-semibold text-night-700">Courses</p>
                {data.courses.length === 0 ? (
                  <p className="mt-1 text-sm text-mist-600">See courses picked for your goals.</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {data.courses.slice(0, 3).map((c) => (
                      <div key={c.id}>
                        <div className="flex justify-between text-xs font-semibold"><span className="truncate text-dusk-800">{c.name}</span><span className="text-mist-600">{Math.round(c.status === "completed" ? 100 : c.progress)}%</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-mist-100"><div className="h-full rounded-full bg-dusk-500" style={{ width: `${c.status === "completed" ? 100 : c.progress}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
