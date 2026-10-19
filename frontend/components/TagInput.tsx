"use client";

import { useState, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus } from "lucide-react";

export default function TagInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");

  function add(v: string) {
    const clean = v.trim();
    if (clean && !values.some((x) => x.toLowerCase() === clean.toLowerCase())) onChange([...values, clean]);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  const unused = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);

  return (
    <div>
      <div className="flex min-h-[3rem] flex-wrap items-center gap-2 rounded-2xl border border-mist-200 bg-white px-3 py-2 transition focus-within:border-dusk-400 focus-within:ring-4 focus-within:ring-dusk-100">
        <AnimatePresence initial={false}>
          {values.map((v) => (
            <motion.span
              key={v}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1 rounded-full bg-night-700 py-1 pl-3 pr-1.5 text-xs font-semibold text-white"
            >
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-white/20">
                <X size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft && add(draft)}
          placeholder={values.length === 0 ? placeholder : "Add another…"}
          className="min-w-[140px] flex-1 border-none bg-transparent py-1 text-sm outline-none placeholder:text-mist-500"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {unused.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="chip border-dashed border-mist-300 text-dusk-600 hover:border-dusk-400 hover:bg-dusk-50"
            >
              <Plus size={11} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
