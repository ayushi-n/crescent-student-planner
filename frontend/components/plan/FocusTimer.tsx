"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw } from "lucide-react";
import { logFocus } from "@/lib/api";
import { announceXp } from "@/lib/events";
import { celebrate } from "@/lib/celebrate";
import ProgressRing from "../ProgressRing";
import { cn } from "@/lib/utils";

/** Soft two-note chime via Web Audio (no audio files needed). */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1);
    });
  } catch {
    /* audio not available */
  }
}

const PRESETS = [
  { label: "Focus 25", minutes: 25, mode: "focus" as const },
  { label: "Deep 50", minutes: 50, mode: "focus" as const },
  { label: "Break 5", minutes: 5, mode: "break" as const },
];

/** Pomodoro-style timer. Finishing a focus session logs it and awards XP. */
export default function FocusTimer({ studentId, focusOn }: { studentId: string; focusOn?: string }) {
  const [preset, setPreset] = useState(PRESETS[0]);
  const [left, setLeft] = useState(PRESETS[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const endsAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    endsAt.current = Date.now() + left * 1000;
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.round(((endsAt.current || 0) - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        setRunning(false);
        finish();
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    const mm = String(Math.floor(left / 60)).padStart(2, "0");
    const ss = String(left % 60).padStart(2, "0");
    document.title = running ? `${mm}:${ss} · ${preset.mode === "focus" ? "Focus" : "Break"}` : "Crescent · Student Planner";
    return () => {
      document.title = "Crescent · Student Planner";
    };
  }, [left, running, preset.mode]);

  async function finish() {
    if (preset.mode === "focus") {
      setSessions((n) => n + 1);
      celebrate({ big: true });
      try {
        const res = await logFocus(studentId, preset.minutes);
        announceXp(res.xp, `${preset.minutes}-minute focus session`);
      } catch {
        /* offline: timer still works */
      }
    }
    chime();
  }

  function pick(p: (typeof PRESETS)[number]) {
    setRunning(false);
    setPreset(p);
    setLeft(p.minutes * 60);
  }

  const total = preset.minutes * 60;
  const pct = ((total - left) / total) * 100;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        {running && <motion.div className="absolute inset-0 rounded-full bg-sand-300/30" animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.4, repeat: Infinity }} />}
        <ProgressRing value={pct} size={168} strokeWidth={10} color={preset.mode === "focus" ? "#A68868" : "#4B6382"} trackColor="#E6EBF0">
          <div>
            <p className="font-display text-4xl font-semibold tabular-nums text-night-700">
              {mm}:{ss}
            </p>
            <p className="text-xs font-semibold text-mist-600">{preset.mode === "focus" ? (running ? "Stay with it" : "Ready to focus") : "Breathe"}</p>
          </div>
        </ProgressRing>
      </div>
      {focusOn && preset.mode === "focus" && <p className="mt-3 max-w-[16rem] truncate text-sm text-dusk-700">On: <span className="font-semibold">{focusOn}</span></p>}
      <div className="mt-4 flex gap-1.5 rounded-2xl bg-mist-100 p-1">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => pick(p)} className={cn("rounded-xl px-3 py-1.5 text-xs font-bold transition", preset.label === p.label ? "bg-white text-night-700 shadow-paper" : "text-dusk-600 hover:text-night-700")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => setRunning((r) => !r)} className={cn("flex h-11 items-center gap-2 rounded-2xl px-6 text-sm font-bold transition", running ? "bg-white text-night-700 ring-1 ring-mist-200" : "marble-night text-white shadow-night")}>
          {running ? <Pause size={16} /> : <Play size={16} />} {running ? "Pause" : left < total ? "Resume" : "Start"}
        </button>
        <button onClick={() => pick(preset)} aria-label="Reset timer" className="grid h-11 w-11 place-items-center rounded-2xl text-dusk-600 ring-1 ring-mist-200 transition hover:bg-mist-50">
          <RotateCcw size={16} />
        </button>
      </div>
      {sessions > 0 && <p className="mt-3 text-xs font-semibold text-sand-700">{sessions} session{sessions > 1 ? "s" : ""} finished this visit 🌙</p>}
    </div>
  );
}
