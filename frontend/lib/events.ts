/**
 * Tiny cross-component event bus. Any page that changes data calls
 * notifyDataChanged(); every open page/widget that shows data listens with
 * useDataChanged() and refreshes -- so a task added from the chat appears
 * on the To-Dos page and in the planner instantly.
 */
import { useEffect, useRef } from "react";

export const DATA_EVENT = "planner-data-changed";
export const XP_EVENT = "planner-xp";
export const CHAT_OPEN_EVENT = "planner-open-chat";

export function notifyDataChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DATA_EVENT));
}

export function useDataChanged(callback: () => void) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(DATA_EVENT, handler);
    return () => window.removeEventListener(DATA_EVENT, handler);
  }, []);
}

export function announceXp(xp: number, label?: string) {
  if (!xp || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(XP_EVENT, { detail: { xp, label } }));
}

export function openChat(prompt?: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { prompt } }));
}
