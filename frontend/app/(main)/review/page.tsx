"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, BookOpen, AlertTriangle, Trophy, Flame, Clock3, Sparkles } from "lucide-react";
import { getReview } from "@/lib/api";
import { useDataChanged, openChat } from "@/lib/events";
import type { Review } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import { PageLoader } from "@/components/Spinner";
import Moon from "@/components/brand/Moon";
import { DoodleField } from "@/components/brand/Doodles";
import { cn, parseDay, relativeDay, todayKey } from "@/lib/utils";

const h = (m: number) => Math.round(m / 6) / 10;

export default function ReviewPage() {
  const { studentId } = useStudent();
  const [data, setData] = useState<Review | null>(null);
  const load = useCallback(() => getReview(studentId).then(setData), [studentId]);
  useEffect(() => {
    load();
  }, [load]);
  useDataChanged(load);

  if (!data) return (<><TopBar title="Weekly review" /><PageLoader /></>);
  const { week, series, by_subject, behind, stats } = data;
  const max = Math.max(60, ...series.map((d) => Math.max(d.planned, d.done)));
  const maxSubj = Math.max(1, ...by_subject.map((s) => s.minutes));
  const pct = Math.round(week.completion * 100);
  const daysTracked = series.filter((d) => d.planned > 0).length;
  const verdict = !week.planned_minutes || (daysTracked <= 1 && !week.done_minutes) ? "Your week is just getting started — tick off sessions and this page fills up." : pct >= 80 ? "A brilliant week — you did what you planned." : pct >= 50 ? "Solid week. A little more consistency and you're there." : "A tough week. Smaller sessions might help — try 30-minute blocks.";

  return (
    <div>
      <TopBar title="Weekly review" subtitle="How the last 7 days went, and where to focus next" />
      <div className="space-y-6 p-4 md:p-8">
        <section className="marble-night relative overflow-hidden rounded-4xl p-6 text-white md:p-10">
          <DoodleField count={10} seed={44} tone="dark" />
          <div className="relative flex flex-col items-start gap-8 md:flex-row md:items-center">
            <Moon value={week.completion} size={150} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-sand-300">Last 7 days</p>
              <h2 className="font-display text-4xl font-semibold md:text-5xl">{pct}% of your plan done</h2>
              <p className="mt-2 max-w-xl text-mist-200">{verdict}</p>
              <div className="mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { v: `${h(week.done_minutes)}h`, l: "studied", icon: Clock3 },
                  { v: `${h(week.planned_minutes)}h`, l: "planned", icon: TrendingUp },
                  { v: week.wins, l: "wins", icon: Trophy },
                  { v: stats.streak, l: "day streak", icon: Flame },
                ].map((x) => (
                  <div key={x.l} className="rounded-2xl bg-white/[0.08] p-3 ring-1 ring-white/10">
                    <x.icon size={15} className="text-sand-300" />
                    <p className="mt-1 font-display text-2xl font-semibold">{x.v}</p>
                    <p className="text-[11px] text-mist-300">{x.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader icon={<TrendingUp size={18} />} title="Planned vs. done" hint="Last 14 days" />
          {series.every((d) => !d.planned && !d.done) ? (
            <EmptyState doodle="pencil" title="No history yet" description="Tick off sessions in your plan and your days will show up here." />
          ) : (
            <div>
              <div className="flex h-48 items-end gap-1.5 sm:gap-2">
                {series.map((d, i) => (
                  <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${relativeDay(d.date)}: ${h(d.done)}h of ${h(d.planned)}h`}>
                    <div className="relative w-full overflow-hidden rounded-t-lg bg-mist-100" style={{ height: `${(d.planned / max) * 100}%` }}>
                      <motion.div className={cn("absolute inset-x-0 bottom-0 rounded-t-lg", d.done >= d.planned && d.planned ? "marble-sand" : "bg-dusk-500")}
                        initial={{ height: 0 }} animate={{ height: d.planned ? `${Math.min(100, (d.done / d.planned) * 100)}%` : "0%" }} transition={{ delay: i * 0.03, duration: 0.7 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5 sm:gap-2">
                {series.map((d) => (
                  <span key={d.date} className={cn("flex-1 text-center text-[10px] font-semibold", d.date === todayKey() ? "text-sand-700" : "text-mist-500")}>
                    {parseDay(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs font-semibold text-dusk-700">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-mist-200" /> Planned</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-dusk-500" /> Done</span>
                <span className="flex items-center gap-1.5"><span className="marble-sand h-2.5 w-2.5 rounded-full" /> Fully done</span>
              </div>
            </div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader icon={<BookOpen size={18} />} title="Where your time went" hint="Completed sessions this week, by subject" />
            {by_subject.length === 0 ? (
              <EmptyState doodle="book" title="Nothing logged this week" />
            ) : (
              <ul className="space-y-3">
                {by_subject.map((s, i) => (
                  <li key={s.subject}>
                    <div className="flex justify-between text-sm"><span className="font-semibold text-night-700">{s.subject}</span><span className="text-mist-600">{h(s.minutes)}h</span></div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-mist-100">
                      <motion.div className={cn("h-full rounded-full", i === 0 ? "marble-night" : "marble-dusk")} initial={{ width: 0 }} animate={{ width: `${(s.minutes / maxSubj) * 100}%` }} transition={{ delay: i * 0.06, duration: 0.8 }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={<AlertTriangle size={18} />} title="Falling behind" hint="Subjects with overdue work or deadlines that won't fully fit" />
            {behind.length === 0 ? (
              <EmptyState doodle="check" title="Nothing is falling behind" description="Every deadline fits in your plan. Keep going." />
            ) : (
              <ul className="space-y-2.5">
                {behind.map((b) => (
                  <li key={b.subject} className="flex items-center justify-between gap-3 rounded-2xl bg-mist-50 p-3">
                    <span className="font-semibold text-night-700">{b.subject}</span>
                    <span className="flex gap-1.5 text-xs font-bold">
                      {b.overdue > 0 && <span className="rounded-full bg-ember-50 px-2 py-0.5 text-ember-600">{b.overdue} overdue</span>}
                      {b.at_risk > 0 && <span className="rounded-full bg-sand-100 px-2 py-0.5 text-sand-800">{b.at_risk} tight</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => openChat("How should I catch up this week?")}><Sparkles size={14} /> Ask how to catch up</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
