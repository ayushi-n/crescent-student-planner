"use client";

const COLORS = ["#E3C39D", "#A68868", "#4B6382", "#A4B5C4", "#CDD5DB", "#071739"];

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Paper confetti in the brand palette. `x`/`y` are 0..1 viewport fractions. */
export async function celebrate(opts: { x?: number; y?: number; big?: boolean } = {}) {
  if (typeof window === "undefined" || prefersReduced()) return;
  const confetti = (await import("canvas-confetti")).default;
  const origin = { x: opts.x ?? 0.5, y: opts.y ?? 0.6 };
  confetti({
    particleCount: opts.big ? 140 : 60,
    spread: opts.big ? 100 : 70,
    startVelocity: opts.big ? 45 : 32,
    ticks: 180,
    gravity: 1,
    scalar: 0.9,
    shapes: ["square", "circle"],
    colors: COLORS,
    origin,
    disableForReducedMotion: true,
  });
}

export function celebrateFrom(el: Element | null, big = false) {
  if (!el) return celebrate({ big });
  const r = el.getBoundingClientRect();
  return celebrate({ x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight, big });
}
