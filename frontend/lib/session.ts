const KEY = "student_planner_id";
const NAME_KEY = "student_planner_name";
const TOKEN_KEY = "crescent_session";
export const SESSION_EVENT = "planner-session-changed";

export function getStudentId(): string | null {
  if (typeof window === "undefined") return null;
  // a student id without a session token is not a usable session anymore
  return window.localStorage.getItem(TOKEN_KEY) ? window.localStorage.getItem(KEY) : null;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStudentName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(NAME_KEY);
}

/** Old (pre-login) student id still in this browser -- offered on the login page. */
export function getLegacyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY) ? null : window.localStorage.getItem(KEY);
}

export function setSession(id: string, token: string, name?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, id);
  window.localStorage.setItem(TOKEN_KEY, token);
  if (name) window.localStorage.setItem(NAME_KEY, name);
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

export function clearStudentId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(NAME_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}
