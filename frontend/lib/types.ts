export type Priority = "low" | "medium" | "high";

export interface Profile {
  name: string;
  email?: string;
  degree: string;
  branch: string;
  year: number;
  semester: number;
  subjects: string[];
  goals: string[];
  skills: string[];
  study_hours_per_day: number;
  weekend_hours_per_day?: number | null;
  preferred_start_hour: number;
  session_minutes?: number | null;
  break_minutes?: number | null;
  latest_end_hour?: number | null;
  onboarded: boolean;
  created_at?: string;
  cgpa?: number;
  active_backlogs?: number;
  demo?: boolean;
  timetable?: TimetableEntry[];
  busy?: BusyBlock[];
}

export interface TimetableEntry {
  id?: string;
  day: number; // 0 = Monday
  start: string; // HH:MM
  end: string;
  label: string;
}

export interface BusyBlock {
  id: string;
  date: string;
  start: string;
  end: string;
  label: string;
}

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  due_date?: string | null;
  status: "pending" | "submitted";
  priority: Priority;
  estimated_hours?: number | null;
  hours_logged?: number;
  notes?: string;
}

export interface Project {
  id: string;
  title: string;
  subject?: string;
  description?: string;
  due_date?: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: Priority;
  estimated_hours?: number | null;
  hours_logged?: number;
}

export interface Exam {
  id: string;
  subject: string;
  date: string;
  time?: string | null;
  type: "internal" | "external";
  syllabus?: string;
  hours_logged?: number;
}

export interface TrackedCourse {
  id: string;
  name: string;
  provider?: string;
  status: "ongoing" | "pending" | "completed";
  progress: number;
}

export interface RecommendedCourse {
  id: string;
  name: string;
  provider: string;
  description: string;
  duration_weeks: number;
  level: string;
  match_score: number;
}

export interface Opportunity {
  id: string;
  company: string;
  role: string;
  deadline?: string | null;
  status: "open" | "closed";
}

export type RoundStatus = "na" | "pending" | "in_progress" | "selected" | "rejected";
export type RoundKey = "resume" | "aptitude" | "coding" | "gd" | "interview1" | "interview2" | "hr";

export interface Round {
  key: RoundKey;
  label: string;
  status: RoundStatus;
  date?: string | null;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  applied_date?: string | null;
  status: string;
  job_id?: string;
  rounds: Round[];
  result: "in_progress" | "rejected" | "offer";
  current_round?: RoundKey | null;
  rejected?: boolean;
}

export interface UpcomingRound {
  app_id: string;
  company: string;
  role: string;
  key: RoundKey;
  label: string;
  date: string;
  status: RoundStatus;
}

export interface PrepTask {
  id: string;
  title: string;
  due_date?: string | null;
  priority: Priority;
  done: boolean;
}

export interface Todo {
  id: string;
  title: string;
  due_date?: string | null;
  priority: Priority;
  done: boolean;
  schedulable: boolean;
  subject?: string;
  source?: string;
}

export interface ScheduleBlock {
  id: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  title: string;
  category: string;
  subject: string;
  ref_id: string;
  due_date?: string | null;
  priority?: Priority;
  overdue?: boolean;
  done?: boolean;
  note?: string | null;
}

export interface PlanItemRef {
  ref_id?: string;
  id?: string;
  title: string;
  category: string;
  remaining_hours?: number;
  due_date?: string | null;
}

export interface Schedule {
  generated_at: string | null;
  window?: { start: string; end: string };
  days: Record<string, ScheduleBlock[]>;
  capacity_left?: Record<string, number>;
  busy?: Record<string, { start: string; end: string }[]>;
  missed?: { date: string; title: string; minutes: number }[];
  overdue?: PlanItemRef[];
  at_risk?: PlanItemRef[];
  unscheduled?: PlanItemRef[];
  settings?: {
    study_hours_per_day: number;
    weekend_hours_per_day: number;
    preferred_start_hour: number;
    session_minutes: number;
    break_minutes: number;
    latest_end_hour: number;
  };
  explanation: string;
}

export interface Stats {
  xp: number;
  streak: number;
  best_streak: number;
  completed_total: number;
  focus_minutes: number;
  activity: { text: string; xp: number; at: string }[];
  level: number;
  title: string;
  xp_into_level: number;
  xp_for_next: number;
  progress: number;
}

export interface Deadline {
  type: string;
  id: string;
  title: string;
  subject: string;
  date: string;
}

export interface DashboardData {
  profile: Profile;
  today_plan: ScheduleBlock[];
  schedule_explanation: string;
  overdue: PlanItemRef[];
  at_risk: PlanItemRef[];
  counts: {
    pending_assignments: number;
    submitted_assignments: number;
    active_projects: number;
    upcoming_exams: number;
    open_opportunities: number;
    applications: number;
    pending_prep_tasks: number;
    pending_todos: number;
  };
  upcoming_deadlines: Deadline[];
  courses: TrackedCourse[];
  stats: Stats;
  llm_enabled: boolean;
  upcoming_rounds: UpcomingRound[];
  notices: { missed?: { date: string; items: { date: string; title: string; minutes: number }[] } };
  busy_today: { start: string; end: string }[];
}

export interface Review {
  series: { date: string; planned: number; done: number }[];
  week: { planned_minutes: number; done_minutes: number; completion: number; best_day: string | null; wins: number; xp: number };
  by_subject: { subject: string; minutes: number }[];
  by_category: Record<string, number>;
  behind: { subject: string; overdue: number; at_risk: number }[];
  stats: Stats;
}

export interface LlmStatus {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  local: boolean;
  last_error: string | null;
}

export interface ChatResponse {
  reply: string;
  intent: string;
  action_taken: { type: string; xp?: number; [key: string]: any } | null;
  suggestions?: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  suggestions?: string[];
}

export interface AuthResponse {
  student_id: string;
  token: string;
  onboarded: boolean;
  name: string;
}

// ---- Placements Agent ----
export interface Job {
  id: string;
  company: string;
  role: string;
  package?: string;
  min_cgpa: number;
  allowed_branches: string[];
  max_backlogs: number;
  required_skills: string[];
  deadline?: string | null;
  description: string;
}

export interface JobWithEligibility extends Job {
  eligible: boolean;
  reasons: string[];
}

export interface EligibilityReport {
  eligible: JobWithEligibility[];
  not_eligible: JobWithEligibility[];
}

export type PlacementApplication = Application;

export interface ResumeSuggestions {
  top_skill_gaps: { skill: string; roles_blocked: number }[];
  suggestions: string[];
  recommended_courses: RecommendedCourse[];
  eligible_count: number;
  not_eligible_count: number;
}
