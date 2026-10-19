"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Sparkles, CalendarClock, MessagesSquare, Timer, Briefcase, GraduationCap, Play, Menu, X } from "lucide-react";
import Logo, { BrandMark } from "@/components/brand/Logo";
import PaperScene from "@/components/brand/PaperScene";
import Moon from "@/components/brand/Moon";
import { DoodleField, Doodle } from "@/components/brand/Doodles";
import HeroPreview from "@/components/landing/HeroPreview";
import ChatDemo from "@/components/landing/ChatDemo";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import { getStudentId } from "@/lib/session";
import { useDemo } from "@/lib/useDemo";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
};

export default function Landing() {
  const [hasSession, setHasSession] = useState(false);
  const [menu, setMenu] = useState(false);
  const demo = useDemo();

  useEffect(() => setHasSession(!!getStudentId()), []);

  return (
    <div className="overflow-x-hidden">
      <section className="relative min-h-[100svh] overflow-hidden bg-night-700 text-white">
        <PaperScene className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-r from-night-700/95 via-night-700/70 to-transparent lg:from-night-700/90 lg:from-10% lg:via-night-700/40 lg:via-35% lg:to-transparent lg:to-55%" />

        <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
          <Logo light />
          <div className="hidden items-center gap-8 text-sm font-semibold text-mist-200 md:flex">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#free" className="transition hover:text-white">It's free</a>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {hasSession ? (
              <Link href="/dashboard"><Button variant="gold">Open my planner</Button></Link>
            ) : (
              <>
                <Link href="/login"><Button variant="glass">Log in</Button></Link>
                <Link href="/signup"><Button variant="gold">Start free</Button></Link>
              </>
            )}
          </div>
          <button className="rounded-xl p-2 md:hidden" onClick={() => setMenu((m) => !m)} aria-label="Menu">
            {menu ? <X /> : <Menu />}
          </button>
        </nav>
        {menu && (
          <div className="relative z-20 mx-5 rounded-3xl bg-night-600/95 p-4 backdrop-blur md:hidden">
            {[["features", "Features"], ["how", "How it works"], ["free", "It's free"]].map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={() => setMenu(false)} className="block rounded-xl px-3 py-2.5 font-semibold text-mist-100">{label}</a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link href="/login"><Button variant="glass" className="w-full">Log in</Button></Link>
              <Link href="/signup"><Button variant="gold" className="w-full">Start free</Button></Link>
            </div>
          </div>
        )}

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-28 pt-10 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 text-sm font-semibold text-sand-200 ring-1 ring-white/15 backdrop-blur">
              <span className="marble-sand rounded-full px-2.5 py-0.5 text-xs font-bold text-night-700">New</span>
              Free for every student — no payments, ever
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-[2.9rem] font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.6rem]"
              style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1, "opsz" 144' }}
            >
              Your semester,
              <br />
              one calm plan.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.8 }} className="mt-6 max-w-[34rem] text-lg leading-relaxed text-mist-200">
              {BRAND.name} turns your assignments, exams, classes and placement rounds into a calm, day-by-day study plan — and quietly re-plans it every time something changes.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }} className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={hasSession ? "/dashboard" : "/signup"}>
                <Button variant="gold" size="lg">{hasSession ? "Open my planner" : "Start planning — free"}</Button>
              </Link>
              <Button variant="glass" size="lg" onClick={demo.go} disabled={demo.busy}>
                {demo.busy ? <Spinner className="h-4 w-4" /> : <Play size={16} />} Try the live demo
              </Button>
            </motion.div>
            {demo.error && <p className="mt-3 max-w-md rounded-2xl bg-ember-500/20 px-4 py-2 text-sm text-ember-100">{demo.error}</p>}
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-mist-300">
              {["100% free", "Re-plans automatically", "Works with cloud or local AI"].map((t) => (
                <span key={t} className="flex items-center gap-2"><Check size={15} className="text-sand-300" /> {t}</span>
              ))}
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroPreview />
          </div>
        </div>

        <svg className="absolute -bottom-px left-0 z-10 w-full text-paper" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true">
          <path fill="currentColor" d="M0 40 C240 80 480 0 720 30 C960 60 1200 10 1440 40 L1440 80 L0 80Z" />
        </svg>
      </section>

      <section id="features" className="relative mx-auto max-w-7xl px-5 py-24 md:px-8">
        <DoodleField count={12} seed={9} />
        <motion.div {...reveal} className="relative max-w-2xl">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-night-700 md:text-5xl">Everything a semester throws at you, in one calm place.</h2>
          <p className="mt-4 text-lg text-dusk-700">Add work once. The planner, the assistant and your dashboard all stay in sync.</p>
        </motion.div>

        <div className="relative mt-14 grid gap-5 md:grid-cols-6">
          <motion.div {...reveal} className="marble-night relative overflow-hidden rounded-4xl p-8 text-white md:col-span-4 md:row-span-2">
            <DoodleField count={7} seed={4} tone="dark" />
            <CalendarClock className="relative text-sand-300" />
            <h3 className="relative mt-5 font-display text-3xl font-semibold">A plan that re-plans itself</h3>
            <p className="relative mt-3 max-w-md text-mist-200">
              Add an assignment and it's already in this week's sessions. It works around your class timetable, moves sessions when you're busy, and catches up missed work first.
            </p>
            <div className="relative mt-8 grid grid-cols-7 items-end gap-2 sm:gap-3" style={{ height: 150 }}>
              {[2.5, 3, 1.5, 3.5, 2, 4, 1].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${(h / 4) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col-reverse overflow-hidden rounded-xl"
                >
                  <div className="flex-[2] bg-dusk-400" />
                  <div className="flex-1 bg-sand-300" />
                  {i % 2 === 0 && <div className="flex-1 bg-mist-300" />}
                </motion.div>
              ))}
            </div>
            <div className="relative mt-3 grid grid-cols-7 gap-3 text-center text-xs font-semibold text-mist-400">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
            </div>
          </motion.div>

          <motion.div {...reveal} className="paper-card-solid relative overflow-hidden p-7 md:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-2xl font-semibold text-night-700">Watch the moon fill</h3>
              <Moon value={0.7} size={70} glow={false} />
            </div>
            <p className="mt-3 text-dusk-700">Every session you tick off waxes tonight's moon, earns XP and keeps your streak alive.</p>
          </motion.div>

          <motion.div {...reveal} className="marble-sand relative overflow-hidden rounded-4xl p-7 md:col-span-2">
            <Timer className="text-night-700" />
            <h3 className="mt-4 font-display text-2xl font-semibold text-night-700">Focus timer built in</h3>
            <p className="mt-2 text-sand-900">25 or 50-minute sessions with a soft chime. Finished sessions count toward your level.</p>
          </motion.div>

          <motion.div {...reveal} className="paper-card-solid p-7 md:col-span-3">
            <MessagesSquare className="text-dusk-500" />
            <h3 className="mt-4 font-display text-2xl font-semibold text-night-700">An assistant that does things</h3>
            <p className="mt-2 text-dusk-700">“ML exam on 24th oct”, “I'm busy tonight”, “I cleared the Acme coding test” — it updates your data and re-plans. Connect a cloud or local AI model and it understands anything you type.</p>
          </motion.div>

          <motion.div {...reveal} className="paper-card-solid p-7 md:col-span-3">
            <div className="flex gap-3"><Briefcase className="text-sand-600" /><GraduationCap className="text-dusk-500" /></div>
            <h3 className="mt-4 font-display text-2xl font-semibold text-night-700">Every placement round, tracked</h3>
            <p className="mt-2 text-dusk-700">One table for every company: resume screening, aptitude, coding, interviews, HR — selected, rejected or in progress. Date a round and prep sessions appear before it.</p>
          </motion.div>
        </div>
      </section>

      <section id="how" className="relative bg-white/60 py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 md:px-8 lg:grid-cols-2">
          <motion.div {...reveal}>
            <h2 className="font-display text-4xl font-semibold tracking-tight text-night-700 md:text-5xl">Say it. It's planned.</h2>
            <p className="mt-4 max-w-lg text-lg text-dusk-700">No forms required. Type the way you'd text a friend, and the planner works out the rest.</p>
            <ol className="mt-10 space-y-7">
              {[
                ["Tell it what's on your plate", "Assignments, exams, projects, placement prep, life admin — typed in plain English or added in a click."],
                ["It decides what matters most", "Closer deadlines, higher priority and exams weigh more. Overdue work gets catch-up time first."],
                ["It lays out your week", "Focused sessions with breaks, inside the hours you said you have, from the time you like to start."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-5">
                  <span className="marble-night grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-lg font-semibold text-sand-300">{i + 1}</span>
                  <div>
                    <p className="font-display text-xl font-semibold text-night-700">{t}</p>
                    <p className="mt-1 text-dusk-700">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </motion.div>
          <motion.div {...reveal} className="relative">
            <div className="marble-mist absolute -inset-6 -rotate-2 rounded-[2.5rem]" />
            <Doodle name="plane" className="absolute -right-4 -top-10 h-16 w-16 animate-float text-sand-500" />
            <Doodle name="star" className="absolute -bottom-8 -left-6 h-12 w-12 animate-float-slow text-dusk-400" />
            <div className="relative"><ChatDemo /></div>
          </motion.div>
        </div>
      </section>

      <section id="free" className="relative mx-auto max-w-5xl px-5 py-20 md:px-8">
        <DoodleField count={8} seed={21} />
        <motion.div {...reveal} className="paper-card-solid relative overflow-hidden p-8 text-center md:p-12">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-night-700 md:text-5xl">Completely free. No catch.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-dusk-700">No plans, no payments, no ads and no card details — every feature is free for every student.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {["Self-updating planner", "AI assistant (cloud or local)", "Class timetable aware", "Placement rounds tracker", "Calendar export", "Weekly review"].map((f) => (
              <span key={f} className="chip border-mist-200 bg-mist-50 py-1.5 text-sm text-dusk-700"><Check size={14} className="text-sand-600" /> {f}</span>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="px-5 pb-10 md:px-8">
        <motion.div {...reveal} className="marble-night relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] px-8 py-16 text-center text-white md:py-20">
          <DoodleField count={14} seed={5} tone="dark" />
          <div className="relative mx-auto mb-8 w-fit"><Moon value={1} size={110} /></div>
          <h2 className="relative mx-auto max-w-2xl font-display text-4xl font-semibold tracking-tight md:text-5xl">Tonight could be the first calm study night of the semester.</h2>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/signup"><Button variant="gold" size="lg"><Sparkles size={18} /> Create my plan</Button></Link>
            <Button variant="glass" size="lg" onClick={demo.go} disabled={demo.busy}>Explore the demo</Button>
          </div>
        </motion.div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-mist-600 md:flex-row md:px-8">
        <div className="flex items-center gap-2">
          <BrandMark className="h-6 w-6" /> <span className="font-semibold text-dusk-700">{BRAND.name}</span> — made for students who have too much on
        </div>
        <div className="flex gap-6">
          <Link href="/login" className="hover:text-night-700">Log in</Link>
          <Link href="/signup" className="hover:text-night-700">Sign up</Link>
          <a href="#features" className="hover:text-night-700">Features</a>
        </div>
      </footer>
    </div>
  );
}
