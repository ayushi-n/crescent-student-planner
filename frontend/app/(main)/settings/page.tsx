"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut, MessageSquareX, Sparkles, User, SlidersHorizontal, Target, ShieldCheck, Bell, Palette, CalendarPlus, GraduationCap, Cpu, Cloud, Sun, Moon as MoonIcon, Monitor } from "lucide-react";
import { updateSettings, clearChatHistory, getStudent, setCredentials, getLlmStatus, logout, downloadCalendar } from "@/lib/api";
import { clearStudentId } from "@/lib/session";
import { notifyDataChanged } from "@/lib/events";
import { getTheme, setTheme, type ThemePref } from "@/lib/theme";
import { getReminderPrefs, setReminderPrefs, askPermission, notificationsSupported } from "@/lib/reminders";
import type { LlmStatus } from "@/lib/types";
import { useStudent } from "@/components/shell/StudentContext";
import TopBar from "@/components/shell/TopBar";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import TagInput from "@/components/TagInput";
import Spinner from "@/components/Spinner";
import TimetableEditor from "@/components/plan/TimetableEditor";
import { cn, formatHour } from "@/lib/utils";

export default function SettingsPage() {
  const { studentId, profile, refresh } = useStudent();
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile.name, degree: profile.degree, branch: profile.branch, year: profile.year, semester: profile.semester,
    subjects: profile.subjects || [], goals: profile.goals || [], skills: profile.skills || [],
    study_hours_per_day: profile.study_hours_per_day, weekend_hours_per_day: profile.weekend_hours_per_day ?? profile.study_hours_per_day,
    preferred_start_hour: profile.preferred_start_hour, break_minutes: profile.break_minutes ?? 15,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ai, setAi] = useState<LlmStatus | null>(null);
  const [cleared, setCleared] = useState(false);
  const [needsCreds, setNeedsCreds] = useState(false);
  const [creds, setCreds] = useState({ email: profile.email || "", password: "" });
  const [credMsg, setCredMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [rem, setRem] = useState({ enabled: false, leadMinutes: 10 });
  const [remMsg, setRemMsg] = useState<string | null>(null);

  useEffect(() => {
    getLlmStatus().then(setAi).catch(() => setAi(null));
    getStudent(studentId).then((s) => setNeedsCreds(!!s.needs_credentials)).catch(() => {});
    setThemeState(getTheme());
    setRem(getReminderPrefs());
  }, [studentId]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    try {
      await updateSettings(studentId, form);
      await refresh();
      notifyDataChanged();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function saveCreds() {
    setCredMsg(null);
    try {
      await setCredentials(studentId, creds.email, creds.password);
      setNeedsCreds(false);
      setCreds({ ...creds, password: "" });
      setCredMsg({ ok: true, text: "Saved. Log in with this email and password from now on." });
      refresh();
    } catch (e: any) {
      setCredMsg({ ok: false, text: e.message });
    }
  }

  async function toggleReminders() {
    if (!rem.enabled) {
      const ok = await askPermission();
      if (!ok) {
        setRemMsg(notificationsSupported() ? "Notifications are blocked for this site — allow them in your browser's site settings, then try again." : "This browser doesn't support notifications.");
        return;
      }
    }
    const next = { ...rem, enabled: !rem.enabled };
    setRem(next);
    setReminderPrefs(next);
    setRemMsg(next.enabled ? "On. You'll get a reminder before each session while Crescent is open in a tab." : null);
  }

  return (
    <div>
      <TopBar title="Settings" subtitle="Your account, profile and how your plan is built" />
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        {(needsCreds || profile.demo) && (
          <Card className="ring-2 ring-sand-300">
            <CardHeader icon={<ShieldCheck size={18} />} title={profile.demo ? "Keep this demo as your account" : "Secure your account"}
              hint={profile.demo ? "Add an email and password and this demo becomes your real account." : "This account was created before logins existed. Add an email and password so only you can open it."} />
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input className="input" type="email" placeholder="you@college.edu" value={creds.email} onChange={(e) => setCreds({ ...creds, email: e.target.value })} autoComplete="email" />
              <input className="input" type="password" placeholder="Password (6+ characters)" value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} autoComplete="new-password" />
              <Button variant="night" onClick={saveCreds} disabled={!creds.email || creds.password.length < 6}>Save</Button>
            </div>
            {credMsg && <p className={cn("mt-3 text-sm", credMsg.ok ? "text-dusk-700" : "text-ember-600")}>{credMsg.text}</p>}
          </Card>
        )}

        <Card>
          <CardHeader icon={<User size={18} />} title="Profile" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="label">Name</span><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
            <label className="block"><span className="label">Email</span><input className="input bg-mist-50" value={profile.email || "Not set yet"} disabled /></label>
            <label className="block"><span className="label">Degree</span><input className="input" value={form.degree} onChange={(e) => set("degree", e.target.value)} /></label>
            <label className="block"><span className="label">Branch</span><input className="input" value={form.branch} onChange={(e) => set("branch", e.target.value)} /></label>
            <label className="block"><span className="label">Year</span>
              <select className="input" value={form.year} onChange={(e) => set("year", Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}</select>
            </label>
            <label className="block"><span className="label">Semester</span>
              <select className="input" value={form.semester} onChange={(e) => set("semester", Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => <option key={s} value={s}>Semester {s}</option>)}</select>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Target size={18} />} title="Subjects, goals & skills" hint="Used for planning, course picks and job matching" />
          <div className="space-y-5">
            <div><span className="label">Subjects</span><TagInput values={form.subjects} onChange={(v) => set("subjects", v)} placeholder="Add a subject" /></div>
            <div><span className="label">Goals</span><TagInput values={form.goals} onChange={(v) => set("goals", v)} placeholder="Add a goal" /></div>
            <div><span className="label">Skills</span><TagInput values={form.skills} onChange={(v) => set("skills", v)} placeholder="Add a skill" /></div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<SlidersHorizontal size={18} />} title="Study rhythm" hint="More options live on the Planner page" />
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block"><span className="label">Weekday hours: {form.study_hours_per_day}h</span><input type="range" min={0.5} max={10} step={0.5} value={form.study_hours_per_day} onChange={(e) => set("study_hours_per_day", Number(e.target.value))} className="w-full accent-dusk-500" /></label>
            <label className="block"><span className="label">Weekend hours: {form.weekend_hours_per_day}h</span><input type="range" min={0} max={10} step={0.5} value={form.weekend_hours_per_day ?? 0} onChange={(e) => set("weekend_hours_per_day", Number(e.target.value))} className="w-full accent-dusk-500" /></label>
            <label className="block"><span className="label">Earliest study time</span>
              <select className="input" value={form.preferred_start_hour} onChange={(e) => set("preferred_start_hour", Number(e.target.value))}>{[6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}</select>
              <span className="mt-1 block text-xs text-mist-600">Set this early (e.g. 8 AM) and add your classes below — sessions will fill the gaps between lectures.</span>
            </label>
            <div><span className="label">Break between sessions</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 5, 10, 15].map((m) => (
                  <button key={m} onClick={() => set("break_minutes", m)} className={cn("h-10 rounded-xl text-sm font-bold transition", form.break_minutes === m ? "marble-night text-white" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200")}>{m ? `${m}m` : "None"}</button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="sticky bottom-24 z-20 flex justify-end md:bottom-6">
          <Button variant="night" size="lg" onClick={save} disabled={saving} className="shadow-lift">
            {saving ? <Spinner className="h-4 w-4" /> : saved ? <Check size={18} /> : null} {saved ? "Saved — plan updated" : "Save changes"}
          </Button>
        </div>

        <div id="timetable" className="scroll-mt-24">
          <Card>
            <CardHeader icon={<GraduationCap size={18} />} title="Class timetable" hint="Your weekly classes and labs — study sessions are never placed on top of them" />
            <TimetableEditor studentId={studentId} initial={profile.timetable || []} onSaved={refresh} />
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader icon={<Bell size={18} />} title="Reminders" hint="Browser notifications while Crescent is open" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-dusk-700">Before each session, plus deadlines and placement rounds coming up.</p>
              <button role="switch" aria-checked={rem.enabled} onClick={toggleReminders} className={cn("relative h-7 w-12 shrink-0 rounded-full transition", rem.enabled ? "bg-night-700" : "bg-mist-200")}>
                <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", rem.enabled ? "left-6 bg-sand-300" : "left-1")} />
              </button>
            </div>
            {rem.enabled && (
              <label className="mt-4 block"><span className="label">Remind me</span>
                <select className="input" value={rem.leadMinutes} onChange={(e) => { const n = { ...rem, leadMinutes: Number(e.target.value) }; setRem(n); setReminderPrefs(n); }}>
                  {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} minutes before</option>)}
                </select>
              </label>
            )}
            {remMsg && <p className="mt-3 text-xs text-mist-600">{remMsg}</p>}
          </Card>

          <Card>
            <CardHeader icon={<Palette size={18} />} title="Appearance" />
            <div className="grid grid-cols-3 gap-2">
              {([["light", "Light", Sun], ["dark", "Dark", MoonIcon], ["system", "System", Monitor]] as [ThemePref, string, any][]).map(([k, l, Icon]) => (
                <button key={k} onClick={() => { setTheme(k); setThemeState(k); }} className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-bold transition", theme === k ? "marble-night text-white shadow-night" : "bg-mist-50 text-dusk-700 ring-1 ring-mist-200")}>
                  <Icon size={18} /> {l}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader icon={<Sparkles size={18} />} title="AI assistant" />
          {ai?.enabled ? (
            <div className="flex items-start gap-3">
              <span className="marble-sand grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-night-700">{ai.local ? <Cpu size={18} /> : <Cloud size={18} />}</span>
              <div className="text-sm text-dusk-700">
                <p><strong className="text-night-700">Connected:</strong> {ai.provider} · <code className="rounded bg-mist-100 px-1">{ai.model}</code>{ai.local ? " (runs on your computer — private)" : ""}</p>
                <p className="mt-1">The assistant understands anything you type and can add, move, finish or delete things and update placement rounds.</p>
                {ai.last_error && <p className="mt-2 text-ember-600">Last AI call failed: {ai.last_error}. {ai.local ? "Is Ollama running? (ollama serve)" : "Check the key in backend/.env."} Until then the built-in rules answer.</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm leading-relaxed text-dusk-700">
              <p>Running on built-in rules: it fully manages your plan, tasks and placements, but works best with clear phrasing. Connect a model for natural conversation and study help:</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-mist-50 p-4 ring-1 ring-mist-100">
                  <p className="mb-1 flex items-center gap-2 font-semibold text-night-700"><Cloud size={15} /> Cloud (free Groq key works)</p>
                  <p>In <code className="rounded bg-white px-1">backend/.env</code>:</p>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-night-700 p-3 text-xs text-sand-200">LLM_API_KEY=gsk_your_key</pre>
                </div>
                <div className="rounded-2xl bg-mist-50 p-4 ring-1 ring-mist-100">
                  <p className="mb-1 flex items-center gap-2 font-semibold text-night-700"><Cpu size={15} /> Local with Ollama (private, offline)</p>
                  <p>Run <code className="rounded bg-white px-1">ollama pull llama3.1</code>, then in <code className="rounded bg-white px-1">backend/.env</code>:</p>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-night-700 p-3 text-xs text-sand-200">LLM_PROVIDER=ollama{"\n"}LLM_MODEL=llama3.1</pre>
                </div>
              </div>
              <p>Restart the backend afterwards.</p>
            </div>
          )}
          <Button variant="secondary" size="sm" className="mt-4" onClick={async () => { await clearChatHistory(studentId); setCleared(true); }}>
            <MessageSquareX size={15} /> {cleared ? "Chat history cleared" : "Clear chat history"}
          </Button>
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold text-night-700">Calendar</p>
            <p className="text-sm text-mist-600">Download your sessions, deadlines, exams and placement rounds as an .ics file for Google Calendar, Outlook or Apple Calendar.</p>
          </div>
          <Button variant="secondary" onClick={() => downloadCalendar(studentId)}><CalendarPlus size={16} /> Export</Button>
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold text-night-700">Log out</p>
            <p className="text-sm text-mist-600">Ends this session. Your data stays saved.</p>
          </div>
          <Button variant="danger" onClick={async () => { await logout(); clearStudentId(); router.push("/login"); }}><LogOut size={16} /> Log out</Button>
        </Card>
      </div>
    </div>
  );
}
