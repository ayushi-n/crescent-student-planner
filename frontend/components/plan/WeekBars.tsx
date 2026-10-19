"use client";

import { motion } from "framer-motion";
import type { ScheduleBlock } from "@/lib/types";
import { CATEGORY_META, cn, parseDay, todayKey } from "@/lib/utils";

const ORDER = ["exam_prep", "assignment", "project", "placement", "todo"];

/** Stacked bars of planned hours per day. Click a day to select it. */
export default function WeekBars({
  days,
  selected,
  onSelect,
  height = 150,
}: {
  days: Record<string, ScheduleBlock[]>;
  selected?: string | null;
  onSelect?: (key: string) => void;
  height?: number;
}) {
  const keys = Object.keys(days).sort().slice(0, 7);
  const data = keys.map((key) => {
    const by: Record<string, number> = {};
    let total = 0;
    let done = 0;
    for (const b of days[key]) {
      const h = (b.minutes || 0) / 60;
      by[b.category] = (by[b.category] || 0) + h;
      total += h;
      if (b.done) done += h;
    }
    return { key, by, total, done };
  });
  const max = Math.max(1, ...data.map((d) => d.total));
  const present = ORDER.filter((c) => data.some((d) => d.by[c]));
  const today = todayKey();

  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-3" style={{ height: height + 44 }}>
        {data.map((d, i) => {
          const isSel = selected === d.key;
          return (
            <button
              key={d.key}
              onClick={() => onSelect?.(d.key)}
              className={cn("group flex min-w-0 flex-1 flex-col items-center gap-2 rounded-2xl pt-2 transition", onSelect && "hover:bg-white/70", isSel && "bg-white shadow-paper")}
              aria-label={`${parseDay(d.key).toDateString()}: ${d.total.toFixed(1)} hours planned`}
            >
              <span className="text-[11px] font-bold tabular-nums text-dusk-600">{d.total ? `${+d.total.toFixed(1)}h` : "–"}</span>
              <div className="relative flex w-full max-w-[2.6rem] flex-col-reverse overflow-hidden rounded-xl bg-mist-100" style={{ height }}>
                {ORDER.map((cat) =>
                  d.by[cat] ? (
                    <motion.div
                      key={cat}
                      title={`${CATEGORY_META[cat].label}: ${d.by[cat].toFixed(1)}h`}
                      initial={{ height: 0 }}
                      animate={{ height: (d.by[cat] / max) * height }}
                      transition={{ duration: 0.8, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(CATEGORY_META[cat].bar, "w-full border-t border-white/40")}
                    />
                  ) : null
                )}
              </div>
              <span className={cn("pb-2 text-xs font-bold", d.key === today ? "text-sand-700" : "text-mist-600")}>
                {d.key === today ? "Today" : parseDay(d.key).toLocaleDateString(undefined, { weekday: "short" })}
              </span>
            </button>
          );
        })}
      </div>
      {present.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {present.map((c) => (
            <span key={c} className="flex items-center gap-1.5 text-xs font-semibold text-dusk-700">
              <span className={cn("h-2.5 w-2.5 rounded-full", CATEGORY_META[c].bar)} /> {CATEGORY_META[c].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
