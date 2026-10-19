"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, Check, Wand2 } from "lucide-react";
import { setTimetable } from "@/lib/api";
import { notifyDataChanged } from "@/lib/events";
import type { TimetableEntry } from "@/lib/types";
import Button from "../Button";
import Spinner from "../Spinner";
import { cn, hhmmToHours } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GRID_START = 7;
const GRID_END = 22;

/** Weekly class timetable. The planner never schedules study sessions inside these blocks. */
export default function TimetableEditor({ studentId, initial, onSaved }: { studentId: string; initial: TimetableEntry[]; onSaved?: () => void }) {
  const [entries, setEntries] = useState<TimetableEntry[]>(initial);
  const [draft, setDraft] = useState<TimetableEntry>({ day: 0, start: "09:00", end: "10:00", label: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEntries(initial), [initial]);

  function update(next: TimetableEntry[]) {
    setEntries(next);
    setDirty(true);
    setSaved(false);
  }

  function add() {
    if (draft.end <= draft.start) {
      setError("The end time must be after the start time.");
      return;
    }
    setError(null);
    update([...entries, { ...draft, label: draft.label.trim() || "Class" }]);
  }

  function preset() {
    const weekdays = [0, 1, 2, 3, 4].map((d) => ({ day: d, start: "09:00", end: "16:00", label: "Classes" }));
    update([...entries.filter((e) => !(e.day < 5 && e.label === "Classes")), ...weekdays]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await setTimetable(studentId, entries.map(({ day, start, end, label }) => ({ day, start, end, label })));
      setEntries(res);
      setDirty(false);
      setSaved(true);
      notifyDataChanged();
      onSaved?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const span = GRID_END - GRID_START;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-7 gap-1.5">
          {DAYS.map((d, di) => (
            <div key={d}>
              <p className="mb-1 text-center text-[11px] font-bold text-dusk-600">{d}</p>
              <div className="relative h-56 overflow-hidden rounded-xl bg-mist-50 ring-1 ring-mist-100">
                {[9, 12, 15, 18, 21].map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-dashed border-mist-200" style={{ top: `${((h - GRID_START) / span) * 100}%` }}>
                    {di === 0 && <span className="absolute -top-2 left-0.5 text-[8px] text-mist-400">{h}</span>}
                  </div>
                ))}
                <AnimatePresence>
                  {entries.filter((e) => e.day === di).map((e, i) => {
                    const top = Math.max(0, (hhmmToHours(e.start) - GRID_START) / span) * 100;
                    const h = Math.max(4, ((Math.min(GRID_END, hhmmToHours(e.end)) - Math.max(GRID_START, hhmmToHours(e.start))) / span) * 100);
                    return (
                      <motion.div key={`${e.start}-${e.end}-${i}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        className="marble-dusk absolute inset-x-0.5 overflow-hidden rounded-lg px-1 py-0.5 text-[9px] font-bold leading-tight text-white"
                        style={{ top: `${top}%`, height: `${h}%` }} title={`${e.label} ${e.start}–${e.end}`}>
                        {e.label}
                        <span className="block font-medium opacity-80">{e.start}</span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
        <select className="input" value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })} aria-label="Day">
          {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <input className="input" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} aria-label="Start" />
        <input className="input" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} aria-label="End" />
        <input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. DBMS lecture" aria-label="Label" />
        <Button variant="secondary" onClick={add}><Plus size={15} /> Add</Button>
      </div>
      {error && <p className="text-sm text-ember-600">{error}</p>}

      {entries.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {entries.slice().sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).map((e, i) => (
            <li key={i} className="flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-xs font-semibold text-dusk-700 ring-1 ring-mist-200">
              {DAYS[e.day]} {e.start}–{e.end} · {e.label}
              <button aria-label="Remove" onClick={() => update(entries.filter((x) => x !== e))} className="rounded-full p-1 text-mist-400 hover:bg-ember-50 hover:text-ember-500"><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={preset}><Wand2 size={14} /> Mon–Fri 9–4 classes</Button>
        <div className="flex-1" />
        <Button variant="night" onClick={save} disabled={saving || !dirty} className={cn(!dirty && saved && "opacity-100")}>
          {saving ? <Spinner className="h-4 w-4" /> : saved && !dirty ? <Check size={16} /> : null} {saved && !dirty ? "Saved — plan updated" : "Save timetable"}
        </Button>
      </div>
    </div>
  );
}
