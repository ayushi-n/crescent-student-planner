"use client";

import { motion, useMotionValue, useSpring, useTransform, MotionValue } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * Paper-cut night scene (moon, layered hills, pine branches, cranes) drawn
 * in SVG from the palette. Layers move at different depths with the pointer
 * for a parallax, cut-paper diorama feel.
 */

function rand(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const r = rand(17);
const STARS = Array.from({ length: 46 }, () => ({ x: r() * 1440, y: r() * 420, s: 0.8 + r() * 1.8, d: r() * 4 }));

function PinePuff({ x, y, size = 26, rot = 0 }: { x: number; y: number; size?: number; rot?: number }) {
  const lines = Array.from({ length: 13 }, (_, i) => {
    const a = (-160 + (i * 140) / 12) * (Math.PI / 180);
    return { x2: Math.cos(a) * size, y2: Math.sin(a) * size * 0.75 };
  });
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <ellipse cx="0" cy="2" rx={size * 0.9} ry={size * 0.32} fill="#FFFFFF" opacity=".95" />
      {lines.map((l, i) => (
        <line key={i} x1="0" y1="0" x2={l.x2} y2={l.y2} stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      ))}
    </g>
  );
}

function Crane({ flip = false, delay = 0 }: { flip?: boolean; delay?: number }) {
  return (
    <g transform={flip ? "scale(-1 1)" : undefined}>
      <path d="M0 40 L60 30 L95 46 L60 50 Z" fill="#FFFFFF" />
      <path d="M95 46 L128 22 L120 30 L104 50 Z" fill="#EEF1F5" />
      <path d="M128 22 L136 20 L130 26 Z" fill="#071739" />
      <motion.g style={{ originX: "60px", originY: "38px" }} animate={{ scaleY: [1, 0.35, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay }}>
        <path d="M55 36 L30 -30 L82 34 Z" fill="#FFFFFF" />
        <path d="M30 -30 L46 2 L82 34 Z" fill="#CDD5DB" />
        <path d="M38 -12 L52 18 M46 -6 L60 22" stroke="#A4B5C4" strokeWidth="1.2" />
      </motion.g>
      <path d="M0 40 L-18 46 L2 44 Z" fill="#E3C39D" />
    </g>
  );
}

function Layer({ depth, mx, my, children }: { depth: number; mx: MotionValue<number>; my: MotionValue<number>; children: React.ReactNode }) {
  const x = useTransform(mx, (v) => v * depth * 28);
  const y = useTransform(my, (v) => v * depth * 16);
  return <motion.g style={{ x, y }}>{children}</motion.g>;
}

export default function PaperScene({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 50, damping: 18 });
  const my = useSpring(rawY, { stiffness: 50, damping: 18 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const b = el.getBoundingClientRect();
      rawX.set(((e.clientX - b.left) / b.width - 0.5) * 2);
      rawY.set(((e.clientY - b.top) / b.height - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [rawX, rawY]);

  return (
    <div ref={ref} className={className} aria-hidden="true">
      <svg viewBox="0 0 1440 820" preserveAspectRatio="xMaxYMid slice" className="h-full w-full">
        <defs>
          <radialGradient id="ps-moon" cx="38%" cy="34%" r="78%">
            <stop offset="0%" stopColor="#FBF6EF" />
            <stop offset="40%" stopColor="#EFD9BC" />
            <stop offset="78%" stopColor="#E3C39D" />
            <stop offset="100%" stopColor="#B99572" />
          </radialGradient>
          <filter id="ps-veins">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.016" numOctaves="4" seed="5" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 .65 0 0 0 0 .53 0 0 0 0 .41 1 0 0 0 0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 .5 0 0 0 .35 0 0 0" />
            </feComponentTransfer>
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="ps-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="-6" stdDeviation="8" floodColor="#030B1D" floodOpacity=".55" />
          </filter>
          <filter id="ps-soft" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#030B1D" floodOpacity=".35" />
          </filter>
          <radialGradient id="ps-glow">
            <stop offset="70%" stopColor="#E3C39D" stopOpacity=".35" />
            <stop offset="100%" stopColor="#E3C39D" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ps-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#071739" />
            <stop offset="70%" stopColor="#0F2148" />
            <stop offset="100%" stopColor="#243144" />
          </linearGradient>
        </defs>

        <rect width="1440" height="820" fill="url(#ps-sky)" />

        <Layer depth={0.15} mx={mx} my={my}>
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#E3C39D" className="animate-twinkle" style={{ animationDelay: `${s.d}s`, transformOrigin: `${s.x}px ${s.y}px` }} />
          ))}
        </Layer>

        {/* moon inside layered paper rings */}
        <Layer depth={0.3} mx={mx} my={my}>
          <circle cx="1010" cy="360" r="330" fill="#0F2148" filter="url(#ps-soft)" />
          <circle cx="1010" cy="360" r="292" fill="#1B2E57" filter="url(#ps-soft)" />
          <circle cx="1010" cy="360" r="256" fill="#243144" filter="url(#ps-soft)" />
          <circle cx="1010" cy="360" r="250" fill="url(#ps-glow)" />
          <g>
            <circle cx="1010" cy="360" r="214" fill="url(#ps-moon)" />
            <circle cx="1010" cy="360" r="214" fill="#E3C39D" filter="url(#ps-veins)" opacity=".45" />
            <g fill="#A68868" opacity=".18">
              <circle cx="940" cy="300" r="26" />
              <circle cx="1080" cy="420" r="38" />
              <circle cx="1070" cy="270" r="14" />
              <circle cx="960" cy="450" r="12" />
            </g>
          </g>
        </Layer>

        {/* back hills */}
        <Layer depth={0.45} mx={mx} my={my}>
          <path filter="url(#ps-shadow)" fill="#30415A" d="M-40 560 L120 470 L210 520 L330 430 L460 520 L560 470 L700 540 L820 460 L930 540 L1060 450 L1180 530 L1290 470 L1480 540 L1480 820 L-40 820 Z" />
          <path filter="url(#ps-shadow)" fill="#3D5270" d="M-40 610 L90 540 L190 600 L300 520 L420 600 L540 548 L660 612 L780 540 L900 610 L1020 552 L1150 620 L1270 556 L1480 620 L1480 820 L-40 820 Z" />
        </Layer>

        {/* clouds */}
        <Layer depth={0.6} mx={mx} my={my}>
          <g filter="url(#ps-soft)">
            <path fill="#CDD5DB" d="M740 610 C740 590 770 580 786 594 C796 570 836 570 846 596 C866 588 888 600 884 616 L740 616 Z" />
            <path fill="#FFFFFF" d="M1180 590 C1180 566 1214 554 1232 572 C1244 544 1292 546 1300 576 C1324 566 1350 582 1344 600 L1180 600 Z" />
            <path fill="#FFFFFF" d="M120 640 C120 620 148 610 162 624 C172 602 208 604 214 628 C232 622 252 634 246 648 L120 648 Z" />
          </g>
        </Layer>

        {/* mid hills + water */}
        <Layer depth={0.75} mx={mx} my={my}>
          <path filter="url(#ps-shadow)" fill="#4B6382" d="M-40 680 C120 640 240 690 380 650 C520 612 640 676 800 646 C960 616 1080 676 1240 640 C1340 618 1420 640 1480 630 L1480 820 L-40 820 Z" />
          <g stroke="#6E84A0" strokeWidth="2" opacity=".55">
            {[700, 718, 736, 754].map((y, i) => (
              <line key={y} x1={200 + i * 30} y1={y} x2={1240 - i * 40} y2={y} />
            ))}
          </g>
        </Layer>

        {/* front paper waves */}
        <Layer depth={1} mx={mx} my={my}>
          <path filter="url(#ps-shadow)" fill="#A4B5C4" d="M-40 740 C100 712 220 750 360 726 C520 698 640 748 800 724 C960 700 1100 748 1260 720 C1360 704 1430 716 1480 712 L1480 820 L-40 820 Z" />
          <path filter="url(#ps-shadow)" fill="#CDD5DB" d="M-40 780 C140 758 280 790 440 770 C600 750 760 792 920 772 C1080 752 1240 788 1480 762 L1480 820 L-40 820 Z" />
        </Layer>

        {/* pine branches framing the top */}
        <Layer depth={0.9} mx={mx} my={my}>
          <g filter="url(#ps-soft)">
            <path d="M1460 60 C1360 90 1300 70 1220 120 C1170 150 1120 150 1070 140" stroke="#FFFFFF" strokeWidth="7" fill="none" strokeLinecap="round" />
            <path d="M1300 86 C1290 120 1260 140 1240 160" stroke="#FFFFFF" strokeWidth="4" fill="none" strokeLinecap="round" />
            <PinePuff x={1090} y={128} size={34} rot={-8} />
            <PinePuff x={1170} y={110} size={30} rot={6} />
            <PinePuff x={1250} y={150} size={28} rot={-4} />
            <PinePuff x={1330} y={70} size={32} rot={4} />
            <PinePuff x={1410} y={52} size={28} rot={-6} />
          </g>
        </Layer>

        {/* flying cranes */}
        <motion.g initial={{ x: -220, y: 300 }} animate={{ x: [-220, 1600], y: [300, 220, 260] }} transition={{ duration: 46, repeat: Infinity, ease: "linear" }}>
          <g transform="scale(.9)" filter="url(#ps-soft)">
            <Crane />
          </g>
        </motion.g>
        <motion.g initial={{ x: -400, y: 210 }} animate={{ x: [-400, 1500], y: [210, 160, 200] }} transition={{ duration: 62, repeat: Infinity, ease: "linear", delay: 6 }}>
          <g transform="scale(.55)" filter="url(#ps-soft)" opacity=".9">
            <Crane delay={0.4} />
          </g>
        </motion.g>
      </svg>
    </div>
  );
}
