"use client";

import { useState } from "react";
import { Plus, Trash2, Moon as MoonIcon, Sun } from "lucide-react";
import { addBusy, removeBusy } from "@/lib/api";
import { notifyDataChanged } from "@/lib/events";
import type { BusyBlock } from "@/lib/types";
import Button from "../Button";
import { relativeDay, todayKey } from "@/lib/utils";

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One-off times you can't study ("busy tonight", a trip, a fest). Sessions move out of them. */
export default function BusyTimes({ studentId, items, onChange }: { studentId: string; items: BusyBlock[]; onChange: () => void }) {
  const [form, setForm] = useState({ date: todayKey(), start: "18:00", end: "21:00", label: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(b = form) {
    if (b.end <= b.start) return setError("The end time must be after the start time.");
    setBusy(true);
    setError(null);
    try {
      await addBusy(studentId, { ...b, label: b.label.trim() || "Busy" });
      notifyDataChanged();
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0")}`;
  const upcoming = items.filter((b) => b.date >= todayKey()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => add({ date: todayKey(), start: nowHHMM < "17:00" ? "17:00" : nowHHMM, end: "23:59", label: "Busy tonight" })}>
          <MoonIcon size={14} /> I'm busy tonight
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => add({ date: tomorrowKey(), start: "06:00", end: "23:59", label: "Day off" })}>
          <Sun size={14} /> Day off tomorrow
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="input col-span-2" type="date" value={form.date} min={todayKey()} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
        <input className="input" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="From" />
        <input className="input" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-label="To" />
        <input className="input col-span-2" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Reason (optional)" aria-label="Reason" />
      </div>
      <Button size="sm" variant="night" className="w-full" disabled={busy} onClick={() => add()}><Plus size={14} /> Block this time</Button>
      {error && <p className="text-sm text-ember-600">{error}</p>}
      {upcoming.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {upcoming.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-2xl bg-mist-50 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-night-700">{relativeDay(b.date)}</span>
                <span className="text-mist-600"> · {b.start}–{b.end === "23:59" ? "end of day" : b.end}</span>
                <span className="block truncate text-xs text-mist-600">{b.label}</span>
              </span>
              <button aria-label="Remove busy time" onClick={async () => { await removeBusy(studentId, b.id); notifyDataChanged(); onChange(); }} className="rounded-lg p-1.5 text-mist-400 hover:bg-ember-50 hover:text-ember-500"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
