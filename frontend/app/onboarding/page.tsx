"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { getStudent, updateProfile, setTimetable } from "@/lib/api";
import { getStudentId } from "@/lib/session";
import { celebrate } from "@/lib/celebrate";
import Button from "@/components/Button";
import TagInput from "@/components/TagInput";
import Spinner, { PageLoader } from "@/components/Spinner";
import Logo from "@/components/brand/Logo";
import Moon from "@/components/brand/Moon";
import { DoodleField } from "@/components/brand/Doodles";
import { cn, formatHour, firstName } from "@/lib/utils";

const STEPS = [
  { title: "The basics", hint: "So the planner knows where you are in your degree." },
  { title: "This semester's subjects", hint: "Assignments and exams get filed under these." },
  { title: "Goals & skills", hint: "Used to recommend courses and match you to jobs." },
  { title: "Your study rhythm", hint: "Your plan will never ask for more than this." },
];
const SUBJECT_IDEAS = ["DBMS", "Operating Systems", "Computer Networks", "Machine Learning", "Data Structures", "Mathematics", "Physics", "Economics"];
const GOAL_IDEAS = ["crack placements", "get into AI/ML", "improve CGPA", "learn web development", "prepare for GATE", "get an internship"];
const SKILL_IDEAS = ["python", "java", "c++", "sql", "javascript", "react", "data structures", "git", "excel"];
const START_HOURS = [6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 20, 21];

export default function OnboardingPage() {
  const router = useRouter();
  const [studentId, setId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", degree: "B.Tech", branch: "", year: 1, semester: 1,
    subjects: [] as string[], goals: [] as string[], skills: [] as string[],
    study_hours_per_day: 3, preferred_start_hour: 18,
  });
  const [classes, setClasses] = useState({ on: true, start: "09:00", end: "16:00" });

  useEffect(() => {
    const id = getStudentId();
    if (!id) {
      router.replace("/signup");
      return;
    }
    setId(id);
    getStudent(id)
      .then((s) => {
        if (s.profile?.onboarded) router.replace("/dashboard");
        setForm((f) => ({ ...f, name: s.profile?.name || f.name }));
      })
      .catch(() => router.replace("/signup"));
  }, [router]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const canNext = step !== 0 || (form.name.trim() && form.branch.trim());

  function go(delta: number) {
    setDir(delta);
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + delta)));
  }

  async function finish() {
    if (!studentId) return;
    setBusy(true);
    setError("");
    try {
      await updateProfile(studentId, { ...form, onboarded: true });
      if (classes.on && classes.end > classes.start) {
        await setTimetable(studentId, [0, 1, 2, 3, 4].map((day) => ({ day, start: classes.start, end: classes.end, label: "Classes" })));
      }
      celebrate({ big: true });
      setTimeout(() => router.push("/dashboard"), 700);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!studentId) return <PageLoader />;

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 md:py-12">
      <DoodleField count={18} seed={77} />
      <div className="relative mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <span className="text-sm font-semibold text-mist-600">Step {step + 1} of {STEPS.length}</span>
        </div>

        <div className="mb-6 flex gap-2" aria-hidden="true">
          {STEPS.map((_, i) => (
            <div key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-mist-200">
              <motion.div className="marble-night h-full" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.5 }} />
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-4xl bg-white shadow-lift ring-1 ring-mist-100">
          <div className="marble-night relative flex items-center justify-between gap-4 overflow-hidden px-7 py-6">
            <DoodleField count={5} seed={step + 3} tone="dark" />
            <div className="relative">
              <h1 className="font-display text-2xl font-semibold text-white md:text-3xl">
                {step === 0 ? `Hi ${firstName(form.name)} — let's set you up` : STEPS[step].title}
              </h1>
              <p className="mt-1 text-sm text-mist-300">{STEPS[step].hint}</p>
            </div>
            <div className="relative shrink-0"><Moon value={(step + 1) / STEPS.length} size={64} glow={false} showCraters={false} /></div>
          </div>

          <div className="min-h-[21rem] p-7">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={step}
                custom={dir}
                initial={{ opacity: 0, x: dir * 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -40 }}
                transition={{ duration: 0.25 }}
              >
                {step === 0 && (
                  <div className="space-y-5">
                    <label className="block">
                      <span className="label">Full name</span>
                      <input className="input h-12" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ananya Rao" />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="label">Degree</span>
                        <select className="input h-12" value={form.degree} onChange={(e) => set("degree", e.target.value)}>
                          {["B.Tech", "B.E.", "B.Sc", "BCA", "B.Com", "BBA", "M.Tech", "MCA", "MBA", "Other"].map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="label">Branch or stream</span>
                        <input className="input h-12" value={form.branch} onChange={(e) => set("branch", e.target.value)} placeholder="e.g. Computer Science" list="branches" />
                        <datalist id="branches">
                          {["Computer Science", "Information Technology", "Electronics", "Mechanical", "Civil", "Electrical", "Data Science"].map((b) => <option key={b} value={b} />)}
                        </datalist>
                      </label>
                    </div>
                    <div>
                      <span className="label">Year</span>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((y) => (
                          <button key={y} type="button" onClick={() => set("year", y)} className={cn("h-11 flex-1 rounded-2xl text-sm font-bold transition", form.year === y ? "marble-night text-white shadow-night" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200 hover:ring-dusk-300")}>
                            {y}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="label">Semester</span>
                      <div className="grid grid-cols-8 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                          <button key={s} type="button" onClick={() => set("semester", s)} className={cn("h-10 rounded-xl text-sm font-bold transition", form.semester === s ? "marble-sand text-night-700 shadow-sand" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200 hover:ring-dusk-300")}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div>
                    <span className="label">Type a subject and press Enter, or tap a suggestion</span>
                    <TagInput values={form.subjects} onChange={(v) => set("subjects", v)} placeholder="e.g. Machine Learning" suggestions={SUBJECT_IDEAS} />
                    <p className="mt-5 text-sm text-mist-600">You can change these any time in Settings.</p>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div>
                      <span className="label">What are you aiming for?</span>
                      <TagInput values={form.goals} onChange={(v) => set("goals", v)} placeholder="Add a goal…" suggestions={GOAL_IDEAS} />
                    </div>
                    <div>
                      <span className="label">Skills you already have</span>
                      <TagInput values={form.skills} onChange={(v) => set("skills", v)} placeholder="e.g. python" suggestions={SKILL_IDEAS} />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-7">
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="label">Study time per day</span>
                        <span className="font-display text-2xl font-semibold text-night-700">{form.study_hours_per_day}h</span>
                      </div>
                      <input type="range" min={1} max={8} step={0.5} value={form.study_hours_per_day} onChange={(e) => set("study_hours_per_day", Number(e.target.value))} className="w-full accent-dusk-500" aria-label="Study hours per day" />
                      <div className="flex justify-between text-[11px] font-semibold text-mist-500"><span>1h</span><span>8h</span></div>
                    </div>
                    <div>
                      <span className="label">Usually start studying at</span>
                      <div className="flex flex-wrap gap-1.5">
                        {START_HOURS.map((h) => (
                          <button key={h} type="button" onClick={() => set("preferred_start_hour", h)} className={cn("rounded-xl px-3 py-2 text-sm font-bold transition", form.preferred_start_hour === h ? "marble-night text-white" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200 hover:ring-dusk-300")}>
                            {formatHour(h)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl bg-mist-50 p-4 ring-1 ring-mist-200">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input type="checkbox" checked={classes.on} onChange={(e) => setClasses({ ...classes, on: e.target.checked })} className="h-5 w-5 accent-dusk-500" />
                        <span className="text-sm font-semibold text-night-700">I have classes Monday–Friday</span>
                      </label>
                      {classes.on && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-dusk-700">
                          from <input type="time" className="input !w-auto !py-1.5" value={classes.start} onChange={(e) => setClasses({ ...classes, start: e.target.value })} />
                          to <input type="time" className="input !w-auto !py-1.5" value={classes.end} onChange={(e) => setClasses({ ...classes, end: e.target.value })} />
                        </div>
                      )}
                      <p className="mt-2 text-xs text-mist-600">Sessions are never planned during classes. Add exact lectures later in Settings.</p>
                    </div>
                    <div className="rounded-3xl bg-sand-50 p-4 ring-1 ring-sand-200">
                      <p className="text-sm font-semibold text-night-700">A typical day will look like</p>
                      <div className="mt-3 flex h-8 overflow-hidden rounded-xl bg-white ring-1 ring-sand-200">
                        {Array.from({ length: Math.ceil(form.study_hours_per_day) }).map((_, i, arr) => (
                          <motion.div key={i} layout className="flex flex-1 items-center gap-1 border-r-4 border-white px-2 last:border-r-0">
                            <div className={cn("h-4 w-full rounded-md", i % 3 === 0 ? "bg-dusk-500" : i % 3 === 1 ? "bg-night-700" : "bg-sand-500", i === arr.length - 1 && form.study_hours_per_day % 1 ? "w-1/2" : "")} />
                          </motion.div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-sand-800">
                        {(() => {
                          const [ch, cm] = classes.end.split(":").map(Number);
                          const [sh, sm] = classes.start.split(":").map(Number);
                          const classEnd = ch + cm / 60;
                          const inClass = classes.on && form.preferred_start_hour >= sh + sm / 60 && form.preferred_start_hour < classEnd;
                          const start = inClass ? classEnd : form.preferred_start_hour;
                          const end = Math.min(23, start + form.study_hours_per_day + Math.max(0, Math.ceil(form.study_hours_per_day) - 1) * 0.25);
                          return `${inClass ? "On class days, after classes: " : ""}${formatHour(start)} → about ${formatHour(end)}, in hour-long sessions with 15-minute breaks.`;
                        })()}
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            {error && <p className="mt-4 rounded-2xl bg-ember-50 px-4 py-3 text-sm text-ember-600">{error}</p>}
          </div>

          <div className="flex items-center justify-between border-t border-mist-100 px-7 py-5">
            <Button variant="ghost" onClick={() => go(-1)} className={step === 0 ? "invisible" : ""}>
              <ArrowLeft size={16} /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="night" onClick={() => canNext && go(1)} disabled={!canNext}>
                {step === 1 && form.subjects.length === 0 ? "Skip for now" : "Continue"} <ArrowRight size={16} />
              </Button>
            ) : (
              <Button variant="gold" onClick={finish} disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : <Check size={16} />} Build my plan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
