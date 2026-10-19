"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Check, Briefcase, Lightbulb, Building2, XCircle, Ban, Pencil, ListChecks, Megaphone, FileSearch, ArrowRight } from "lucide-react";
import {
  opportunitiesApi, applicationsApi, prepTasksApi, getEligibility, easyApply,
  getResumeSuggestions, updateEligibilityProfile, getStudent,
} from "@/lib/api";
import { notifyDataChanged, announceXp } from "@/lib/events";
import { celebrateFrom, celebrate } from "@/lib/celebrate";
import type { Opportunity, Application, PrepTask, JobWithEligibility, ResumeSuggestions, Profile, Priority } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card, { CardHeader } from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Tabs from "@/components/Tabs";
import EmptyState from "@/components/EmptyState";
import Spinner, { PageLoader } from "@/components/Spinner";
import { DoodleField } from "@/components/brand/Doodles";
import ApplicationsTable from "@/components/placements/ApplicationsTable";
import { cn, formatDate, urgencyLabel } from "@/lib/utils";


export default function PlacementsPage() {
  const { studentId } = useStudent();
  const [opps, setOpps] = useState<Opportunity[] | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [prep, setPrep] = useState<PrepTask[]>([]);

  const load = useCallback(async () => {
    const [o, a, p] = await Promise.all([opportunitiesApi.list(studentId), applicationsApi.list(studentId), prepTasksApi.list(studentId)]);
    setOpps(o);
    setApps(a);
    setPrep(p);
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  const changed = () => {
    load();
    notifyDataChanged();
  };

  if (!opps) return (<><TopBar title="Placements" /><PageLoader /></>);
  const active = apps.filter((a) => a.result === "in_progress").length;
  const offers = apps.filter((a) => a.result === "offer").length;

  return (
    <div>
      <TopBar title="Placements" subtitle="Eligibility, one-click applications, interview rounds and prep" />
      <div className="space-y-6 p-4 md:p-8">
        <section className="marble-dusk relative overflow-hidden rounded-4xl p-6 text-white md:p-8">
          <DoodleField count={8} seed={19} tone="dark" names={["plane", "star", "bulb", "check"]} />
          <div className="relative grid grid-cols-3 gap-4">
            {[
              { v: active, l: "applications in process" },
              { v: offers, l: offers === 1 ? "offer" : "offers" },
              { v: prep.filter((p) => !p.done).length, l: "prep tasks open" },
            ].map((s) => (
              <div key={s.l}>
                <p className="font-display text-5xl font-semibold">{s.v}</p>
                <p className="text-sm text-mist-100">{s.l}</p>
              </div>
            ))}
          </div>
        </section>
        <Tabs
          tabs={[
            { label: "My applications", icon: <ArrowRight size={15} />, count: apps.length, content: <ApplicationsTable studentId={studentId} items={apps} onChange={changed} /> },
            { label: "Job board", icon: <Briefcase size={15} />, content: <JobsTab studentId={studentId} onApplied={changed} /> },
            { label: "Resume insights", icon: <FileSearch size={15} />, content: <InsightsTab studentId={studentId} /> },
            { label: "Prep tasks", icon: <ListChecks size={15} />, count: prep.filter((p) => !p.done).length, content: <PrepTab studentId={studentId} items={prep} onChange={changed} /> },
            { label: "Opportunities", icon: <Megaphone size={15} />, count: opps.length, content: <OppsTab studentId={studentId} items={opps} onChange={changed} /> },
          ]}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- jobs */

function JobsTab({ studentId, onApplied }: { studentId: string; onApplied: () => void }) {
  const [eligible, setEligible] = useState<JobWithEligibility[]>([]);
  const [notEligible, setNotEligible] = useState<JobWithEligibility[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ cgpa: 0, active_backlogs: 0 });
  const [edit, setEdit] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [report, student, apps] = await Promise.all([getEligibility(studentId), getStudent(studentId), applicationsApi.list(studentId)]);
    setEligible(report.eligible);
    setNotEligible(report.not_eligible);
    setProfile(student.profile);
    setForm({ cgpa: student.profile.cgpa || 0, active_backlogs: student.profile.active_backlogs || 0 });
    setApplied(new Set(apps.map((a) => a.job_id).filter(Boolean) as string[]));
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  async function apply(id: string, el: HTMLElement) {
    setApplying(id);
    setError("");
    try {
      await easyApply(studentId, id);
      celebrateFrom(el);
      onApplied();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(null);
    }
  }

  if (!profile) return <div className="grid place-items-center py-16"><Spinner className="text-dusk-500" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/80 p-4 shadow-paper">
        <div className="flex flex-wrap items-center gap-2 text-sm text-dusk-700">
          <span className="font-semibold">Eligibility profile:</span>
          <Badge tone="brand">CGPA {profile.cgpa || "not set"}</Badge>
          <Badge tone="neutral">{profile.active_backlogs || 0} backlogs</Badge>
          <Badge tone="neutral">{profile.branch || "No branch"}</Badge>
          <Badge tone="neutral">{profile.skills?.length || 0} skills</Badge>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEdit(true)}><Pencil size={14} /> Update CGPA</Button>
      </div>
      {!profile.cgpa && <p className="rounded-2xl bg-sand-100 px-4 py-3 text-sm text-sand-900">Add your CGPA to see which roles you qualify for — most companies have a cut-off.</p>}
      {error && <p className="rounded-2xl bg-ember-50 px-4 py-3 text-sm text-ember-600">{error}</p>}

      <section>
        <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-night-700"><Check className="text-dusk-500" size={20} /> You can apply ({eligible.length})</h3>
        {eligible.length === 0 ? (
          <Card><EmptyState doodle="plane" title="No eligible roles yet" description="Update your CGPA or add skills in Settings to unlock roles." /></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {eligible.map((j) => <JobCard key={j.id} job={j} applied={applied.has(j.id)} applying={applying === j.id} onApply={(el) => apply(j.id, el)} />)}
          </div>
        )}
      </section>
      <section>
        <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-night-700"><XCircle className="text-mist-500" size={20} /> Not yet ({notEligible.length})</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {notEligible.map((j) => <JobCard key={j.id} job={j} disabled />)}
        </div>
      </section>

      <Modal open={edit} onClose={() => setEdit(false)} title="Eligibility profile" description="Used only to check job cut-offs.">
        <div className="space-y-4">
          <label className="block"><span className="label">CGPA (out of 10)</span><input className="input" type="number" step="0.01" min="0" max="10" value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: Number(e.target.value) })} /></label>
          <label className="block"><span className="label">Active backlogs</span><input className="input" type="number" min="0" value={form.active_backlogs} onChange={(e) => setForm({ ...form, active_backlogs: Number(e.target.value) })} /></label>
          <Button variant="night" className="w-full" onClick={async () => { await updateEligibilityProfile(studentId, form.cgpa, form.active_backlogs); setEdit(false); load(); }}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}

function JobCard({ job, applied, applying, onApply, disabled }: { job: JobWithEligibility; applied?: boolean; applying?: boolean; onApply?: (el: HTMLElement) => void; disabled?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-col rounded-3xl p-5 ring-1 transition", disabled ? "bg-mist-50/70 ring-mist-100" : "bg-white shadow-paper ring-white hover:shadow-lift")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", disabled ? "bg-mist-100 text-mist-500" : "marble-night text-sand-300")}><Building2 size={19} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold text-night-700">{job.company}</p>
          <p className="text-sm text-dusk-700">{job.role}</p>
        </div>
      </div>
      {job.package && <p className="mt-3 text-sm font-bold text-sand-700">{job.package}</p>}
      <p className="mt-2 flex-1 text-sm text-mist-600">{job.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="neutral">CGPA ≥ {job.min_cgpa}</Badge>
        {job.required_skills.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
      </div>
      <div className="mt-4">
        {disabled ? (
          <ul className="space-y-1">
            {job.reasons.map((r, i) => <li key={i} className="flex gap-1.5 text-xs text-ember-600"><Ban size={12} className="mt-0.5 shrink-0" /> {r}</li>)}
          </ul>
        ) : applied ? (
          <Button variant="secondary" size="sm" className="w-full" disabled><Check size={14} /> Applied</Button>
        ) : (
          <Button variant="night" size="sm" className="w-full" disabled={applying} onClick={(e) => onApply?.(e.currentTarget)}>
            {applying ? <Spinner className="h-4 w-4" /> : null} Easy apply
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------ insights */

function InsightsTab({ studentId }: { studentId: string }) {
  const [data, setData] = useState<ResumeSuggestions | null>(null);
  useEffect(() => {
    getResumeSuggestions(studentId).then(setData);
  }, [studentId]);
  if (!data) return <div className="grid place-items-center py-16"><Spinner className="text-dusk-500" /></div>;
  const max = Math.max(1, ...data.top_skill_gaps.map((g) => g.roles_blocked));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader icon={<Lightbulb size={18} />} title="What would help most" />
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-night-50 p-4"><p className="font-display text-3xl font-semibold text-night-700">{data.eligible_count}</p><p className="text-xs font-semibold text-dusk-700">roles open to you</p></div>
          <div className="rounded-3xl bg-sand-50 p-4"><p className="font-display text-3xl font-semibold text-sand-800">{data.not_eligible_count}</p><p className="text-xs font-semibold text-sand-800">roles to unlock</p></div>
        </div>
        <ul className="space-y-2.5">
          {data.suggestions.map((s, i) => <li key={i} className="flex gap-3 rounded-2xl bg-mist-50 p-3 text-sm text-dusk-800"><Lightbulb size={16} className="mt-0.5 shrink-0 text-sand-600" /> {s}</li>)}
        </ul>
      </Card>
      <Card>
        <CardHeader icon={<FileSearch size={18} />} title="Skill gaps" hint="How many closed roles each skill would unlock" />
        {data.top_skill_gaps.length === 0 ? <EmptyState doodle="check" title="No gaps found" /> : (
          <ul className="space-y-3">
            {data.top_skill_gaps.map((g, i) => (
              <li key={g.skill}>
                <div className="flex justify-between text-sm"><span className="font-semibold capitalize text-night-700">{g.skill}</span><span className="text-mist-600">{g.roles_blocked}</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-mist-100">
                  <motion.div className="marble-dusk h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${(g.roles_blocked / max) * 100}%` }} transition={{ delay: i * 0.08, duration: 0.8 }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.recommended_courses.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-bold text-mist-600">Courses that teach these</p>
            <div className="flex flex-wrap gap-2">{data.recommended_courses.map((c) => <Badge key={c.id} tone="gold">{c.name}</Badge>)}</div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- prep */

function PrepTab({ studentId, items, onChange }: { studentId: string; items: PrepTask[]; onChange: () => void }) {
  const [form, setForm] = useState({ title: "", due_date: "", priority: "medium" as Priority });
  return (
    <div className="space-y-4">
      <Card padded={false} className="p-4">
        <form onSubmit={async (e) => { e.preventDefault(); if (!form.title.trim()) return; await prepTasksApi.add(studentId, { ...form, done: false }); setForm({ title: "", due_date: "", priority: "medium" }); onChange(); }} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <input className="input" placeholder="e.g. Mock interview with a senior" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <Button type="submit" variant="night"><Plus size={16} /> Add</Button>
        </form>
        <p className="mt-2 px-1 text-xs text-mist-600">Prep tasks get time in your study plan.</p>
      </Card>
      {items.length === 0 ? <Card><EmptyState doodle="flask" title="No prep tasks" description="DSA practice, resume updates, mock interviews…" /></Card> : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="group flex items-center gap-3 rounded-3xl bg-white p-3.5 shadow-paper">
              <button aria-label="Toggle done" onClick={async (e) => { const el = e.currentTarget; const res = await prepTasksApi.update(studentId, t.id, { done: !t.done }); if (res._xp) announceXp(res._xp, t.title); if (!t.done) celebrateFrom(el); onChange(); }} className={cn("grid h-8 w-8 place-items-center rounded-full transition", t.done ? "marble-sand text-night-700" : "text-transparent ring-2 ring-mist-300 hover:text-dusk-500")}>
                <Check size={15} strokeWidth={3} />
              </button>
              <p className={cn("flex-1 font-semibold", t.done ? "text-mist-500 line-through" : "text-night-700")}>{t.title}</p>
              {t.due_date && !t.done && <Badge tone={urgencyLabel(t.due_date).tone}>{urgencyLabel(t.due_date).label}</Badge>}
              <button aria-label="Delete" onClick={async () => { await prepTasksApi.remove(studentId, t.id); onChange(); }} className="rounded-lg p-1.5 text-mist-400 opacity-0 hover:text-ember-500 group-hover:opacity-100"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------- opportunities */

function OppsTab({ studentId, items, onChange }: { studentId: string; items: Opportunity[]; onChange: () => void }) {
  const [form, setForm] = useState({ company: "", role: "", deadline: "" });
  return (
    <div className="space-y-4">
      <Card padded={false} className="p-4">
        <form onSubmit={async (e) => { e.preventDefault(); if (!form.company || !form.role) return; await opportunitiesApi.add(studentId, { ...form, status: "open" }); setForm({ company: "", role: "", deadline: "" }); onChange(); }} className="grid gap-2 sm:grid-cols-[1.3fr_1.3fr_1fr_auto]">
          <input className="input" placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <input className="input" placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} aria-label="Application deadline" />
          <Button type="submit" variant="night"><Plus size={16} /> Add</Button>
        </form>
        <p className="mt-2 px-1 text-xs text-mist-600">Openings you've heard about. Deadlines show up on your dashboard.</p>
      </Card>
      {items.length === 0 ? <Card><EmptyState doodle="bulb" title="Nothing tracked" description="Add drives from your placement cell or LinkedIn so you don't miss deadlines." /></Card> : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((o) => (
            <div key={o.id} className="group flex items-center gap-3 rounded-3xl bg-white p-4 shadow-paper">
              <span className="marble-mist grid h-10 w-10 place-items-center rounded-2xl text-night-700"><Building2 size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-night-700">{o.company}</p>
                <p className="truncate text-sm text-mist-600">{o.role}</p>
              </div>
              {o.deadline && <Badge tone={urgencyLabel(o.deadline).tone}>{urgencyLabel(o.deadline).label}</Badge>}
              <button aria-label="Delete" onClick={async () => { await opportunitiesApi.remove(studentId, o.id); onChange(); }} className="rounded-lg p-1.5 text-mist-400 opacity-0 hover:text-ember-500 group-hover:opacity-100"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
