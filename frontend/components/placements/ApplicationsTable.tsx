"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Check, X, Clock, CalendarDays, Building2, Minus } from "lucide-react";
import { applicationsApi, updateRound } from "@/lib/api";
import { announceXp } from "@/lib/events";
import { celebrate, celebrateFrom } from "@/lib/celebrate";
import type { Application, Round, RoundKey, RoundStatus } from "@/lib/types";
import Button from "../Button";
import Modal from "../Modal";
import EmptyState from "../EmptyState";
import { cn, formatDate, relativeDay, daysUntil } from "@/lib/utils";

export const ROUND_COLUMNS: { key: RoundKey; label: string; short: string }[] = [
  { key: "resume", label: "Resume screening", short: "Resume" },
  { key: "aptitude", label: "Aptitude test", short: "Aptitude" },
  { key: "coding", label: "Coding test", short: "Coding" },
  { key: "gd", label: "Group discussion", short: "GD" },
  { key: "interview1", label: "Interview 1", short: "Interview 1" },
  { key: "interview2", label: "Interview 2", short: "Interview 2" },
  { key: "hr", label: "HR interview", short: "HR" },
];
const DEFAULT_ROUNDS: RoundKey[] = ["resume", "coding", "interview1", "interview2", "hr"];

const STATUS_META: Record<RoundStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  selected: { label: "Selected", cls: "bg-night-700 text-white", icon: <Check size={12} strokeWidth={3} /> },
  rejected: { label: "Rejected", cls: "bg-ember-50 text-ember-600 ring-1 ring-ember-100", icon: <X size={12} strokeWidth={3} /> },
  in_progress: { label: "In progress", cls: "bg-sand-100 text-sand-900 ring-1 ring-sand-300", icon: <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sand-600" /> },
  pending: { label: "Upcoming", cls: "bg-white text-dusk-700 ring-1 ring-mist-200", icon: <Clock size={11} /> },
  na: { label: "N/A", cls: "text-mist-400", icon: null },
};

type Filter = "all" | "in_progress" | "offer" | "rejected";

/** True when this round comes after the round the application was rejected at. */
function notReached(app: Application, idx: number) {
  const rej = app.rounds.findIndex((r) => r.status === "rejected");
  return rej >= 0 && idx > rej;
}

function Cell({ app, round, idx, onEdit }: { app: Application; round: Round; idx: number; onEdit: () => void }) {
  if (round.status === "na") {
    return (
      <button onClick={onEdit} className="mx-auto flex h-full w-full flex-col items-center justify-center rounded-xl py-2 text-[11px] font-bold text-mist-400 transition hover:bg-mist-50" title="This company doesn't conduct this round — click to change">
        N/A
      </button>
    );
  }
  if (notReached(app, idx)) {
    return (
      <div className="flex justify-center py-2 text-mist-300" title="Not reached">
        <Minus size={16} />
      </div>
    );
  }
  const meta = STATUS_META[round.status];
  const soon = round.date ? daysUntil(round.date) : null;
  return (
    <button onClick={onEdit} className="group mx-auto flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 transition hover:bg-mist-50" aria-label={`${app.company} ${round.label}: ${meta.label}. Change`}>
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold", meta.cls)}>
        {meta.icon} {meta.label}
      </span>
      {round.date && round.status !== "selected" && round.status !== "rejected" && (
        <span className={cn("flex items-center gap-1 text-[10px] font-semibold", soon !== null && soon >= 0 && soon <= 2 ? "text-ember-600" : "text-mist-600")}>
          <CalendarDays size={10} /> {relativeDay(round.date)}
        </span>
      )}
    </button>
  );
}

export default function ApplicationsTable({ studentId, items, onChange }: { studentId: string; items: Application[]; onChange: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<{ app: Application; round: Round } | null>(null);
  const [draft, setDraft] = useState<{ status: RoundStatus; date: string }>({ status: "pending", date: "" });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ company: "", role: "", rounds: DEFAULT_ROUNDS as RoundKey[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    all: items.length,
    in_progress: items.filter((a) => a.result === "in_progress").length,
    offer: items.filter((a) => a.result === "offer").length,
    rejected: items.filter((a) => a.result === "rejected").length,
  }), [items]);
  const rows = items.filter((a) => filter === "all" || a.result === filter);
  const next = items
    .flatMap((a) => a.rounds.filter((r) => r.date && (r.status === "pending" || r.status === "in_progress") && (daysUntil(r.date) ?? -1) >= 0).map((r) => ({ a, r })))
    .sort((x, y) => (x.r.date! < y.r.date! ? -1 : 1))[0];

  function openCell(app: Application, round: Round) {
    setEditing({ app, round });
    setDraft({ status: round.status, date: round.date || "" });
    setError(null);
  }

  async function saveCell(el?: HTMLElement) {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await updateRound(studentId, editing.app.id, editing.round.key, { status: draft.status, date: draft.status === "na" ? null : draft.date || null });
      if (res._xp) announceXp(res._xp, `Cleared ${editing.round.label.toLowerCase()} at ${editing.app.company}`);
      if (res.result === "offer" && editing.app.result !== "offer") celebrate({ big: true });
      else if (draft.status === "selected" && editing.round.status !== "selected") celebrateFrom(el || null);
      setEditing(null);
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addApplication() {
    if (!form.company.trim()) return;
    setSaving(true);
    try {
      await applicationsApi.add(studentId, { company: form.company.trim(), role: form.role.trim(), rounds: form.rounds } as any);
      setAdding(false);
      setForm({ company: "", role: "", rounds: DEFAULT_ROUNDS });
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {([["all", "All"], ["in_progress", "Active"], ["offer", "Offers"], ["rejected", "Rejected"]] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn("chip", filter === k ? "border-night-700 bg-night-700 text-white" : "border-mist-200 bg-white text-dusk-700 hover:border-dusk-300")}>
              {l} <span className={cn("rounded-full px-1.5 text-[10px]", filter === k ? "bg-sand-300 text-night-700" : "bg-mist-100")}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <Button variant="night" size="sm" onClick={() => setAdding(true)}><Plus size={15} /> Add application</Button>
      </div>

      {next && (
        <div className="flex items-center gap-3 rounded-3xl bg-sand-50 px-4 py-3 text-sm ring-1 ring-sand-200">
          <CalendarDays size={18} className="shrink-0 text-sand-700" />
          <p className="text-night-700">
            Next round: <strong>{next.a.company} — {next.r.label}</strong> on {relativeDay(next.r.date)} ({formatDate(next.r.date)}). Prep sessions are in your plan.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="paper-card"><EmptyState doodle="plane" title="No applications yet" description="Use Easy apply on the Job board, or add one you applied to elsewhere — including which rounds that company conducts." action={<Button variant="night" onClick={() => setAdding(true)}><Plus size={15} /> Add application</Button>} /></div>
      ) : (
        <div className="paper-card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="marble-night text-left text-white">
                  <th className="sticky left-0 z-10 w-[8.5rem] bg-night-700 px-3 py-3.5 text-xs font-bold sm:w-[13.5rem] sm:px-4">Company & role</th>
                  {ROUND_COLUMNS.map((c) => (
                    <th key={c.key} className="px-1 py-3.5 text-center text-xs font-bold" title={c.label}>{c.short}</th>
                  ))}
                  <th className="px-2 py-3.5 text-center text-xs font-bold">Result</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((app, rIdx) => (
                  <motion.tr key={app.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: rIdx * 0.03 }} className="group border-t border-mist-100 transition hover:bg-mist-50/50">
                    <td className="sticky left-0 z-10 w-[8.5rem] max-w-[8.5rem] bg-white px-3 py-3 shadow-[6px_0_10px_-8px_rgba(7,23,57,.25)] group-hover:bg-mist-50 sm:w-[13.5rem] sm:max-w-[13.5rem] sm:px-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("hidden h-9 w-9 shrink-0 place-items-center rounded-xl sm:grid", app.result === "offer" ? "marble-sand text-night-700" : app.result === "rejected" ? "bg-mist-100 text-mist-500" : "marble-night text-sand-300")}>
                          <Building2 size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-night-700">{app.company}</p>
                          <p className="truncate text-xs text-mist-600">{app.role || "—"}<span className="hidden sm:inline">{app.applied_date ? ` · applied ${formatDate(app.applied_date)}` : ""}</span></p>
                        </div>
                      </div>
                    </td>
                    {ROUND_COLUMNS.map((c) => {
                      const idx = app.rounds.findIndex((r) => r.key === c.key);
                      const round = app.rounds[idx];
                      return (
                        <td key={c.key} className="px-1 py-1 text-center align-middle">
                          {round ? <Cell app={app} round={round} idx={idx} onEdit={() => openCell(app, round)} /> : <span className="text-mist-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-3 text-center">
                      {app.result === "offer" ? (
                        <span className="marble-sand inline-flex rounded-full px-3 py-1 text-xs font-bold text-night-700 shadow-sand">Offer 🎉</span>
                      ) : app.result === "rejected" ? (
                        <span className="inline-flex rounded-full bg-ember-50 px-3 py-1 text-xs font-bold text-ember-600">Rejected</span>
                      ) : (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-dusk-50 px-3 py-1 text-xs font-bold text-dusk-700">
                          {ROUND_COLUMNS.find((c) => c.key === app.current_round)?.short || "In process"}
                        </span>
                      )}
                    </td>
                    <td className="pr-3">
                      <button aria-label={`Delete ${app.company}`} onClick={async () => { if (confirm(`Remove ${app.company} from your applications?`)) { await applicationsApi.remove(studentId, app.id); onChange(); } }} className="rounded-lg p-1.5 text-mist-400 opacity-0 transition hover:bg-ember-50 hover:text-ember-500 group-hover:opacity-100 focus:opacity-100">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-mist-100 bg-mist-50/60 px-5 py-3 text-[11px] font-semibold text-dusk-700">
            {(["selected", "in_progress", "pending", "rejected"] as RoundStatus[]).map((s) => (
              <span key={s} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", STATUS_META[s].cls)}>{STATUS_META[s].icon} {STATUS_META[s].label}</span>
            ))}
            <span className="text-mist-500">N/A = company doesn't hold this round</span>
            <span className="flex items-center gap-1 text-mist-500"><Minus size={12} /> = not reached</span>
            <span className="ml-auto text-mist-500">Click any cell to update it</span>
          </div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.app.company} · ${editing.round.label}` : ""} description="Set the result and date for this round. Dated rounds get prep sessions in your plan.">
        {editing && (
          <div className="space-y-5">
            <div>
              <span className="label">Status</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(["pending", "in_progress", "selected", "rejected", "na"] as RoundStatus[]).map((s) => (
                  <button key={s} onClick={() => setDraft({ ...draft, status: s })} className={cn("flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition", draft.status === s ? "marble-night text-white shadow-night" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200 hover:ring-dusk-300")}>
                    {s === "na" ? "Not conducted (N/A)" : s === "pending" ? "Upcoming" : STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>
            {draft.status !== "na" && (
              <label className="block">
                <span className="label">Date of this round <span className="font-normal text-mist-500">(optional)</span></span>
                <input type="date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </label>
            )}
            {error && <p className="text-sm text-ember-600">{error}</p>}
            <Button variant="night" className="w-full" disabled={saving} onClick={(e) => saveCell(e.currentTarget)}>Save</Button>
          </div>
        )}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add an application" description="Pick the rounds this company conducts — the rest show as N/A.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Company</span><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="e.g. Infosys" /></label>
            <label className="block"><span className="label">Role</span><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Systems Engineer" /></label>
          </div>
          <div>
            <span className="label">Rounds this company conducts</span>
            <div className="flex flex-wrap gap-2">
              {ROUND_COLUMNS.map((c) => {
                const on = form.rounds.includes(c.key);
                return (
                  <button key={c.key} onClick={() => setForm({ ...form, rounds: on ? form.rounds.filter((k) => k !== c.key) : ROUND_COLUMNS.map((x) => x.key).filter((k) => k === c.key || form.rounds.includes(k)) })}
                    className={cn("chip py-1.5 text-sm", on ? "border-night-700 bg-night-700 text-white" : "border-mist-200 bg-white text-dusk-700")}>
                    {on ? <Check size={13} /> : <Plus size={13} />} {c.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-mist-600">Only coding + interview? Select just those two — everything else will show N/A.</p>
          </div>
          <Button variant="night" className="w-full" disabled={saving || !form.company.trim() || form.rounds.length === 0} onClick={addApplication}>Add to my applications</Button>
        </div>
      </Modal>
    </div>
  );
}
