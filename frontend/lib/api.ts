import { getToken, clearStudentId } from "./session";
import type {
  Profile, Assignment, Project, Exam, TrackedCourse, RecommendedCourse,
  Opportunity, Application, PrepTask, Todo, Schedule, DashboardData,
  ChatResponse, ChatMessage, AuthResponse, Stats, ScheduleBlock, Review, LlmStatus, TimetableEntry, BusyBlock, Round,
  Job, EligibilityReport, PlacementApplication, ResumeSuggestions,
} from "./types";

export const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${BASE}. Start the backend with: python -m uvicorn app.main:app --reload --port 8000`);
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    // session expired or revoked -> back to login
    clearStudentId();
    if (!["/login", "/signup", "/"].includes(window.location.pathname)) window.location.href = "/login?expired=1";
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : Array.isArray(body.detail) ? body.detail.map((d: any) => d.msg).join(", ") : JSON.stringify(body);
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// ---- Auth ----
export const signup = (name: string, email: string, password: string) =>
  request<AuthResponse>("/auth/signup", json("POST", { name, email, password }));
export const login = (email: string, password: string) =>
  request<AuthResponse>("/auth/login", json("POST", { email, password }));
export const startDemo = () => request<AuthResponse>("/auth/demo", json("POST"));
export const legacyLogin = (studentId: string) => request<AuthResponse>("/auth/legacy", json("POST", { student_id: studentId }));
export const logout = () => request<{ ok: boolean }>("/auth/logout", json("POST")).catch(() => ({ ok: false }));
export const setCredentials = (id: string, email: string, password: string) =>
  request<{ ok: boolean; email: string }>(`/students/${id}/credentials`, json("PUT", { email, password }));
export const getLlmStatus = () => request<LlmStatus>("/llm/status");

// ---- Student / profile ----
export const getStudent = (id: string) => request<any>(`/students/${id}`);
export const updateProfile = (id: string, profile: Partial<Profile>) =>
  request<Profile>(`/students/${id}/profile`, json("PUT", profile));
export const updateSettings = (id: string, settings: Partial<Profile>) =>
  request<Profile>(`/students/${id}/settings`, json("PATCH", settings));
export const getStats = (id: string) => request<Stats>(`/students/${id}/stats`);
export const logFocus = (id: string, minutes: number) =>
  request<{ xp: number; stats: Stats }>(`/students/${id}/focus`, json("POST", { minutes }));

export const setTimetable = (id: string, entries: TimetableEntry[]) =>
  request<TimetableEntry[]>(`/students/${id}/timetable`, json("PUT", { entries }));
export const addBusy = (id: string, b: Omit<BusyBlock, "id">) => request<BusyBlock>(`/students/${id}/busy`, json("POST", b));
export const removeBusy = (id: string, busyId: string) => request<{ deleted: boolean }>(`/students/${id}/busy/${busyId}`, json("DELETE"));
export const dismissNotice = (id: string, key: string) => request<{ ok: boolean }>(`/students/${id}/notices/${key}`, json("DELETE"));
export const getReview = (id: string) => request<Review>(`/students/${id}/review`);

/** Downloads the plan as an .ics file (fetch + blob, because the request needs the session header). */
export async function downloadCalendar(id: string) {
  const res = await fetch(`${BASE}/students/${id}/calendar.ics`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, "Couldn't export your calendar.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "crescent-plan.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- Dashboard ----
export const getDashboard = (id: string) => request<DashboardData>(`/dashboard/${id}`);

// ---- Generic CRUD ----
type WithXp<T> = T & { _xp?: number };
function crud<T>(section: string) {
  return {
    list: (id: string) => request<T[]>(`/students/${id}/${section}`),
    add: (id: string, item: Partial<T>) => request<T>(`/students/${id}/${section}`, json("POST", item)),
    update: (id: string, itemId: string, updates: Partial<T>) =>
      request<WithXp<T>>(`/students/${id}/${section}/${itemId}`, json("PUT", { updates })),
    remove: (id: string, itemId: string) =>
      request<{ deleted: boolean }>(`/students/${id}/${section}/${itemId}`, json("DELETE")),
  };
}

export const assignmentsApi = crud<Assignment>("assignments");
export const projectsApi = crud<Project>("projects");
export const examsApi = crud<Exam>("exams");
export const trackedCoursesApi = crud<TrackedCourse>("courses");
export const todosApi = crud<Todo>("todos");
export const opportunitiesApi = crud<Opportunity>("placements/opportunities");
export const applicationsApi = crud<Application>("placements/applications");
export const prepTasksApi = crud<PrepTask>("placements/prep_tasks");

// ---- Courses ----
export const getRecommendedCourses = (id: string) => request<RecommendedCourse[]>(`/students/${id}/courses/recommended`);

// ---- Planner Agent ----
export const generatePlan = (id: string, daysAhead = 7) =>
  request<Schedule>(`/students/${id}/plan/generate?days_ahead=${daysAhead}`, json("POST"));
export const getPlan = (id: string) => request<Schedule>(`/students/${id}/plan`);
export const skipBlock = (id: string, blockId: string) =>
  request<{ skipped: ScheduleBlock; moved_to: ScheduleBlock | null; schedule: Schedule }>(`/students/${id}/plan/blocks/${encodeURIComponent(blockId)}/skip`, json("POST"));
export const toggleBlock = (id: string, blockId: string) =>
  request<{ block: ScheduleBlock; xp: number; stats: Stats }>(`/students/${id}/plan/blocks/${encodeURIComponent(blockId)}/toggle`, json("POST"));

// ---- Chatbot Agent ----
export const sendChatMessage = (id: string, message: string) =>
  request<ChatResponse>(`/students/${id}/chat`, json("POST", { message }));
export const getChatHistory = (id: string) => request<ChatMessage[]>(`/students/${id}/chat/history`);
export const clearChatHistory = (id: string) => request<{ cleared: boolean }>(`/students/${id}/chat/history`, json("DELETE"));

// ---- Placements Agent ----
export const getJobs = () => request<Job[]>(`/jobs`);
export const getPipelineStages = () => request<string[]>(`/placements/pipeline-stages`);
export const getEligibility = (studentId: string) => request<EligibilityReport>(`/students/${studentId}/placements/eligibility`);
export const updateEligibilityProfile = (studentId: string, cgpa: number, active_backlogs: number) =>
  request<Profile>(`/students/${studentId}/placements/eligibility-profile`, json("PUT", { cgpa, active_backlogs }));
export const easyApply = (studentId: string, jobId: string) =>
  request<PlacementApplication>(`/students/${studentId}/placements/apply/${jobId}`, json("POST"));
export const advanceApplication = (studentId: string, applicationId: string, action: "advance" | "reject") =>
  request<PlacementApplication>(`/students/${studentId}/placements/applications/${applicationId}/advance`, json("PUT", { action }));
export const getRoundTypes = () => request<{ key: Round["key"]; label: string }[]>(`/placements/rounds`);
export const updateRound = (studentId: string, appId: string, key: string, body: { status?: Round["status"]; date?: string | null }) =>
  request<PlacementApplication & { _xp?: number }>(`/students/${studentId}/placements/applications/${appId}/rounds/${key}`, json("PUT", body));
export const getResumeSuggestions = (studentId: string) =>
  request<ResumeSuggestions>(`/students/${studentId}/placements/resume-suggestions`);
