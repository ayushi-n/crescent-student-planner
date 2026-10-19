"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Play, ArrowRight, History } from "lucide-react";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import { login, signup, legacyLogin } from "@/lib/api";
import { setSession, getLegacyId } from "@/lib/session";
import { useDemo } from "@/lib/useDemo";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const demo = useDemo();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = mode === "signup" ? await signup(name, email, password) : await login(email, password);
      setSession(res.student_id, res.token, res.name);
      router.push(res.onboarded ? "/dashboard" : "/onboarding");
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const [legacyId, setLegacyId] = useState("");
  const [foundLegacy, setFoundLegacy] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setFoundLegacy(getLegacyId());
    setExpired(new URLSearchParams(window.location.search).has("expired"));
  }, []);

  async function openLegacy(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await legacyLogin(id);
      setSession(res.student_id, res.token, res.name);
      router.push(res.onboarded ? "/settings?secure=1" : "/onboarding");
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-night-700">{mode === "signup" ? "Create your account" : "Log in"}</h1>
      <p className="mt-2 text-dusk-700">
        {mode === "signup" ? "Already have one? " : "New here? "}
        <Link href={mode === "signup" ? "/login" : "/signup"} className="font-semibold text-dusk-500 underline decoration-sand-400 decoration-2 underline-offset-4 hover:text-night-700">
          {mode === "signup" ? "Log in" : "Create an account"}
        </Link>
      </p>

      {expired && <p className="mt-5 rounded-2xl bg-sand-100 px-4 py-3 text-sm text-sand-900">Your session ended. Please log in again.</p>}
      {mode === "login" && foundLegacy && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-dusk-50 p-4 ring-1 ring-dusk-100">
          <p className="text-sm text-dusk-800">We found an older account from before logins existed in this browser.</p>
          <Button size="sm" variant="night" onClick={() => openLegacy(foundLegacy)} disabled={busy}><History size={14} /> Open it</Button>
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-4">
        {mode === "signup" && (
          <label className="block">
            <span className="label">Your name</span>
            <input className="input h-12" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ananya Rao" autoComplete="name" required />
          </label>
        )}
        <label className="block">
          <span className="label">College email</span>
          <input className="input h-12" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" autoComplete="email" required />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <div className="relative">
            <input
              className="input h-12 pr-12"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 6 : undefined}
              required
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-3 rounded-lg p-1 text-mist-500 hover:text-night-700">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {mode === "signup" && password && (
            <div className="mt-2 flex items-center gap-2">
              {[1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full transition ${strength >= i ? (strength === 1 ? "bg-ember-400" : strength === 2 ? "bg-sand-500" : "bg-dusk-500") : "bg-mist-200"}`} />
              ))}
              <span className="w-14 text-right text-[11px] font-semibold text-mist-600">{["", "Too short", "Okay", "Strong"][strength]}</span>
            </div>
          )}
        </label>

        {error && <p role="alert" className="rounded-2xl bg-ember-50 px-4 py-3 text-sm font-medium text-ember-600 ring-1 ring-ember-100">{error}</p>}

        <Button type="submit" variant="night" size="lg" className="w-full" disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {mode === "signup" ? "Create account" : "Log in"} {!busy && <ArrowRight size={18} />}
        </Button>
      </form>

      <div className="my-7 flex items-center gap-3 text-xs font-semibold text-mist-500">
        <span className="h-px flex-1 bg-mist-200" /> or <span className="h-px flex-1 bg-mist-200" />
      </div>
      <Button variant="secondary" size="lg" className="w-full" onClick={demo.go} disabled={demo.busy}>
        {demo.busy ? <Spinner className="h-4 w-4" /> : <Play size={16} />} Explore with a demo account
      </Button>
      {demo.error && <p className="mt-3 text-sm text-ember-600">{demo.error}</p>}
      <p className="mt-6 text-center text-xs text-mist-600">The demo comes filled with a sample semester, so you can try everything in a click.</p>
      {mode === "login" && (
        <div className="mt-6 text-center">
          {!showLegacy ? (
            <button onClick={() => setShowLegacy(true)} className="text-xs font-semibold text-dusk-500 underline underline-offset-4">Have an older account with only a student ID?</button>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); legacyId.trim() && openLegacy(legacyId.trim()); }} className="flex gap-2">
              <input className="input" value={legacyId} onChange={(e) => setLegacyId(e.target.value)} placeholder="stu_xxxxxxxxxx" aria-label="Old student ID" />
              <Button type="submit" variant="secondary" disabled={busy}>Open</Button>
            </form>
          )}
        </div>
      )}
    </motion.div>
  );
}
