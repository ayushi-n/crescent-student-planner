"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrandMark } from "../brand/Logo";

const SCRIPT = [
  { user: "I have a DBMS assignment due friday", bot: "Added **ER diagram** for DBMS, due Friday. First session: today at 6 PM." },
  { user: "ML exam on 24th oct", bot: "Added your **Machine Learning** exam. I've planned 9 prep sessions before it." },
  { user: "I finished the OS report", bot: "Boom, done! Marked **OS report** as submitted. **+50 XP** ✨" },
  { user: "what should I do now?", bot: "Next up: **Normalization worksheet** (18:00–19:00). It's due tomorrow." },
];

function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith("**") ? <strong key={i} className="text-night-700">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

/** Auto-playing conversation showing the assistant taking real actions. */
export default function ChatDemo() {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [showBot, setShowBot] = useState(false);
  const current = SCRIPT[step % SCRIPT.length];

  useEffect(() => {
    setTyped("");
    setShowBot(false);
    let i = 0;
    const type = setInterval(() => {
      i++;
      setTyped(current.user.slice(0, i));
      if (i >= current.user.length) {
        clearInterval(type);
        setTimeout(() => setShowBot(true), 500);
        setTimeout(() => setStep((s) => s + 1), 3600);
      }
    }, 45);
    return () => clearInterval(type);
  }, [step, current.user]);

  return (
    <div className="relative mx-auto w-full max-w-md rounded-4xl bg-white p-5 shadow-lift ring-1 ring-mist-100">
      <div className="mb-4 flex items-center gap-3 border-b border-mist-100 pb-4">
        <span className="marble-night grid h-10 w-10 place-items-center rounded-2xl">
          <BrandMark className="h-6 w-6" light />
        </span>
        <div>
          <p className="font-display font-semibold text-night-700">Crescent assistant</p>
          <p className="text-xs text-mist-600">Understands “friday”, “24th oct”, “tomorrow”…</p>
        </div>
      </div>
      <div className="min-h-[9.5rem] space-y-3">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-gradient-to-br from-dusk-500 to-dusk-600 px-4 py-2.5 text-sm text-white">
            {typed}
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-white/80" />
          </div>
        </div>
        <AnimatePresence mode="wait">
          {showBot && (
            <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-2">
              <span className="marble-night mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-xl">
                <BrandMark className="h-4 w-4" light />
              </span>
              <div className="max-w-[85%] rounded-3xl rounded-bl-lg bg-mist-50 px-4 py-2.5 text-sm leading-relaxed text-dusk-800 ring-1 ring-mist-100">
                <Bold text={current.bot} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
