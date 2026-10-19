const KEY = "crescent_reminders";

export interface ReminderPrefs {
  enabled: boolean;
  leadMinutes: number;
}

export function getReminderPrefs(): ReminderPrefs {
  if (typeof window === "undefined") return { enabled: false, leadMinutes: 10 };
  try {
    return { enabled: false, leadMinutes: 10, ...JSON.parse(window.localStorage.getItem(KEY) || "{}") };
  } catch {
    return { enabled: false, leadMinutes: 10 };
  }
}

export function setReminderPrefs(p: ReminderPrefs) {
  window.localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent("crescent-reminders"));
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function askPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}
