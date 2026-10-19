"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Moon from "../brand/Moon";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";

const BLOCKS = [
  { t: "18:00", title: "Normalization worksheet", tag: "DBMS · due Fri", bar: "bg-dusk-500" },
  { t: "19:15", title: "OS internal exam prep", tag: "Exam in 4 days", bar: "bg-night-700" },
  { t: "20:30", title: "LeetCode: 3 graph problems", tag: "Placement prep", bar: "bg-sand-500" },
];

/** A playable mini version of tonight's plan. Tick sessions to fill the moon. */
export default function HeroPreview() {
  const [done, setDone] = useState<boolean[]>([true, false, false]);
  const value = done.filter(Boolean).length / done.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: 2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-[24rem] rounded-4xl bg-night-700/60 p-5 shadow-night ring-1 ring-white/15 backdrop-blur-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-sand-300">Tonight</p>
          <p className="font-display text-xl font-semibold text-white">3 sessions · 2.5h</p>
        </div>
        <Moon value={value} size={64} glow={false} showCraters={false} />
      </div>
      <ul className="space-y-2.5">
        {BLOCKS.map((b, i) => (
          <li key={b.title} className={cn("relative flex items-center gap-3 overflow-hidden rounded-2xl bg-white p-3 pl-4 transition", done[i] && "bg-sand-50")}>
            <span className={cn("absolute inset-y-0 left-0 w-1.5", b.bar)} />
            <span className="w-11 text-xs font-bold tabular-nums text-dusk-600">{b.t}</span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-semibold", done[i] ? "text-mist-600 line-through" : "text-night-700")}>{b.title}</p>
              <p className="text-[11px] text-mist-600">{b.tag}</p>
            </div>
            <button
              onClick={(e) => {
                const next = done.map((d, j) => (j === i ? !d : d));
                setDone(next);
                if (!done[i]) {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  celebrate({ x: (r.left + r.width / 2) / window.innerWidth, y: r.top / window.innerHeight, big: next.every(Boolean) });
                }
              }}
              aria-label={done[i] ? `Undo ${b.title}` : `Finish ${b.title}`}
              className={cn("grid h-9 w-9 place-items-center rounded-xl transition", done[i] ? "marble-sand text-night-700" : "bg-mist-100 text-mist-400 hover:bg-night-700 hover:text-sand-300")}
            >
              <Check size={16} strokeWidth={3} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs text-mist-300">Go on — tick one off and watch the moon fill.</p>
    </motion.div>
  );
}
