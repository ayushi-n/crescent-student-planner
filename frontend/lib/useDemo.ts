"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startDemo } from "./api";
import { setSession } from "./session";

/** Creates a fully populated demo student and opens the dashboard. */
export function useDemo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await startDemo();
      setSession(res.student_id, res.token, res.name);
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  return { go, busy, error };
}

