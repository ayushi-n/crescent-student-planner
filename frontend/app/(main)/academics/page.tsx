"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, Check, BookOpen, ClipboardList, FolderKanban, CalendarDays, Pencil, ChevronDown, CalendarClock, X } from "lucide-react";
import { assignmentsApi, projectsApi, examsApi, getPlan, updateSettings } from "@/lib/api";
import { notifyDataChanged, announceXp, useDataChanged } from "@/lib/events";
import { celebrateFrom } from "@/lib/celebrate";
import type { Assignment, Project, Exam, Schedule, ScheduleBlock, Priority } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Tabs from "@/components/Tabs";
import EmptyState from "@/components/EmptyState";
import { PageLoader } from "@/components/Spinner";
import { BUCKET_META, cn, daysUntil, formatDate, groupByBucket, relativeDay, urgencyLabel, type DeadlineBucket } from "@/lib/utils";

const BUCKETS: DeadlineBucket[] = ["overdue", "today", "this_week", "later", "no_date"];
const PRIORITY_DOT: Record<Priority, string> = { high: "bg-ember-500", medium: "bg-sand-500", low: "bg-mist-400" };

function useNextSessions(schedule: Schedule | null) {
  return useMemo(() => {
    const map: Record<string, { next?: ScheduleBlock; count: number; minutes: number }> = {};
    if (!schedule) return map;
    for (const key of Object.keys(schedule.days).sort()) {
      for (const b of schedule.days[key]) {
        const m = (map[b.ref_id] ||= { count: 0, minutes: 0 });
        if (!b.done) {
          m.count++;
          m.minutes += b.minutes;
          if (!m.next) m.next = b;
        }
      }
    }
    return map;
  }, [schedule]);
}

function NextSession({ info }: { info?: { next?: ScheduleBlock; count: number; minutes: number } }) {
  if (!info?.next) return <span className="text-xs text-mist-500">No sessions planned this week</span>;
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-dusk-600">
      <CalendarClock size={13} /> Next: {relativeDay(info.next.date)} {info.next.start} · {info.count} session{info.count !== 1 ? "s" : ""} planned
    </span>
  );
}

export default function AcademicsPage() {
  const { studentId, profile, refresh } = useStudent();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [initialTab, setInitialTab] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [a, p, e, s] = await Promise.all([assignmentsApi.list(studentId), projectsApi.list(studentId), examsApi.list(studentId), getPlan(studentId)]);
    setAssignments(a);
    setProjects(p);
    setExams(e.sort((x, y) => x.date.localeCompare(y.date)));
    setSchedule(s);
  }, [studentId]);

  useEffect(() => {
    load();
    const tab = new URLSearchParams(window.location.search).get("tab");
    setInitialTab({ projects: 1, exams: 2, subjects: 3 }[tab || ""] ?? 0);
  }, [load]);
  useDataChanged(load);

  const sessions = useNextSessions(schedule);
  const changed = async () => {
    notifyDataChanged();
  };

  if (!assignments || initialTab === null) return (<><TopBar title="Academics" /><PageLoader /></>);
  const subjects = profile.subjects || [];

  return (
    <div>
      <TopBar title="Academics" subtitle="Assignments, projects, exams and subjects — all planned automatically" />
      <div className="p-4 md:p-8">
        <Tabs
          initial={initialTab}
          tabs={[
            { label: "Assignments", icon: <ClipboardList size={15} />, count: assignments.filter((a) => a.status === "pending").length, content: <AssignmentsTab studentId={studentId} items={assignments} subjects={subjects} sessions={sessions} onChange={changed} /> },
            { label: "Projects", icon: <FolderKanban size={15} />, count: projects.filter((p) => p.status !== "completed").length, content: <ProjectsTab studentId={studentId} items={projects} subjects={subjects} sessions={sessions} onChange={changed} /> },
            { label: "Exams", icon: <CalendarDays size={15} />, count: exams.filter((e) => (daysUntil(e.date) ?? -1) >= 0).length, content: <ExamsTab studentId={studentId} items={exams} subjects={subjects} sessions={sessions} onChange={changed} /> },
            { label: "Subjects", icon: <BookOpen size={15} />, count: subjects.length, content: <SubjectsTab studentId={studentId} subjects={subjects} assignments={assignments} exams={exams} onChange={() => { refresh(); changed(); }} /> },
          ]}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ assignments */

type AsgForm = { title: string; subject: string; due_date: string; priority: Priority; estimated_hours: string; notes: string };
const blankAsg = (subject = ""): AsgForm => ({ title: "", subject, due_date: "", priority: "medium", estimated_hours: "", notes: "" });

function AssignmentsTab({ studentId, items, subjects, sessions, onChange }: { studentId: string; items: Assignment[]; subjects: string[]; sessions: ReturnType<typeof useNextSessions>; onChange: () => void }) {
  const [quick, setQuick] = useState<AsgForm>(blankAsg(subjects[0]));
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const visible = items.filter((a) => filter === "all" || a.subject === filter);
  const pending = visible.filter((a) => a.status === "pending");
  const submitted = visible.filter((a) => a.status === "submitted");
  const groups = groupByBucket(pending, (a) => a.due_date);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!quick.title.trim()) return titleRef.current?.focus();
    setError(null);
    try {
      await assignmentsApi.add(studentId, { ...quick, estimated_hours: quick.estimated_hours ? Number(quick.estimated_hours) : null, status: "pending" });
      setQuick(blankAsg(quick.subject));
      onChange();
      titleRef.current?.focus();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggle(a: Assignment, el: HTMLElement) {
    const res = await assignmentsApi.update(studentId, a.id, { status: a.status === "pending" ? "submitted" : "pending" });
    if (res._xp) announceXp(res._xp, res._xp > 0 ? `Submitted “${a.title}”` : undefined);
    if (a.status === "pending") celebrateFrom(el);
    onChange();
  }

  return (
    <div className="space-y-5">
      <Card padded={false} className="p-4">
        <form onSubmit={add} className="grid gap-2 md:grid-cols-[2fr_1.1fr_1fr_0.9fr_auto]">
          <input ref={titleRef} className="input" placeholder="New assignment, e.g. ER diagram for library system" value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} aria-label="Assignment title" />
          <SubjectSelect subjects={subjects} value={quick.subject} onChange={(v) => setQuick({ ...quick, subject: v })} />
          <input className="input" type="date" value={quick.due_date} onChange={(e) => setQuick({ ...quick, due_date: e.target.value })} aria-label="Due date" />
          <select className="input" value={quick.priority} onChange={(e) => setQuick({ ...quick, priority: e.target.value as Priority })} aria-label="Priority">
            <option value="high">High priority</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <Button type="submit" variant="night"><Plus size={16} /> Add</Button>
        </form>
        {error && <p className="mt-2 text-sm text-ember-600">{error}</p>}
        <p className="mt-2 px-1 text-xs text-mist-600">It goes straight into your plan. Tip: press Ctrl K anywhere and type “OS assignment due friday”.</p>
      </Card>

      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {["all", ...subjects].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={cn("chip", filter === s ? "border-night-700 bg-night-700 text-white" : "border-mist-200 bg-white text-dusk-700 hover:border-dusk-300")}>
              {s === "all" ? "All subjects" : s}
            </button>
          ))}
        </div>
      )}

      {pending.length === 0 && submitted.length === 0 ? (
        <Card><EmptyState doodle="pencil" title="No assignments yet" description="Add one above and it will be scheduled across the days before it's due." /></Card>
      ) : pending.length === 0 ? (
        <Card><EmptyState doodle="check" title="Everything submitted" description="Nothing pending — enjoy it." /></Card>
      ) : (
        BUCKETS.map((bucket) =>
          groups[bucket].length ? (
            <section key={bucket}>
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <h3 className={cn("font-display text-lg font-semibold", bucket === "overdue" ? "text-ember-600" : "text-night-700")}>{BUCKET_META[bucket].label}</h3>
                <span className="text-sm text-mist-600">{groups[bucket].length}</span>
                {BUCKET_META[bucket].hint && <span className="text-xs text-mist-500">· {BUCKET_META[bucket].hint}</span>}
              </div>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {groups[bucket].map((a) => (
                    <AssignmentRow key={a.id} a={a} info={sessions[a.id]} onToggle={toggle} onEdit={() => setEditing(a)} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ) : null
        )
      )}

      {submitted.length > 0 && (
        <section>
          <button onClick={() => setShowDone((s) => !s)} className="flex items-center gap-2 px-1 font-display text-lg font-semibold text-dusk-600">
            <ChevronDown size={18} className={cn("transition", showDone && "rotate-180")} /> Submitted <span className="text-sm font-normal text-mist-600">{submitted.length}</span>
          </button>
          <AnimatePresence>
            {showDone && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
                {submitted.map((a) => <AssignmentRow key={a.id} a={a} onToggle={toggle} onEdit={() => setEditing(a)} />)}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}

      <AssignmentEditor studentId={studentId} item={editing} subjects={subjects} onClose={() => setEditing(null)} onSaved={onChange} />
    </div>
  );
}

function AssignmentRow({ a, info, onToggle, onEdit }: { a: Assignment; info?: { next?: ScheduleBlock; count: number; minutes: number }; onToggle: (a: Assignment, el: HTMLElement) => void; onEdit: () => void }) {
  const done = a.status === "submitted";
  const u = urgencyLabel(a.due_date);
  const est = a.estimated_hours || 0;
  const logged = a.hours_logged || 0;
  const planned = (info?.minutes || 0) / 60;
  const total = est || logged + planned;
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className={cn("group flex items-center gap-4 rounded-3xl p-4 shadow-paper ring-1 transition", done ? "bg-white/60 ring-mist-100" : "bg-white ring-white hover:shadow-lift")}>
      <button
        onClick={(e) => onToggle(a, e.currentTarget)}
        aria-label={done ? `Mark ${a.title} as not submitted` : `Mark ${a.title} as submitted`}
        className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition", done ? "marble-sand text-night-700" : "text-transparent ring-2 ring-mist-300 hover:text-dusk-500 hover:ring-dusk-400")}
      >
        <Check size={18} strokeWidth={3} />
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[a.priority])} title={`${a.priority} priority`} />
          <p className={cn("truncate text-[15px] font-semibold", done ? "text-mist-500 line-through" : "text-night-700")}>{a.title}</p>
          {a.subject && <span className="rounded-full bg-dusk-50 px-2 py-0.5 text-[11px] font-bold text-dusk-600">{a.subject}</span>}
        </div>
        {!done && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <NextSession info={info} />
            {total > 0 && (
              <span className="flex items-center gap-2 text-xs text-mist-600">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-mist-100">
                  <span className="block h-full rounded-full bg-sand-500" style={{ width: `${Math.min(100, (logged / total) * 100)}%` }} />
                </span>
                {logged}h of ~{Math.round(total * 10) / 10}h
              </span>
            )}
          </div>
        )}
      </button>
      {!done && <Badge tone={u.tone}>{u.label}</Badge>}
      <Pencil size={15} className="hidden shrink-0 text-mist-400 group-hover:block" />
    </motion.li>
  );
}

function SubjectSelect({ subjects, value, onChange }: { subjects: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input className="input" list="subject-list" placeholder="Subject" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Subject" />
      <datalist id="subject-list">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

function AssignmentEditor({ studentId, item, subjects, onClose, onSaved }: { studentId: string; item: Assignment | null; subjects: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AsgForm>(blankAsg());
  useEffect(() => {
    if (item) setForm({ title: item.title, subject: item.subject || "", due_date: item.due_date || "", priority: item.priority, estimated_hours: item.estimated_hours ? String(item.estimated_hours) : "", notes: item.notes || "" });
  }, [item]);
  if (!item) return null;
  async function save() {
    await assignmentsApi.update(studentId, item!.id, { ...form, estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null } as any);
    onSaved();
    onClose();
  }
  async function remove() {
    await assignmentsApi.remove(studentId, item!.id);
    onSaved();
    onClose();
  }
  return (
    <Modal open={!!item} onClose={onClose} title="Edit assignment" description="Changes re-plan your week straight away.">
      <div className="space-y-4">
        <label className="block"><span className="label">Title</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Subject</span><SubjectSelect subjects={subjects} value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} /></label>
          <label className="block"><span className="label">Due date</span><input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
        </div>
        <div>
          <span className="label">Priority</span>
          <div className="grid grid-cols-3 gap-2">
            {(["low", "medium", "high"] as Priority[]).map((p) => (
              <button key={p} onClick={() => setForm({ ...form, priority: p })} className={cn("flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold capitalize transition", form.priority === p ? "marble-night text-white" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200")}>
                <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[p])} /> {p}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="label">How many hours will it take? <span className="font-normal text-mist-500">(optional — otherwise estimated)</span></span>
          <input className="input" type="number" min={0} step={0.5} value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} placeholder="e.g. 3" />
        </label>
        <label className="block"><span className="label">Notes</span><textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Questions, links, what's left…" /></label>
        <div className="flex gap-2 pt-2">
          <Button variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Button>
          <Button variant="night" className="flex-1" onClick={save}>Save changes</Button>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- projects */

const STAGES: { key: Project["status"]; label: string }[] = [
  { key: "pending", label: "Not started" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Done" },
];

function ProjectsTab({ studentId, items, subjects, sessions, onChange }: { studentId: string; items: Project[]; subjects: string[]; sessions: ReturnType<typeof useNextSessions>; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", subject: subjects[0] || "", description: "", due_date: "", priority: "medium" as Priority, estimated_hours: "" });

  async function add() {
    if (!form.title.trim()) return;
    await projectsApi.add(studentId, { ...form, estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null, status: "pending" });
    setOpen(false);
    setForm({ ...form, title: "", description: "", due_date: "", estimated_hours: "" });
    onChange();
  }

  async function setStage(p: Project, status: Project["status"], el: HTMLElement) {
    if (status === p.status) return;
    const res = await projectsApi.update(studentId, p.id, { status });
    if (res._xp) announceXp(res._xp, status === "completed" ? `Completed “${p.title}”` : undefined);
    if (status === "completed") celebrateFrom(el, true);
    onChange();
  }

  return (
    <div>
      <div className="mb-5 flex justify-end"><Button variant="night" onClick={() => setOpen(true)}><Plus size={16} /> New project</Button></div>
      {items.length === 0 ? (
        <Card><EmptyState doodle="bulb" title="No projects yet" description="Mini-projects, lab projects, hackathons — add them and they'll get regular time in your plan." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => {
            const u = urgencyLabel(p.due_date);
            const stage = STAGES.findIndex((s) => s.key === p.status);
            return (
              <Card key={p.id} className={cn(p.status === "completed" && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {p.subject && <p className="text-xs font-bold text-sand-700">{p.subject}</p>}
                    <h3 className="font-display text-xl font-semibold text-night-700">{p.title}</h3>
                    {p.description && <p className="mt-1 text-sm text-mist-600">{p.description}</p>}
                  </div>
                  <button aria-label={`Delete ${p.title}`} onClick={async () => { await projectsApi.remove(studentId, p.id); onChange(); }} className="rounded-xl p-2 text-mist-400 transition hover:bg-ember-50 hover:text-ember-500"><Trash2 size={16} /></button>
                </div>
                <div className="mt-4 flex items-center gap-1 rounded-2xl bg-mist-100 p-1">
                  {STAGES.map((s, i) => (
                    <button key={s.key} onClick={(e) => setStage(p, s.key, e.currentTarget)} className={cn("relative flex-1 rounded-xl py-2 text-xs font-bold transition", i <= stage ? "text-white" : "text-dusk-600 hover:text-night-700")}>
                      {i <= stage && <motion.span layoutId={`stage-${p.id}`} className={cn("absolute inset-0 rounded-xl", i === stage ? (s.key === "completed" ? "marble-sand" : "marble-night") : "")} />}
                      <span className={cn("relative", i === stage && s.key === "completed" && "text-night-700")}>{s.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  {p.status !== "completed" ? <NextSession info={sessions[p.id]} /> : <span className="text-xs font-semibold text-sand-700">Finished 🎉</span>}
                  {p.due_date && p.status !== "completed" && <Badge tone={u.tone}>{u.label}</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New project" description="Projects get steady time spread up to their due date.">
        <div className="space-y-4">
          <label className="block"><span className="label">Project name</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Movie recommender" /></label>
          <label className="block"><span className="label">What is it?</span><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional one-liner" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Subject</span><SubjectSelect subjects={subjects} value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} /></label>
            <label className="block"><span className="label">Due date</span><input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
          </div>
          <label className="block"><span className="label">Estimated hours <span className="font-normal text-mist-500">(optional)</span></span><input className="input" type="number" min={0} step={1} value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} placeholder="e.g. 12" /></label>
          <Button variant="night" className="w-full" onClick={add}>Add project</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ exams */

function ExamsTab({ studentId, items, subjects, sessions, onChange }: { studentId: string; items: Exam[]; subjects: string[]; sessions: ReturnType<typeof useNextSessions>; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: subjects[0] || "", date: "", type: "internal" as Exam["type"], syllabus: "" });
  const upcoming = items.filter((e) => (daysUntil(e.date) ?? -1) >= 0);
  const past = items.filter((e) => (daysUntil(e.date) ?? -1) < 0);

  async function add() {
    if (!form.subject.trim() || !form.date) return;
    await examsApi.add(studentId, form);
    setOpen(false);
    setForm({ ...form, date: "", syllabus: "" });
    onChange();
  }

  return (
    <div>
      <div className="mb-5 flex justify-end"><Button variant="night" onClick={() => setOpen(true)}><Plus size={16} /> Add exam</Button></div>
      {upcoming.length === 0 ? (
        <Card><EmptyState doodle="book" title="No upcoming exams" description="Add an exam and prep sessions are planned on the days before it." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((e, i) => {
            const d = daysUntil(e.date) ?? 0;
            const info = sessions[e.id];
            return (
              <motion.div key={e.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn("relative overflow-hidden rounded-4xl p-6 shadow-paper", i === 0 ? "marble-night text-white" : "bg-white ring-1 ring-white")}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className={cn("text-xs font-bold capitalize", i === 0 ? "text-sand-300" : "text-sand-700")}>{e.type} exam</p>
                    <h3 className="font-display text-2xl font-semibold">{e.subject}</h3>
                    <p className={cn("text-sm", i === 0 ? "text-mist-300" : "text-mist-600")}>{formatDate(e.date, { weekday: "long", day: "numeric", month: "long" })}</p>
                  </div>
                  <div className={cn("grid h-16 w-16 place-items-center rounded-3xl text-center", i === 0 ? "marble-sand text-night-700" : "bg-mist-50 text-night-700 ring-1 ring-mist-200")}>
                    <div>
                      <p className="font-display text-2xl font-semibold leading-none">{d}</p>
                      <p className="text-[10px] font-bold">{d === 1 ? "day" : "days"}</p>
                    </div>
                  </div>
                </div>
                {e.syllabus && <p className={cn("mt-3 text-sm", i === 0 ? "text-mist-200" : "text-dusk-700")}>{e.syllabus}</p>}
                <div className={cn("mt-4 flex items-center justify-between border-t pt-3 text-xs font-semibold", i === 0 ? "border-white/10 text-mist-200" : "border-mist-100 text-dusk-600")}>
                  <span>{info?.count ? `${info.count} prep session${info.count > 1 ? "s" : ""} · ${Math.round(info.minutes / 6) / 10}h planned` : d === 0 ? "Today — good luck!" : "Prep starts soon"}</span>
                  <button aria-label={`Delete ${e.subject} exam`} onClick={async () => { await examsApi.remove(studentId, e.id); onChange(); }} className="rounded-lg p-1 opacity-60 transition hover:opacity-100"><Trash2 size={15} /></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      {past.length > 0 && <p className="mt-6 px-1 text-sm text-mist-600">{past.length} past exam{past.length > 1 ? "s" : ""} hidden.</p>}
      <Modal open={open} onClose={() => setOpen(false)} title="Add exam" description="Prep sessions are scheduled automatically on the days before.">
        <div className="space-y-4">
          <label className="block"><span className="label">Subject</span><SubjectSelect subjects={subjects} value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Date</span><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="block"><span className="label">Type</span>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Exam["type"] })}>
                <option value="internal">Internal / mid-sem</option>
                <option value="external">External / end-sem</option>
              </select>
            </label>
          </div>
          <label className="block"><span className="label">Syllabus <span className="font-normal text-mist-500">(optional)</span></span><input className="input" value={form.syllabus} onChange={(e) => setForm({ ...form, syllabus: e.target.value })} placeholder="e.g. Units 1–3" /></label>
          <Button variant="night" className="w-full" onClick={add} disabled={!form.subject || !form.date}>Add exam</Button>
        </div>
      </Modal>
    </div>
  );
}

/* --------------------------------------------------------------- subjects */

function SubjectsTab({ studentId, subjects, assignments, exams, onChange }: { studentId: string; subjects: string[]; assignments: Assignment[]; exams: Exam[]; onChange: () => void }) {
  const [draft, setDraft] = useState("");
  async function save(next: string[]) {
    await updateSettings(studentId, { subjects: next });
    onChange();
  }
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !subjects.includes(draft.trim())) { save([...subjects, draft.trim()]); setDraft(""); } }} className="mb-5 flex gap-2">
        <input className="input max-w-sm" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a subject, e.g. Computer Networks" />
        <Button type="submit" variant="night"><Plus size={16} /> Add</Button>
      </form>
      {subjects.length === 0 ? (
        <Card><EmptyState doodle="book" title="No subjects yet" description="Add the subjects you're taking this semester." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s, i) => {
            const pending = assignments.filter((a) => a.subject === s && a.status === "pending").length;
            const nextExam = exams.filter((e) => e.subject === s && (daysUntil(e.date) ?? -1) >= 0)[0];
            const marble = ["marble-night text-white", "marble-dusk text-white", "marble-sand text-night-700", "marble-mist text-night-700"][i % 4];
            return (
              <div key={s} className={cn("group relative overflow-hidden rounded-4xl p-6 shadow-paper", marble)}>
                <button aria-label={`Remove ${s}`} onClick={() => save(subjects.filter((x) => x !== s))} className="absolute right-4 top-4 rounded-xl p-1.5 opacity-0 transition hover:bg-black/10 group-hover:opacity-100"><X size={16} /></button>
                <BookOpen size={20} className="opacity-70" />
                <h3 className="mt-3 font-display text-2xl font-semibold">{s}</h3>
                <p className="mt-3 text-sm opacity-80">{pending} pending assignment{pending !== 1 ? "s" : ""}</p>
                <p className="text-sm opacity-80">{nextExam ? `Exam ${relativeDay(nextExam.date).toLowerCase()}` : "No exam scheduled"}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
