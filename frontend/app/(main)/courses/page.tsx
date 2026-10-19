"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, Sparkles, GraduationCap, Check, Clock } from "lucide-react";
import { trackedCoursesApi, getRecommendedCourses } from "@/lib/api";
import { notifyDataChanged, announceXp } from "@/lib/events";
import { celebrateFrom } from "@/lib/celebrate";
import type { TrackedCourse, RecommendedCourse } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import ProgressRing from "@/components/ProgressRing";
import { PageLoader } from "@/components/Spinner";
import { cn } from "@/lib/utils";

const STATUS: { key: TrackedCourse["status"]; label: string }[] = [
  { key: "pending", label: "Planned" },
  { key: "ongoing", label: "Learning" },
  { key: "completed", label: "Completed" },
];

export default function CoursesPage() {
  const { studentId, profile } = useStudent();
  const [courses, setCourses] = useState<TrackedCourse[] | null>(null);
  const [recs, setRecs] = useState<RecommendedCourse[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", provider: "" });

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([trackedCoursesApi.list(studentId), getRecommendedCourses(studentId)]);
    setCourses(c);
    setRecs(r.filter((x) => !c.some((t) => t.name === x.name)));
  }, [studentId]);
  useEffect(() => {
    load();
  }, [load]);

  async function update(c: TrackedCourse, updates: Partial<TrackedCourse>, el?: HTMLElement) {
    setCourses((list) => list?.map((x) => (x.id === c.id ? { ...x, ...updates } : x)) ?? null);
    const res = await trackedCoursesApi.update(studentId, c.id, updates);
    if (res._xp) announceXp(res._xp, res._xp > 0 ? `Completed ${c.name}` : undefined);
    if (updates.status === "completed" && c.status !== "completed") celebrateFrom(el || null, true);
    notifyDataChanged();
  }

  async function add(name: string, provider = "") {
    await trackedCoursesApi.add(studentId, { name, provider, status: "pending", progress: 0 });
    await load();
    notifyDataChanged();
  }

  if (!courses) return (<><TopBar title="Courses" /><PageLoader /></>);

  return (
    <div>
      <TopBar title="Courses" subtitle="Track online courses and discover ones that fit your goals" right={<Button size="sm" variant="night" onClick={() => setOpen(true)}><Plus size={15} /> Add course</Button>} />
      <div className="space-y-8 p-4 md:p-8">
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl font-semibold text-night-700">My learning</h2>
            <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => setOpen(true)}><Plus size={15} /> Add</Button>
          </div>
          {courses.length === 0 ? (
            <Card><EmptyState doodle="book" title="No courses yet" description="Add one from the recommendations below, or add your own." /></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence>
                {courses.map((c) => {
                  const pct = c.status === "completed" ? 100 : Math.round(c.progress || 0);
                  return (
                    <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="paper-card p-5">
                      <div className="flex items-start gap-4">
                        <ProgressRing value={pct} size={64} strokeWidth={6} color={pct === 100 ? "#A68868" : "#4B6382"}>
                          <span className="text-sm font-bold text-night-700">{pct}%</span>
                        </ProgressRing>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display text-lg font-semibold leading-snug text-night-700">{c.name}</h3>
                          {c.provider && <p className="text-xs text-mist-600">{c.provider}</p>}
                        </div>
                        <button aria-label={`Remove ${c.name}`} onClick={async () => { setCourses((l) => l?.filter((x) => x.id !== c.id) ?? null); await trackedCoursesApi.remove(studentId, c.id); load(); }} className="rounded-xl p-1.5 text-mist-400 transition hover:bg-ember-50 hover:text-ember-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {c.status !== "completed" && (
                        <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setCourses((l) => l?.map((x) => (x.id === c.id ? { ...x, progress: Number(e.target.value), status: x.status === "pending" ? "ongoing" : x.status } : x)) ?? null)}
                          onMouseUp={(e) => update(c, { progress: Number((e.target as HTMLInputElement).value), status: "ongoing" })}
                          onTouchEnd={(e) => update(c, { progress: Number((e.target as HTMLInputElement).value), status: "ongoing" })}
                          onKeyUp={(e) => update(c, { progress: Number((e.target as HTMLInputElement).value), status: "ongoing" })}
                          className="mt-4 w-full accent-dusk-500" aria-label={`${c.name} progress`} />
                      )}
                      <div className="mt-3 flex gap-1 rounded-2xl bg-mist-100 p-1">
                        {STATUS.map((s) => (
                          <button key={s.key} onClick={(e) => update(c, { status: s.key, progress: s.key === "completed" ? 100 : c.progress }, e.currentTarget)} className={cn("flex-1 rounded-xl py-1.5 text-xs font-bold transition", c.status === s.key ? (s.key === "completed" ? "marble-sand text-night-700" : "bg-white text-night-700 shadow-paper") : "text-dusk-600 hover:text-night-700")}>
                            {s.key === "completed" && c.status === s.key && <Check size={12} className="mr-1 inline" />}{s.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

        <section>
          <Card className="!p-0 overflow-hidden">
            <div className="marble-night px-6 py-6 md:px-8">
              <div className="flex items-center gap-3">
                <span className="marble-sand grid h-10 w-10 place-items-center rounded-2xl text-night-700"><Sparkles size={18} /></span>
                <div>
                  <h2 className="font-display text-2xl font-semibold text-white">Picked for you</h2>
                  <p className="text-sm text-mist-300">Matched to {profile.branch || "your branch"}{profile.goals?.length ? `, “${profile.goals.slice(0, 2).join("”, “")}”` : ""} and your skills.</p>
                </div>
              </div>
            </div>
            <div className="p-5 md:p-6">
              {recs.length === 0 ? (
                <EmptyState doodle="bulb" title="No recommendations right now" description="Add goals or skills in Settings to get personalised picks." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {recs.map((r, i) => (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex flex-col rounded-3xl bg-mist-50/80 p-5 ring-1 ring-mist-100 transition hover:bg-white hover:shadow-lift">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-sand-700">{r.provider}</p>
                          <h3 className="font-display text-lg font-semibold leading-snug text-night-700">{r.name}</h3>
                        </div>
                        <ProgressRing value={Math.min(100, r.match_score * 250)} size={48} strokeWidth={5} color="#A68868">
                          <span className="text-[10px] font-bold text-night-700">{i === 0 ? "Top" : `#${i + 1}`}</span>
                        </ProgressRing>
                      </div>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-dusk-700">{r.description}</p>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <div className="flex gap-1.5">
                          <Badge tone="neutral"><Clock size={11} /> {r.duration_weeks} wks</Badge>
                          <Badge tone="info" className="capitalize">{r.level}</Badge>
                        </div>
                        <Button size="sm" variant="night" onClick={() => add(r.name, r.provider)}><Plus size={14} /> Add</Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a course" description="Anything you're learning — Coursera, NPTEL, YouTube playlists…">
        <div className="space-y-4">
          <label className="block"><span className="label">Course name</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. NPTEL Data Mining" /></label>
          <label className="block"><span className="label">Where</span><input className="input" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="e.g. NPTEL" /></label>
          <Button variant="night" className="w-full" disabled={!form.name.trim()} onClick={async () => { await add(form.name.trim(), form.provider.trim()); setForm({ name: "", provider: "" }); setOpen(false); }}>
            <GraduationCap size={16} /> Add course
          </Button>
        </div>
      </Modal>
    </div>
  );
}
