"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, LogOut, Settings as SettingsIcon, ChevronDown, Sun, Moon as MoonIcon } from "lucide-react";
import { setTheme } from "@/lib/theme";
import QuickAdd from "./QuickAdd";
import { useStudent } from "./StudentContext";
import { clearStudentId } from "@/lib/session";
import { logout } from "@/lib/api";
import { BrandMark } from "../brand/Logo";

/** Sticky header for every app page: page title, quick add, streak, account menu. */
export default function TopBar({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { profile, stats } = useStudent();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    sync();
    window.addEventListener("crescent-theme", sync);
    return () => window.removeEventListener("crescent-theme", sync);
  }, []);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = (profile.name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-paper/75 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3 md:px-8">
        <Link href="/dashboard" className="marble-night grid h-10 w-10 shrink-0 place-items-center rounded-2xl md:hidden" aria-label="Dashboard">
          <BrandMark className="h-6 w-6" light />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-semibold text-night-700 md:text-2xl">{title}</h1>
          {subtitle && <p className="hidden truncate text-[13px] text-mist-600 sm:block">{subtitle}</p>}
        </div>
        {right && <div className="hidden items-center gap-2 lg:flex">{right}</div>}
        <QuickAdd />
        {stats && (
          <div className="hidden items-center gap-1.5 rounded-2xl bg-white/90 px-3 py-2.5 text-sm font-bold text-night-700 shadow-paper ring-1 ring-mist-200 sm:flex" title={`${stats.streak}-day streak · best ${stats.best_streak}`}>
            <Flame size={16} className={stats.streak > 0 ? "text-sand-600" : "text-mist-400"} />
            <span className="tabular-nums">{stats.streak}</span>
          </div>
        )}
        <button
          onClick={() => setTheme(dark ? "light" : "dark")}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="hidden h-11 w-11 place-items-center rounded-2xl bg-white/90 text-dusk-700 shadow-paper ring-1 ring-mist-200 transition hover:ring-dusk-300 sm:grid"
        >
          {dark ? <Sun size={17} /> : <MoonIcon size={17} />}
        </button>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-1 rounded-2xl p-1 pr-2 transition hover:bg-white/80" aria-haspopup="menu" aria-expanded={menu}>
            <span className="marble-dusk grid h-9 w-9 place-items-center rounded-xl text-sm font-bold text-white">{initials}</span>
            <ChevronDown size={14} className="text-mist-600" />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                className="absolute right-0 mt-2 w-60 overflow-hidden rounded-3xl bg-white p-2 shadow-lift ring-1 ring-mist-200"
              >
                <div className="px-3 py-2">
                  <p className="truncate font-semibold text-night-700">{profile.name}</p>
                  <p className="truncate text-xs text-mist-600">{profile.email || `${profile.degree} · ${profile.branch}`}</p>
                </div>
                <Link href="/settings" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-dusk-700 hover:bg-mist-50">
                  <SettingsIcon size={16} /> Settings
                </Link>
                <button
                  onClick={async () => {
                    await logout();
                    clearStudentId();
                    router.push("/login");
                  }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ember-600 hover:bg-ember-50"
                >
                  <LogOut size={16} /> Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
