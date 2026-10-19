"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import Logo from "../brand/Logo";
import { DoodleField } from "../brand/Doodles";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
import { useStudent } from "./StudentContext";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const pathname = usePathname();
  const { stats } = useStudent();

  return (
    <aside className="marble-night fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col overflow-hidden md:flex">
      <DoodleField count={10} seed={42} tone="dark" names={["star", "crane", "moon", "pine", "sparkle", "cloud"]} />
      <svg className="pointer-events-none absolute bottom-0 left-0 w-full opacity-90" viewBox="0 0 272 160" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 90 C40 70 70 100 110 84 C150 68 190 96 230 80 C250 72 262 76 272 70 L272 160 L0 160Z" fill="#30415A" opacity=".5" />
        <path d="M0 115 C50 98 90 124 140 108 C190 92 230 118 272 104 L272 160 L0 160Z" fill="#243144" opacity=".8" />
        <path d="M0 140 C60 126 120 150 180 134 C220 124 250 136 272 130 L272 160 L0 160Z" fill="#071739" />
      </svg>

      <div className="relative px-6 pb-6 pt-7">
        <Link href="/dashboard" aria-label="Dashboard">
          <Logo light />
        </Link>
      </div>

      <nav className="relative flex-1 space-y-1 px-3">
        {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold transition-colors",
                active ? "text-on-sand" : "text-mist-300 hover:text-white",
                item.href === SETTINGS_ITEM.href && "mt-4"
              )}
            >
              {active && (
                <motion.span layoutId="nav-pill" className="marble-sand absolute inset-0 rounded-2xl shadow-sand" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              {!active && <span className="absolute inset-0 rounded-2xl bg-white/0 transition group-hover:bg-white/[0.06]" />}
              <Icon size={19} strokeWidth={2.1} className="relative transition-transform group-hover:scale-110" />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {stats && (
        <Link href="/dashboard#progress" className="relative mx-3 mb-5 block rounded-3xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/[0.11]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-sand-300">Level {stats.level}</p>
              <p className="font-display text-[15px] font-semibold text-white">{stats.title}</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-sand-300/15 px-2.5 py-1 text-xs font-bold text-sand-200" title="Daily streak">
              <Flame size={13} className={stats.streak > 0 ? "text-sand-300" : "text-mist-500"} /> {stats.streak}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="marble-sand h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, stats.progress * 100)}%` }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-mist-400">
            {stats.xp_into_level} / {stats.xp_for_next} XP to level {stats.level + 1}
          </p>
        </Link>
      )}
    </aside>
  );
}
