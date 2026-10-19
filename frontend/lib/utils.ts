import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDay(dateStr: string): Date {
  return new Date(dateStr.slice(0, 10) + "T00:00:00");
}

export function formatDate(dateStr?: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  if (!dateStr) return "No date";
  const d = parseDay(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, opts);
}

export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const target = parseDay(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function relativeDay(dateStr?: string | null): string {
  const d = daysUntil(dateStr);
  if (d === null) return "No date";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < 0) return `${-d} days ago`;
  if (d < 7) return parseDay(dateStr!).toLocaleDateString(undefined, { weekday: "long" });
  return formatDate(dateStr);
}

export type Tone = "danger" | "warning" | "info" | "neutral" | "success" | "brand" | "gold";

export function urgencyLabel(dateStr?: string | null): { label: string; tone: Tone } {
  const d = daysUntil(dateStr);
  if (d === null) return { label: "No date", tone: "neutral" };
  if (d < 0) return { label: `${Math.abs(d)}d overdue`, tone: "danger" };
  if (d === 0) return { label: "Due today", tone: "danger" };
  if (d === 1) return { label: "Tomorrow", tone: "warning" };
  if (d <= 3) return { label: `In ${d} days`, tone: "warning" };
  if (d <= 7) return { label: `In ${d} days`, tone: "info" };
  return { label: formatDate(dateStr), tone: "neutral" };
}

export type DeadlineBucket = "overdue" | "today" | "this_week" | "later" | "no_date";

export const BUCKET_META: Record<DeadlineBucket, { label: string; hint: string }> = {
  overdue: { label: "Overdue", hint: "Catch-up time is already in today's plan" },
  today: { label: "Due today", hint: "" },
  this_week: { label: "This week", hint: "" },
  later: { label: "Later", hint: "" },
  no_date: { label: "No due date", hint: "Add a date so these get prioritised" },
};

export function deadlineBucket(dateStr?: string | null): DeadlineBucket {
  const d = daysUntil(dateStr);
  if (d === null) return "no_date";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "this_week";
  return "later";
}

export function groupByBucket<T>(items: T[], getDate: (item: T) => string | null | undefined): Record<DeadlineBucket, T[]> {
  const groups: Record<DeadlineBucket, T[]> = { overdue: [], today: [], this_week: [], later: [], no_date: [] };
  for (const item of items) groups[deadlineBucket(getDate(item))].push(item);
  for (const k of Object.keys(groups) as DeadlineBucket[]) {
    groups[k].sort((a, b) => (getDate(a) || "9999").localeCompare(getDate(b) || "9999"));
  }
  return groups;
}

/** Category styling used by the planner timeline, chips and charts. */
export const CATEGORY_META: Record<string, { label: string; bar: string; soft: string; text: string; hex: string; emoji: string }> = {
  assignment: { label: "Assignment", bar: "bg-dusk-500", soft: "bg-dusk-50", text: "text-dusk-700", hex: "#4B6382", emoji: "📝" },
  exam_prep: { label: "Exam prep", bar: "bg-night-700", soft: "bg-night-50", text: "text-night-700", hex: "#071739", emoji: "📚" },
  project: { label: "Project", bar: "bg-sand-600", soft: "bg-sand-50", text: "text-sand-800", hex: "#A68868", emoji: "🛠️" },
  placement: { label: "Placement", bar: "bg-sand-400", soft: "bg-sand-100", text: "text-sand-800", hex: "#D6AE80", emoji: "💼" },
  todo: { label: "To-do", bar: "bg-mist-400", soft: "bg-mist-100", text: "text-mist-700", hex: "#A4B5C4", emoji: "✅" },
};

export function hhmmToHours(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h + (m || 0) / 60;
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const suffix = h < 12 || h === 24 ? "AM" : "PM";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

export function to12h(hhmm: string): string {
  return formatHour(hhmmToHours(hhmm));
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function firstName(name?: string | null): string {
  return (name || "").trim().split(/\s+/)[0] || "there";
}

/** Renders the chatbot's light markdown (**bold**, _italic_, bullets) safely to React-friendly segments. */
export function inlineMarkdown(text: string): { text: string; bold?: boolean; italic?: boolean }[] {
  const out: { text: string; bold?: boolean; italic?: boolean }[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ text: tok.slice(2, -2), bold: true });
    else out.push({ text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
