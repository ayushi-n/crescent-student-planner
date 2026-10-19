"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowUp, Maximize2, Minimize2, RotateCcw, Sparkles } from "lucide-react";
import { getStudentId, SESSION_EVENT } from "@/lib/session";
import { sendChatMessage, getChatHistory, clearChatHistory } from "@/lib/api";
import { notifyDataChanged, announceXp, CHAT_OPEN_EVENT } from "@/lib/events";
import { celebrate } from "@/lib/celebrate";
import type { ChatMessage } from "@/lib/types";
import { cn, inlineMarkdown } from "@/lib/utils";
import { BrandMark } from "./brand/Logo";
import { DoodleField } from "./brand/Doodles";

/** @deprecated kept for older imports -- use notifyDataChanged from lib/events */
export { notifyDataChanged };

const APP_ROUTES = ["/dashboard", "/planner", "/academics", "/courses", "/placements", "/todos", "/settings", "/review"];
const STARTERS = ["What should I do now?", "What's due this week?", "Show my applications", "I'm busy tonight"];
const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const bullet = /^\s*[•\-*]\s+/.test(line);
        const content = line.replace(/^\s*[•\-*]\s+/, "");
        const segs = inlineMarkdown(content).map((s, j) =>
          s.bold ? <strong key={j} className="font-semibold text-night-700">{s.text}</strong> : s.italic ? <em key={j} className="text-mist-600">{s.text}</em> : <Fragment key={j}>{s.text}</Fragment>
        );
        return bullet ? (
          <div key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sand-500" />
            <span>{segs}</span>
          </div>
        ) : (
          <p key={i}>{segs}</p>
        );
      })}
    </div>
  );
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [studentId, setStudentIdState] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [aiMode, setAiMode] = useState<boolean | null>(null);
  const [nudge, setNudge] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Re-read the session whenever it changes (login, signup, logout) or the route changes.
  useEffect(() => {
    const sync = () => setStudentIdState(getStudentId());
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [pathname]);

  useEffect(() => {
    setLoaded(false);
    setMessages([]);
  }, [studentId]);

  useEffect(() => {
    fetch(`${BASE}/health`).then((r) => r.json()).then((h) => setAiMode(!!h?.llm?.enabled)).catch(() => setAiMode(null));
  }, []);

  // Gentle "ask me" nudge a few seconds after first arriving in the app.
  useEffect(() => {
    if (!studentId) return;
    const t = setTimeout(() => setNudge(true), 4000);
    const t2 = setTimeout(() => setNudge(false), 12000);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [studentId]);

  const loadHistory = useCallback(async () => {
    if (!studentId) return;
    try {
      const history = await getChatHistory(studentId);
      setMessages(history);
    } catch {
      setMessages([]);
    } finally {
      setLoaded(true);
    }
  }, [studentId]);

  useEffect(() => {
    if (open && !loaded) loadHistory();
    if (open) {
      setNudge(false);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, loaded, loadHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || loading || !studentId) return;
      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setLoading(true);
      try {
        const res = await sendChatMessage(studentId, text);
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
        setSuggestions(res.suggestions?.length ? res.suggestions : STARTERS);
        if (res.action_taken) {
          notifyDataChanged();
          if (res.action_taken.xp) {
            announceXp(res.action_taken.xp, "Marked done from chat");
            celebrate({ x: 0.85, y: 0.7 });
          }
        }
      } catch (err: any) {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err.message}` }]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, studentId]
  );

  // Other parts of the app can open the chat (optionally with a prompt).
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const prompt = (e as CustomEvent).detail?.prompt;
      if (prompt) setTimeout(() => send(prompt), 250);
    };
    window.addEventListener(CHAT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CHAT_OPEN_EVENT, onOpen);
  }, [send]);

  async function clear() {
    if (!studentId) return;
    await clearChatHistory(studentId).catch(() => {});
    setMessages([]);
    setSuggestions(STARTERS);
  }

  const onAppRoute = APP_ROUTES.some((r) => pathname?.startsWith(r));
  if (!studentId || !onAppRoute) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="Study assistant"
            initial={{ opacity: 0, y: 24, scale: 0.94, transformOrigin: "bottom right" }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden bg-white shadow-lift ring-1 ring-mist-200",
              "inset-x-2 bottom-[5.5rem] top-16 rounded-4xl md:inset-x-auto md:bottom-28 md:right-6 md:top-auto",
              big ? "md:h-[min(80vh,46rem)] md:w-[34rem]" : "md:h-[min(72vh,36rem)] md:w-[25rem]"
            )}
          >
            <header className="marble-night relative overflow-hidden px-5 pb-4 pt-4">
              <DoodleField count={5} seed={3} tone="dark" names={["star", "sparkle", "moon"]} />
              <div className="relative flex items-center gap-3">
                <span className="marble-sand grid h-11 w-11 place-items-center rounded-2xl shadow-sand">
                  <BrandMark className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold leading-tight text-white">Crescent assistant</p>
                  <p className="flex items-center gap-1.5 text-xs text-mist-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-sand-300" />
                    {aiMode ? "AI connected · understands anything you type" : "Knows your plan, tasks, deadlines & applications"}
                  </p>
                </div>
                <button onClick={clear} title="Clear chat" aria-label="Clear chat" className="rounded-xl p-2 text-mist-300 transition hover:bg-white/10 hover:text-white">
                  <RotateCcw size={16} />
                </button>
                <button onClick={() => setBig((b) => !b)} title={big ? "Smaller" : "Larger"} aria-label={big ? "Make chat smaller" : "Make chat larger"} className="hidden rounded-xl p-2 text-mist-300 transition hover:bg-white/10 hover:text-white md:block">
                  {big ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-xl p-2 text-mist-300 transition hover:bg-white/10 hover:text-white">
                  <X size={18} />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="relative flex-1 space-y-3 overflow-y-auto bg-paper/60 px-4 py-4">
              {loaded && messages.length === 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-white p-4 text-sm text-dusk-700 shadow-paper ring-1 ring-mist-100">
                  <p className="font-display text-base font-semibold text-night-700">Hi! I'm your study assistant 👋</p>
                  <p className="mt-1.5 leading-relaxed">
                    I can see your plan and deadlines, add assignments, exams and tasks for you, and tick things off when you finish them. Just type normally.
                  </p>
                </motion.div>
              )}
              {!loaded && (
                <div className="space-y-3">
                  <div className="skeleton h-12 w-3/4" />
                  <div className="skeleton ml-auto h-9 w-1/2" />
                </div>
              )}
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={i >= messages.length - 2 ? { opacity: 0, y: 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  {m.role === "assistant" && (
                    <span className="marble-night mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-xl">
                      <BrandMark className="h-4 w-4" light />
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-3xl px-4 py-2.5 text-[14px] leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-lg bg-gradient-to-br from-dusk-500 to-dusk-600 text-white"
                        : "rounded-bl-lg bg-white text-dusk-800 shadow-paper ring-1 ring-mist-100"
                    )}
                  >
                    {m.role === "assistant" ? <RichText text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex items-center gap-2">
                  <span className="marble-night grid h-7 w-7 place-items-center rounded-xl">
                    <BrandMark className="h-4 w-4 animate-float" light />
                  </span>
                  <div className="flex gap-1 rounded-3xl rounded-bl-lg bg-white px-4 py-3.5 shadow-paper ring-1 ring-mist-100">
                    {[0, 1, 2].map((d) => (
                      <motion.span key={d} className="h-2 w-2 rounded-full bg-dusk-400" animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-mist-100 bg-white px-3 pb-3 pt-2.5">
              {!loading && (
                <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="chip shrink-0 border-mist-200 bg-mist-50 text-dusk-700 hover:border-sand-400 hover:bg-sand-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-end gap-2 rounded-3xl bg-mist-50 p-1.5 ring-1 ring-mist-200 transition focus-within:bg-white focus-within:ring-dusk-300"
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask, add a task, or say “I finished…”"
                  aria-label="Message"
                  className="h-10 max-h-[120px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-5 text-night-700 outline-none placeholder:text-mist-500"
                />
                <button type="submit" disabled={loading || !input.trim()} aria-label="Send" className="marble-night grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sand-300 transition disabled:opacity-40">
                  <ArrowUp size={18} />
                </button>
              </form>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nudge && !open && (
          <motion.button
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, x: 12, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12 }}
            className="fixed bottom-[6.4rem] right-[5.5rem] z-50 hidden items-center gap-2 rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm font-semibold text-night-700 shadow-lift ring-1 ring-mist-200 md:flex"
          >
            <Sparkles size={15} className="text-sand-600" /> Ask me what to study next
          </motion.button>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.06, rotate: -4 }}
        whileTap={{ scale: 0.94 }}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="marble-night fixed bottom-[5.6rem] right-4 z-50 grid h-14 w-14 place-items-center rounded-[1.4rem] text-white shadow-night ring-2 ring-sand-300/60 md:bottom-8 md:right-6 md:h-16 md:w-16"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={24} />
            </motion.span>
          ) : (
            <motion.span key="c" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
              <BrandMark className="h-8 w-8 animate-float md:h-9 md:w-9" light />
            </motion.span>
          )}
        </AnimatePresence>
        {!open && <span className="absolute -right-1 -top-1 h-4 w-4 animate-pulse rounded-full bg-sand-300 ring-2 ring-white" />}
      </motion.button>
    </>
  );
}
