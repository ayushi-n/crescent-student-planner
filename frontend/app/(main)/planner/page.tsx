"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Sparkles, AlertTriangle, SlidersHorizontal, Clock3, CalendarRange, Hourglass, CalendarPlus, Ban, GraduationCap } from "lucide-react";
import Link from "next/link";
import { getPlan, generatePlan, updateSettings, downloadCalendar } from "@/lib/api";
import { useDataChanged, openChat } from "@/lib/events";
import type { Schedule, ScheduleBlock } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import Spinner, { PageLoader } from "@/components/Spinner";
import PlanTimeline from "@/components/plan/PlanTimeline";
import WeekBars from "@/components/plan/WeekBars";
import BusyTimes from "@/components/plan/BusyTimes";
import Moon from "@/components/brand/Moon";
import { cn, formatHour, parseDay, relativeDay, todayKey } from "@/lib/utils";

const START_OPTIONS = [6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21];

export default function PlannerPage() {
  const { studentId, profile, refresh } = useStudent();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [day, setDay] = useState<string>(todayKey());
  const [replanning, setReplanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    study_hours_per_day: profile.study_hours_per_day ?? 3,
    weekend_hours_per_day: profile.weekend_hours_per_day ?? profile.study_hours_per_day ?? 3,
    preferred_start_hour: profile.preferred_start_hour ?? 18,
    session_minutes: profile.session_minutes ?? 60,
    latest_end_hour: profile.latest_end_hour ?? 23,
  });
  const [exporting, setExporting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const s = await getPlan(studentId);
    setSchedule(s);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);
  useDataChanged(load);

  async function replan() {
    setReplanning(true);
    try {
      setSchedule(await generatePlan(studentId));
    } finally {
      setReplanning(false);
    }
  }

  function change<K extends keyof typeof settings>(k: K, v: (typeof settings)[K]) {
    const next = { ...settings, [k]: v };
    setSettings(next);
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await updateSettings(studentId, next);
        await load();
        refresh();
      } finally {
        setSaving(false);
      }
    }, 450);
  }

  if (!schedule) return (<><TopBar title="Planner" /><PageLoader /></>);

  const dayKeys = Object.keys(schedule.days).sort();
  const blocks: ScheduleBlock[] = schedule.days[day] || [];
  const doneMin = blocks.filter((b) => b.done).reduce((s, b) => s + b.minutes, 0);
  const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
  const left = schedule.capacity_left?.[day] ?? 0;

  return (
    <div>
      <TopBar
        title="Planner"
        subtitle="Your next 7 days, rebuilt automatically whenever something changes"
        right={
          <>
            <Button variant="secondary" size="sm" disabled={exporting} onClick={async () => { setExporting(true); try { await downloadCalendar(studentId); } finally { setExporting(false); } }}>
              <CalendarPlus size={15} /> Export to calendar
            </Button>
            <Button variant="night" size="sm" onClick={replan} disabled={replanning}>
              <RefreshCw size={15} className={replanning ? "animate-spin" : ""} /> Re-plan
            </Button>
          </>
        }
      />
      <div className="space-y-6 p-4 md:p-8">
        {schedule.explanation && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="marble-night relative flex gap-4 overflow-hidden rounded-4xl p-5 text-mist-100 md:p-6">
            <span className="marble-sand grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-night-700"><Sparkles size={18} /></span>
            <p className="relative text-[15px] leading-relaxed">{schedule.explanation}</p>
            <Button variant="glass" size="sm" className="ml-auto hidden shrink-0 lg:inline-flex" onClick={replan} disabled={replanning}>
              <RefreshCw size={14} className={replanning ? "animate-spin" : ""} /> Re-plan
            </Button>
          </motion.div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader icon={<CalendarRange size={18} />} title="Your week" hint="Tap a day to see its sessions" />
              <WeekBars days={schedule.days} selected={day} onSelect={setDay} />
            </Card>

            <Card>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Moon value={totalMin ? doneMin / totalMin : 0} size={58} glow={false} showCraters={false} />
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-night-700">{relativeDay(day)}</h2>
                    <p className="text-sm text-mist-600">
                      {parseDay(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {Math.round(totalMin / 6) / 10}h planned
                      {left > 0.2 && ` · ${left}h free`}
                    </p>
                  </div>
                </div>
                <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-mist-100 p-1">
                  {dayKeys.map((k) => (
                    <button key={k} onClick={() => setDay(k)} className={cn("shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition", k === day ? "bg-white text-night-700 shadow-paper" : "text-dusk-600 hover:text-night-700")}>
                      {k === todayKey() ? "Today" : parseDay(k).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                    </button>
                  ))}
                </div>
              </div>
              {(schedule.busy?.[day]?.length ?? 0) > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-mist-600">Not available:</span>
                  {schedule.busy![day].map((b, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-mist-100 px-2.5 py-1 font-semibold text-dusk-700"><Ban size={11} /> {b.start}–{b.end === "23:59" ? "late" : b.end}</span>
                  ))}
                </div>
              )}
              <AnimatePresence mode="wait">
                <motion.div key={day} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                  {blocks.length === 0 ? (
                    <EmptyState
                      doodle="coffee"
                      title={day === todayKey() ? "Nothing left for today" : "A free day"}
                      description={day === todayKey() ? "Either everything is done or your study window has passed. The next sessions are lined up." : "No sessions needed — use it to rest or get ahead."}
                      action={<Button variant="secondary" onClick={() => openChat("What should I do now?")}>Ask what to do next</Button>}
                    />
                  ) : (
                    <PlanTimeline studentId={studentId} blocks={blocks} dateKey={day} onBlocksChange={(b) => setSchedule((s) => (s ? { ...s, days: { ...s.days, [day]: b } } : s))} />
                  )}
                </motion.div>
              </AnimatePresence>
            </Card>
          </div>

          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader icon={<SlidersHorizontal size={18} />} title="Study rhythm" hint="Changes re-plan your week instantly" right={saving ? <Spinner className="h-4 w-4 text-dusk-500" /> : null} />
              <div className="space-y-5">
                <Slider label="Weekdays" value={settings.study_hours_per_day} min={0.5} max={10} step={0.5} suffix="h / day" onChange={(v) => change("study_hours_per_day", v)} />
                <Slider label="Weekends" value={settings.weekend_hours_per_day} min={0} max={10} step={0.5} suffix="h / day" onChange={(v) => change("weekend_hours_per_day", v)} />
                <label className="block">
                  <span className="label">Start at</span>
                  <select className="input" value={settings.preferred_start_hour} onChange={(e) => change("preferred_start_hour", Number(e.target.value))}>
                    {Array.from(new Set([...START_OPTIONS, settings.preferred_start_hour])).sort((x, y) => x - y).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                  </select>
                </label>
                <div>
                  <span className="label">Session length</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[30, 45, 60, 90].map((m) => (
                      <button key={m} onClick={() => change("session_minutes", m)} className={cn("h-10 rounded-xl text-sm font-bold transition", settings.session_minutes === m ? "marble-night text-white" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200 hover:ring-dusk-300")}>
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="label">Stop by</span>
                  <select className="input" value={settings.latest_end_hour} onChange={(e) => change("latest_end_hour", Number(e.target.value))}>
                    {Array.from(new Set([20, 21, 22, 22.5, 23, 23.75, settings.latest_end_hour])).sort((x, y) => x - y).map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                  </select>
                </label>
              </div>
            </Card>

            <Card>
              <CardHeader icon={<Ban size={18} />} title="Busy times" hint="Sessions move out of these automatically" />
              <BusyTimes studentId={studentId} items={profile.busy || []} onChange={() => { refresh(); load(); }} />
            </Card>

            <Card className="flex items-center gap-4">
              <span className="marble-dusk grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"><GraduationCap size={19} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-night-700">Class timetable</p>
                <p className="text-sm text-mist-600">{(profile.timetable || []).length ? `${profile.timetable!.length} weekly class block${profile.timetable!.length > 1 ? "s" : ""} — sessions fit around them` : "Add your classes so sessions can use daytime gaps"}</p>
              </div>
              <Link href="/settings#timetable"><Button size="sm" variant="secondary">Edit</Button></Link>
            </Card>

            <div className="lg:hidden">
              <Button variant="secondary" className="w-full" disabled={exporting} onClick={async () => { setExporting(true); try { await downloadCalendar(studentId); } finally { setExporting(false); } }}>
                <CalendarPlus size={15} /> Export to Google / Outlook calendar
              </Button>
            </div>

            {(schedule.overdue?.length ?? 0) > 0 && (
              <Card className="!bg-ember-50/80">
                <CardHeader icon={<AlertTriangle size={18} />} title="Overdue" hint="Scheduled first so you can catch up" />
                <ul className="space-y-2">
                  {schedule.overdue!.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-ember-600">{o.title}</span>
                      {o.due_date && <Badge tone="danger">{relativeDay(o.due_date)}</Badge>}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {(schedule.at_risk?.length ?? 0) > 0 && (
              <Card>
                <CardHeader icon={<Hourglass size={18} />} title="Won't fully fit" hint="Not enough study time before these are due" />
                <ul className="space-y-2.5">
                  {schedule.at_risk!.map((a) => (
                    <li key={a.ref_id} className="rounded-2xl bg-sand-50 p-3 ring-1 ring-sand-200">
                      <p className="text-sm font-semibold text-night-700">{a.title}</p>
                      <p className="text-xs text-sand-800">Needs ~{a.remaining_hours}h more before {relativeDay(a.due_date).toLowerCase()}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-mist-600">Raise your daily hours above, or start earlier, and the plan will rebalance.</p>
              </Card>
            )}

            {(schedule.unscheduled?.length ?? 0) > 0 && (
              <Card>
                <CardHeader icon={<Clock3 size={18} />} title="Continues next week" hint="Work with later deadlines" />
                <div className="flex flex-wrap gap-2">
                  {schedule.unscheduled!.map((u) => <Badge key={u.ref_id} tone="neutral">{u.title} · {u.remaining_hours}h</Badge>)}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="text-sm font-bold text-night-700">{value}<span className="font-medium text-mist-600"> {suffix}</span></span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-dusk-500" aria-label={label} />
    </div>
  );
}
