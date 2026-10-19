"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { XP_EVENT } from "@/lib/events";

interface Toast {
  id: number;
  xp: number;
  label?: string;
}

/** "+50 XP" toasts that float up from the bottom whenever a student finishes something. */
export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let n = 0;
    const onXp = (e: Event) => {
      const { xp, label } = (e as CustomEvent).detail || {};
      if (!xp) return;
      const id = ++n + Date.now();
      setToasts((t) => [...t.slice(-2), { id, xp, label }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
    };
    window.addEventListener(XP_EVENT, onXp);
    return () => window.removeEventListener(XP_EVENT, onXp);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 md:bottom-8" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            className={`flex items-center gap-2.5 rounded-full py-2 pl-2 pr-4 shadow-lift ${t.xp > 0 ? "marble-night text-white" : "bg-white text-dusk-700 ring-1 ring-mist-200"}`}
          >
            <span className={`grid h-7 w-7 place-items-center rounded-full ${t.xp > 0 ? "marble-sand text-night-700" : "bg-mist-100"}`}>
              <Sparkles size={14} />
            </span>
            <span className="text-sm font-bold tabular-nums">{t.xp > 0 ? `+${t.xp}` : t.xp} XP</span>
            {t.label && <span className="max-w-[16rem] truncate text-sm text-mist-300">{t.label}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
