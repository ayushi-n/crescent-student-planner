"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Coffee, AlertTriangle, SkipForward } from "lucide-react";
import { toggleBlock, skipBlock } from "@/lib/api";
import { announceXp, notifyDataChanged } from "@/lib/events";
import { celebrate, celebrateFrom } from "@/lib/celebrate";
import type { ScheduleBlock } from "@/lib/types";
import { CATEGORY_META, cn, hhmmToHours, relativeDay, todayKey } from "@/lib/utils";

function nowHours() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/**
 * Vertical timeline of study sessions. Each session can be ticked off:
 * hours are logged against the assignment/exam, XP is awarded and the moon
 * on the dashboard waxes. Breaks between sessions are shown as small gaps.
 */
export default function PlanTimeline({
  studentId,
  blocks,
  dateKey,
  onBlocksChange,
  compact = false,
}: {
  studentId: string;
  blocks: ScheduleBlock[];
  dateKey: string;
  onBlocksChange?: (blocks: ScheduleBlock[]) => void;
  compact?: boolean;
}) {
  const [local, setLocal] = useState(blocks);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [now, setNow] = useState(nowHours());
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => setLocal(blocks), [blocks]);
  useEffect(() => {
    const t = setInterval(() => setNow(nowHours()), 60000);
    return () => clearInterval(t);
  }, []);

  const isToday = dateKey === todayKey();

  async function toggle(b: ScheduleBlock) {
    if (busy) return;
    setBusy(b.id);
    setError(null);
    const next = local.map((x) => (x.id === b.id ? { ...x, done: !x.done } : x));
    setLocal(next);
    try {
      const res = await toggleBlock(studentId, b.id);
      announceXp(res.xp, res.xp > 0 ? `Session done: ${b.title}` : undefined);
      if (res.xp > 0) {
        const allDone = next.every((x) => x.done);
        if (allDone) celebrate({ big: true, y: 0.4 });
        else celebrateFrom(refs.current[b.id]);
      }
      onBlocksChange?.(next);
      notifyDataChanged();
    } catch (e: any) {
      setLocal(local);
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function skip(b: ScheduleBlock) {
    if (busy) return;
    setBusy(b.id);
    setError(null);
    try {
      const res = await skipBlock(studentId, b.id);
      setLocal((l) => l.filter((x) => x.id !== b.id));
      setInfo(res.moved_to ? `Skipped — “${b.title}” moved to ${relativeDay(res.moved_to.date).toLowerCase()} at ${res.moved_to.start}.` : `Skipped — the remaining work is spread over the rest of your week.`);
      setTimeout(() => setInfo(null), 5000);
      notifyDataChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      {error && <p className="mb-3 rounded-2xl bg-ember-50 px-4 py-2 text-sm text-ember-600">{error}</p>}
      <AnimatePresence>
        {info && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 rounded-2xl bg-dusk-50 px-4 py-2.5 text-sm font-medium text-dusk-800 ring-1 ring-dusk-100">
            {info}
          </motion.p>
        )}
      </AnimatePresence>
      <ol className="relative space-y-2">
        <span className="absolute bottom-3 left-[4.65rem] top-3 w-px bg-gradient-to-b from-mist-300 via-mist-200 to-transparent md:left-[5.15rem]" aria-hidden="true" />
        <AnimatePresence initial={false}>
          {local.map((b, i) => {
            const meta = CATEGORY_META[b.category] || CATEGORY_META.todo;
            const start = hhmmToHours(b.start);
            const end = hhmmToHours(b.end);
            const live = isToday && now >= start && now < end && !b.done;
            const prev = local[i - 1];
            const gap = prev ? start - hhmmToHours(prev.end) : 0;
            return (
              <motion.li
                key={b.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
              >
                {gap >= 0.24 && !compact && (
                  <div className="mb-2 flex items-center gap-3 pl-[5.6rem] text-[11px] font-semibold text-mist-500 md:pl-[6.1rem]">
                    <Coffee size={12} /> {Math.round(gap * 60)} min break
                  </div>
                )}
                <div className="flex items-stretch gap-3">
                  <div className="w-[4rem] shrink-0 pt-3 text-right md:w-[4.5rem]">
                    <p className={cn("text-sm font-bold tabular-nums", b.done ? "text-mist-500" : "text-night-700")}>{b.start}</p>
                    <p className="text-[11px] tabular-nums text-mist-500">{b.end}</p>
                  </div>
                  <div className="relative flex w-4 shrink-0 justify-center pt-4">
                    <span className={cn("z-10 h-3 w-3 rounded-full ring-4", b.done ? "bg-sand-400 ring-sand-100" : live ? "bg-dusk-500 ring-dusk-100" : "bg-white ring-mist-200")} />
                    {live && <span className="absolute top-[0.85rem] h-4 w-4 animate-ping rounded-full bg-dusk-400/50" />}
                  </div>
                  <div
                    className={cn(
                      "group relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-3xl border p-3 pl-4 transition",
                      b.done ? "border-sand-200 bg-sand-50/70" : live ? "border-dusk-300 bg-white shadow-lift" : "border-white bg-white/90 shadow-paper hover:shadow-lift"
                    )}
                  >
                    <span className={cn("absolute inset-y-0 left-0 w-1.5", meta.bar, b.overdue && "bg-ember-500")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cn("text-[11px] font-bold", b.overdue ? "text-ember-600" : meta.text)}>
                          {b.overdue ? "Overdue · catch up" : meta.label}
                        </span>
                        {live && <span className="rounded-full bg-dusk-500 px-2 py-0.5 text-[10px] font-bold text-white">Now</span>}
                        {b.subject && b.subject !== "Personal" && <span className="text-[11px] text-mist-500">{b.subject}</span>}
                      </div>
                      <p className={cn("line-clamp-2 text-[15px] font-semibold sm:truncate", b.done ? "text-mist-600 line-through decoration-sand-500/60" : "text-night-700")}>{b.title}</p>
                      {!compact && b.note && <p className="text-xs font-medium text-sand-800">Focus: {b.note}</p>}
                      {!compact && b.due_date && !b.overdue && !b.note && (
                        <p className="text-xs text-mist-600">Due {relativeDay(b.due_date).toLowerCase()} · {b.minutes} min session</p>
                      )}
                    </div>
                    {!b.done && (!isToday || end > now) && (
                      <button
                        onClick={() => skip(b)}
                        disabled={busy === b.id}
                        title="Can't do this one — move it"
                        aria-label={`Skip “${b.title}” and move it`}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-mist-400 opacity-60 transition hover:bg-mist-50 hover:text-dusk-600 hover:opacity-100 group-hover:opacity-100"
                      >
                        <SkipForward size={16} />
                      </button>
                    )}
                    <button
                      ref={(el) => {
                        refs.current[b.id] = el;
                      }}
                      onClick={() => toggle(b)}
                      disabled={busy === b.id}
                      aria-label={b.done ? `Mark “${b.title}” as not done` : `Mark “${b.title}” as done`}
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition",
                        b.done ? "marble-sand text-night-700 shadow-sand" : "bg-mist-50 text-mist-400 ring-1 ring-mist-200 hover:bg-night-700 hover:text-sand-300 hover:ring-night-700"
                      )}
                    >
                      <motion.span key={String(b.done)} initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                        <Check size={18} strokeWidth={3} />
                      </motion.span>
                    </button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {local.some((b) => b.overdue) && !compact && (
        <p className="mt-4 flex items-center gap-2 pl-[5.6rem] text-xs text-ember-600 md:pl-[6.1rem]">
          <AlertTriangle size={13} /> Overdue work goes first so you can catch up.
        </p>
      )}
    </div>
  );
}
