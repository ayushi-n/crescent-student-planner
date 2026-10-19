"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Logo from "@/components/brand/Logo";
import Moon from "@/components/brand/Moon";
import { DoodleField } from "@/components/brand/Doodles";

const QUOTES: Record<string, { title: string; body: string }> = {
  "/login": { title: "Welcome back.", body: "Your plan kept itself up to date while you were away." },
  "/signup": { title: "One calm place for the whole semester.", body: "Assignments, exams, placements and to-dos, planned for you day by day." },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/login";
  const q = QUOTES[pathname] || QUOTES["/login"];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <aside className="marble-night relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <DoodleField count={16} seed={13} tone="dark" />
        <Link href="/" className="relative w-fit"><Logo light /></Link>
        <div className="relative flex flex-1 flex-col items-center justify-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}>
            <Moon value={pathname === "/signup" ? 0.35 : 0.8} size={230} />
          </motion.div>
          <motion.h2 key={q.title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mt-12 max-w-sm text-center font-display text-4xl font-semibold leading-tight">
            {q.title}
          </motion.h2>
          <p className="mt-3 max-w-sm text-center text-mist-300">{q.body}</p>
        </div>
        <svg className="pointer-events-none absolute bottom-0 left-0 w-full" viewBox="0 0 700 160" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 80 C120 50 220 100 350 70 C480 40 580 90 700 60 L700 160 L0 160Z" fill="#30415A" opacity=".6" />
          <path d="M0 120 C140 96 260 132 400 108 C520 88 620 120 700 104 L700 160 L0 160Z" fill="#4B6382" opacity=".55" />
          <path d="M0 146 C160 130 320 156 480 138 C580 128 650 140 700 134 L700 160 L0 160Z" fill="#A4B5C4" opacity=".5" />
        </svg>
      </aside>
      <main className="relative flex items-center justify-center overflow-hidden px-5 py-12">
        <DoodleField count={9} seed={31} className="lg:hidden" />
        <div className="relative w-full max-w-md">
          <Link href="/" className="mb-10 block w-fit lg:hidden"><Logo /></Link>
          {children}
        </div>
      </main>
    </div>
  );
}
