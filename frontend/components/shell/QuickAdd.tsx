"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Sparkles, CornerDownLeft } from "lucide-react";
import { sendChatMessage } from "@/lib/api";
import { notifyDataChanged, announceXp } from "@/lib/events";
import { inlineMarkdown } from "@/lib/utils";
import Modal from "../Modal";
import Spinner from "../Spinner";
import { useStudent } from "./StudentContext";

const EXAMPLES = [
  "DBMS assignment ER diagram due friday",
  "Machine Learning exam on 24th oct",
  "Remind me to email my mentor tomorrow",
  "I'm busy tonight",
  "I applied to Infosys for Systems Engineer",
  "Acme coding test is on friday",
];

/**
 * One box, plain English. Uses the assistant's parser, so "OS exam next
 * monday" or "remind me to call home tomorrow" just works. Opens with the
 * button or Ctrl/⌘ + K from anywhere in the app.
 */
export default function QuickAdd() {
  const { studentId, refresh } = useStudent();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
    else {
      setText("");
      setResult(null);
    }
  }, [open]);

  async function submit(value = text) {
    const msg = value.trim();
    if (!msg || busy) return;
    setBusy(true);
    try {
      let phrased = msg;
      // bare phrases like "DBMS assignment due friday" -> "add DBMS assignment due friday"
      const looksLikeCommand = /^(add|remind|i |i'm|im |mark|delete|remove|set|start|todo|task|what|show|how|move|push|postpone|where|when)/i.test(msg);
      const mentionsRound = /\b(coding|aptitude|interview|hr|gd|group discussion|resume|screening|round|oa)\b/i.test(msg);
      if (!looksLikeCommand && !mentionsRound && /assignment|homework|exam|test|quiz/i.test(msg)) phrased = `add ${msg}`;
      else if (!looksLikeCommand && !mentionsRound) phrased = `remind me to ${msg}`;
      const res = await sendChatMessage(studentId, phrased);
      setResult(res.reply);
      setText("");
      if (res.action_taken) {
        notifyDataChanged();
        if (res.action_taken.xp) announceXp(res.action_taken.xp, "Nice work!");
        refresh();
      }
    } catch (e: any) {
      setResult(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex h-11 items-center gap-2 rounded-2xl bg-white/90 pl-3 pr-2 text-sm font-semibold text-dusk-700 shadow-paper ring-1 ring-mist-200 transition hover:ring-dusk-300"
      >
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-night-700 text-sand-300 transition group-hover:rotate-90">
          <Plus size={16} />
        </span>
        <span className="hidden sm:inline">Quick add</span>
        <kbd className="hidden rounded-lg bg-mist-100 px-1.5 py-0.5 text-[11px] font-bold text-mist-600 lg:inline">Ctrl K</kbd>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Quick add" description="Type it like you'd say it. Dates like “friday” or “24th oct” work.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="relative"
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. OS assignment due next monday"
            className="input h-14 pr-14 text-base"
            aria-label="What do you want to add?"
          />
          <button type="submit" disabled={!text.trim() || busy} aria-label="Add" className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-xl bg-night-700 text-sand-300 transition disabled:opacity-40">
            {busy ? <Spinner className="h-4 w-4" /> : <CornerDownLeft size={17} />}
          </button>
        </form>

        <AnimatePresence mode="wait">
          {result ? (
            <motion.div key="r" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex gap-3 rounded-2xl bg-sand-50 p-4 text-sm text-night-700 ring-1 ring-sand-200">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-sand-600" />
              <p className="whitespace-pre-line">
                {inlineMarkdown(result).map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
              </p>
            </motion.div>
          ) : (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5">
              <p className="mb-2 text-xs font-semibold text-mist-600">Try one of these</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => setText(ex)} className="chip border-mist-200 bg-mist-50 text-dusk-700 hover:border-dusk-300 hover:bg-white">
                    {ex}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Modal>
    </>
  );
}
