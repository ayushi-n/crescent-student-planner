"use client";

import { createContext, useContext } from "react";
import type { Profile, Stats } from "@/lib/types";

export interface StudentCtx {
  studentId: string;
  profile: Profile;
  stats: Stats | null;
  refresh: () => Promise<void>;
}

export const StudentContext = createContext<StudentCtx | null>(null);

export function useStudent(): StudentCtx {
  const ctx = useContext(StudentContext);
  if (!ctx) throw new Error("useStudent must be used inside the app shell");
  return ctx;
}
