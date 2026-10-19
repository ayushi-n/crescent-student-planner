"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Trash2, CornerDownLeft, ChevronDown, CalendarClock, Flag } from "lucide-react";
import { todosApi, sendChatMessage, getPlan } from "@/lib/api";
import { notifyDataChanged, announceXp, useDataChanged } from "@/lib/events";
import { celebrateFrom } from "@/lib/celebrate";
import type { Todo, Priority, Schedule } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import Spinner, { PageLoader } from "@/components/Spinner";
import { DoodleField } from "@/components/brand/Doodles";
import { BUCKET_META, cn, deadlineBucket, groupByBucket, relativeDay, urgencyLabel, type DeadlineBucket } from "@/lib/utils";

type Filter = "all" | "today" | "week" | "high";
const BUCKETS: DeadlineBucket[] = ["overdue", "today", "this_week", "later", "no_date"];
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export default function TodosPage() {
  const { studentId } = useStudent();
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([todosApi.list(studentId), getPlan(studentId)]);
    setTodos(t);
    setSchedule(s);
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);
  useDataChanged(load);

  const nextSlot = useMemo(() => {
    const m: Record<string, string> = {};
    if (!schedule) return m;
    for (const k of Object.keys(schedule.days).sort())
      for (const b of schedule.days[k]) if (!b.done && !m[b.ref_id]) m[b.ref_id] = `${relativeDay(k)} ${b.start}`;
    return m;
  }, [schedule]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      // The assistant parses dates like "tomorrow" / "by friday" out of the text.
      const prefix = priority === "high" ? "urgent " : priority === "low" ? "low priority " : "";
      const res = await sendChatMessage(studentId, `remind me to ${prefix}${t}`);
      const item = res.action_taken?.item as Todo | undefined;
      setFeedback(item ? `Added “${item.title}”${item.due_date ? ` for ${relativeDay(item.due_date).toLowerCase()}` : ""}.` : res.reply);
      setText("");
      setPriority("medium");
      notifyDataChanged();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function toggle(t: Todo, el: HTMLElement) {
    setTodos((list) => list?.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) ?? null);
    const res = await todosApi.update(studentId, t.id, { done: !t.done });
    if (res._xp) announceXp(res._xp, res._xp > 0 ? t.title : undefined);
    if (!t.done) celebrateFrom(el);
    notifyDataChanged();
  }

  async function remove(t: Todo) {
    setTodos((list) => list?.filter((x) => x.id !== t.id) ?? null);
    await todosApi.remove(studentId, t.id);
    notifyDataChanged();
  }

  async function cyclePriority(t: Todo) {
    const next: Priority = t.priority === "low" ? "medium" : t.priority === "medium" ? "high" : "low";
    setTodos((list) => list?.map((x) => (x.id === t.id ? { ...x, priority: next } : x)) ?? null);
    await todosApi.update(studentId, t.id, { priority: next });
    notifyDataChanged();
  }

  if (!todos) return (<><TopBar title="To-dos" /><PageLoader /></>);

  const pending = todos
    .filter((t) => !t.done)
    .filter((t) => {
      if (filter === "today") return ["overdue", "today"].includes(deadlineBucket(t.due_date));
      if (filter === "week") return ["overdue", "today", "this_week"].includes(deadlineBucket(t.due_date));
      if (filter === "high") return t.priority === "high";
      return true;
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const done = todos.filter((t) => t.done);
  const groups = groupByBucket(pending, (t) => t.due_date);
  const total = todos.length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;

  return (
    <div>
      <TopBar title="To-dos" subtitle="Life admin and small tasks — they slot into your plan too" />
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <section className="marble-night relative overflow-hidden rounded-4xl p-6 md:p-8">
          <DoodleField count={8} seed={12} tone="dark" names={["check", "pencil", "star", "coffee", "sparkle"]} />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-semibold text-white">What's on your mind?</h2>
              <p className="mt-1 text-sm text-mist-300">Write it like a note — “submit lab record by friday”, “call home tomorrow”.</p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl font-semibold text-sand-300">{pct}%</p>
              <p className="text-xs text-mist-300">{done.length} of {total} done</p>
            </div>
          </div>
          <form onSubmit={add} className="relative mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task…" aria-label="New task" className="h-14 w-full rounded-2xl bg-white/95 px-5 pr-14 text-base text-night-700 outline-none ring-4 ring-transparent transition placeholder:text-mist-500 focus:ring-sand-300/40" />
              <button type="submit" disabled={!text.trim() || busy} aria-label="Add task" className="marble-sand absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-xl text-night-700 transition disabled:opacity-40">
                {busy ? <Spinner className="h-4 w-4" /> : <CornerDownLeft size={17} />}
              </button>
            </div>
            <div className="flex gap-1 rounded-2xl bg-white/10 p-1 ring-1 ring-white/15">
              {(["low", "medium", "high"] as Priority[]).map((p) => (
                <button type="button" key={p} onClick={() => setPriority(p)} className={cn("rounded-xl px-3 text-xs font-bold capitalize transition", priority === p ? "bg-white text-night-700" : "text-mist-200 hover:text-white")}>
                  {p}
                </button>
              ))}
            </div>
          </form>
          <AnimatePresence>
            {feedback && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-3 text-sm font-medium text-sand-200">
                {feedback}
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        <div className="flex flex-wrap gap-1.5">
          {([["all", "All"], ["today", "Today"], ["week", "This week"], ["high", "High priority"]] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={cn("chip", filter === k ? "border-night-700 bg-night-700 text-white" : "border-mist-200 bg-white text-dusk-700 hover:border-dusk-300")}>
              {l}
            </button>
          ))}
        </div>

        {pending.length === 0 ? (
          <Card><EmptyState doodle="heart" title={filter === "all" ? "Nothing on your list" : "Nothing here"} description={filter === "all" ? "Add something above, or ask the assistant to remind you." : "Try another filter."} /></Card>
        ) : (
          BUCKETS.map((bucket) =>
            groups[bucket].length ? (
              <section key={bucket}>
                <h3 className={cn("mb-2 px-1 font-display text-lg font-semibold", bucket === "overdue" ? "text-ember-600" : "text-night-700")}>
                  {BUCKET_META[bucket].label} <span className="text-sm font-normal text-mist-600">{groups[bucket].length}</span>
                </h3>
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {groups[bucket].map((t) => (
                      <TodoRow key={t.id} t={t} slot={nextSlot[t.id]} onToggle={toggle} onRemove={remove} onPriority={cyclePriority} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ) : null
          )
        )}

        {done.length > 0 && (
          <section>
            <button onClick={() => setShowDone((s) => !s)} className="flex items-center gap-2 px-1 font-display text-lg font-semibold text-dusk-600">
              <ChevronDown size={18} className={cn("transition", showDone && "rotate-180")} /> Done <span className="text-sm font-normal text-mist-600">{done.length}</span>
            </button>
            <AnimatePresence>
              {showDone && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
                  {done.map((t) => <TodoRow key={t.id} t={t} onToggle={toggle} onRemove={remove} onPriority={cyclePriority} />)}
                </motion.ul>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>
    </div>
  );
}

function TodoRow({ t, slot, onToggle, onRemove, onPriority }: { t: Todo; slot?: string; onToggle: (t: Todo, el: HTMLElement) => void; onRemove: (t: Todo) => void; onPriority: (t: Todo) => void }) {
  const u = urgencyLabel(t.due_date);
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }} className={cn("group flex items-center gap-3 rounded-3xl p-3.5 pl-4 shadow-paper ring-1 transition", t.done ? "bg-white/60 ring-mist-100" : "bg-white ring-white hover:shadow-lift")}>
      <button onClick={(e) => onToggle(t, e.currentTarget)} aria-label={t.done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`} className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full transition", t.done ? "marble-sand text-night-700" : "text-transparent ring-2 ring-mist-300 hover:text-dusk-500 hover:ring-dusk-400")}>
        <Check size={15} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[15px] font-semibold transition", t.done ? "text-mist-500 line-through" : "text-night-700")}>{t.title}</p>
        {!t.done && (slot || (t.subject && t.subject !== "Personal")) && (
          <p className="mt-0.5 flex items-center gap-3 text-xs text-mist-600">
            {slot && t.schedulable && <span className="flex items-center gap-1 font-semibold text-dusk-600"><CalendarClock size={12} /> In plan: {slot}</span>}
            {t.subject && t.subject !== "Personal" && <span>{t.subject}</span>}
          </p>
        )}
      </div>
      {!t.done && (
        <button onClick={() => onPriority(t)} title={`${t.priority} priority — click to change`} aria-label={`Priority ${t.priority}, change`} className={cn("rounded-lg p-1.5 transition hover:bg-mist-50", t.priority === "high" ? "text-ember-500" : t.priority === "medium" ? "text-sand-500" : "text-mist-400")}>
          <Flag size={15} fill={t.priority === "high" ? "currentColor" : "none"} />
        </button>
      )}
      {!t.done && t.due_date && <Badge tone={u.tone}>{u.label}</Badge>}
      <button onClick={() => onRemove(t)} aria-label={`Delete ${t.title}`} className="rounded-lg p-1.5 text-mist-400 opacity-0 transition hover:bg-ember-50 hover:text-ember-500 group-hover:opacity-100 focus:opacity-100">
        <Trash2 size={15} />
      </button>
    </motion.li>
  );
}
