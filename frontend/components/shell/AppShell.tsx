"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import Reminders from "./Reminders";
import { StudentContext } from "./StudentContext";
import { getStudent, getStats, ApiError } from "@/lib/api";
import { clearStudentId, getStudentId } from "@/lib/session";
import { DATA_EVENT, XP_EVENT } from "@/lib/events";
import type { Profile, Stats } from "@/lib/types";
import { PageLoader } from "../Spinner";
import Button from "../Button";

/**
 * Guards every app page: no session -> /login, not onboarded -> /onboarding,
 * stale session (student deleted) -> cleared and sent to /login. Provides the
 * student's id, profile and XP stats to all pages via context.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [studentId, setId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    try {
      const [student, s] = await Promise.all([getStudent(id), getStats(id)]);
      if (!student.profile?.onboarded) {
        router.replace("/onboarding");
        return;
      }
      setProfile(student.profile);
      setStats(s);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        clearStudentId();
        router.replace("/login");
        return;
      }
      setError((e as Error).message);
    }
  }, [router]);

  useEffect(() => {
    const id = getStudentId();
    if (!id) {
      router.replace("/login");
      return;
    }
    setId(id);
    load(id);
  }, [router, load]);

  useEffect(() => {
    if (!studentId) return;
    const refresh = () => {
      getStats(studentId).then(setStats).catch(() => {});
    };
    const refreshAll = () => load(studentId);
    window.addEventListener(XP_EVENT, refresh);
    window.addEventListener(DATA_EVENT, refreshAll);
    return () => {
      window.removeEventListener(XP_EVENT, refresh);
      window.removeEventListener(DATA_EVENT, refreshAll);
    };
  }, [studentId, load]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="paper-card max-w-md p-8 text-center">
          <p className="font-display text-xl font-semibold text-night-700">Can't load your planner</p>
          <p className="mt-2 text-sm text-mist-600">{error}</p>
          <Button className="mt-6" onClick={() => studentId && load(studentId)}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!studentId || !profile) return <PageLoader label="Opening your planner…" />;

  return (
    <StudentContext.Provider value={{ studentId, profile, stats, refresh: () => load(studentId) }}>
      <div className="min-h-screen">
        <Sidebar />
        <div className="md:pl-[17rem]">
          <main className="pb-28 md:pb-12">{children}</main>
        </div>
        <MobileNav />
        <Reminders studentId={studentId} />
      </div>
    </StudentContext.Provider>
  );
}
