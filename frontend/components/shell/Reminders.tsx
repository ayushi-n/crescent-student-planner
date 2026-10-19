"use client";

import { useEffect, useRef } from "react";
import { getDashboard } from "@/lib/api";
import { getReminderPrefs, notificationsSupported } from "@/lib/reminders";
import { hhmmToHours, todayKey } from "@/lib/utils";

/**
 * Browser notifications while Crescent is open in a tab:
 *  - N minutes before each study session today
 *  - once a day: things due today/tomorrow and placement rounds tomorrow
 * (Browsers only allow this while the site is open; closed-tab push would
 * need a push server, which this project deliberately doesn't run.)
 */
export default function Reminders({ studentId }: { studentId: string }) {
  const sent = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      sent.current = new Set(JSON.parse(sessionStorage.getItem("crescent_notified") || "[]"));
    } catch {}
    let timer: ReturnType<typeof setInterval>;

    async function tick() {
      const prefs = getReminderPrefs();
      if (!prefs.enabled || !notificationsSupported() || Notification.permission !== "granted") return;
      let data;
      try {
        data = await getDashboard(studentId);
      } catch {
        return;
      }
      const now = new Date();
      const nowH = now.getHours() + now.getMinutes() / 60;
      const notify = (id: string, title: string, body: string) => {
        if (sent.current.has(id)) return;
        sent.current.add(id);
        sessionStorage.setItem("crescent_notified", JSON.stringify(Array.from(sent.current)));
        try {
          new Notification(title, { body, tag: id });
        } catch {}
      };
      for (const b of data.today_plan) {
        if (b.done) continue;
        const start = hhmmToHours(b.start);
        const until = (start - nowH) * 60;
        if (until <= prefs.leadMinutes && until > -5) notify(`blk-${b.id}`, `Up next at ${b.start}: ${b.title}`, `${b.minutes}-minute session${b.note ? ` · ${b.note}` : ""}`);
      }
      const day = todayKey();
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const dueSoon = data.upcoming_deadlines.filter((d) => d.date === day || d.date === tomorrow);
      if (dueSoon.length) notify(`due-${day}`, `${dueSoon.length} deadline${dueSoon.length > 1 ? "s" : ""} today/tomorrow`, dueSoon.slice(0, 3).map((d) => d.title).join(" · "));
      const rounds = data.upcoming_rounds.filter((r) => r.date === tomorrow);
      for (const r of rounds) notify(`round-${r.app_id}-${r.key}-${day}`, `${r.company} ${r.label} tomorrow`, "Your prep sessions are in today's plan. Good luck!");
    }

    tick();
    timer = setInterval(tick, 60000);
    const onPrefs = () => tick();
    window.addEventListener("crescent-reminders", onPrefs);
    return () => {
      clearInterval(timer);
      window.removeEventListener("crescent-reminders", onPrefs);
    };
  }, [studentId]);

  return null;
}
