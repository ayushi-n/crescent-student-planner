"use client";

import { motion } from "framer-motion";
import { useId } from "react";

/**
 * The moon is the app's progress indicator: it waxes from a thin crescent to
 * a full moon as you finish today's study sessions. 0 = new moon, 1 = full.
 */
export function moonShadowPath(p: number, r: number, cx: number, cy: number) {
  const phase = Math.max(0, Math.min(1, p));
  const rx = Math.abs(1 - 2 * phase) * r;
  const sweep = phase < 0.5 ? 0 : 1;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweep} ${cx} ${cy - r} Z`;
}

export default function Moon({
  value,
  size = 160,
  glow = true,
  showCraters = true,
}: {
  value: number;
  size?: number;
  glow?: boolean;
  showCraters?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const r = 46;
  const shown = value >= 0.999 ? 1 : Math.max(0.04, value);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {glow && (
        <div
          className="absolute inset-[-18%] rounded-full opacity-70 blur-2xl"
          style={{ background: `radial-gradient(circle, rgba(227,195,157,${0.25 + value * 0.45}) 0%, transparent 65%)` }}
        />
      )}
      <svg viewBox="0 0 100 100" className="relative h-full w-full" role="img" aria-label={`${Math.round(value * 100)}% of today's plan done`}>
        <defs>
          <radialGradient id={`lit-${id}`} cx="38%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#FBF6EF" />
            <stop offset="45%" stopColor="#EFD9BC" />
            <stop offset="80%" stopColor="#E3C39D" />
            <stop offset="100%" stopColor="#C49B6F" />
          </radialGradient>
          <filter id={`veins-${id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.035 0.08" numOctaves="4" seed="9" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 .65 0 0 0 0 .53 0 0 0 0 .41 1 0 0 0 0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0 .55 0 0 0 .35 0 0" />
            </feComponentTransfer>
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <clipPath id={`clip-${id}`}>
            <circle cx="50" cy="50" r={r} />
          </clipPath>
        </defs>
        <circle cx="50" cy="50" r={r} fill={`url(#lit-${id})`} />
        <circle cx="50" cy="50" r={r} fill="#E3C39D" filter={`url(#veins-${id})`} opacity=".9" />
        {showCraters && (
          <g fill="#A68868" opacity=".22">
            <circle cx="36" cy="40" r="6" />
            <circle cx="60" cy="62" r="8" />
            <circle cx="58" cy="32" r="3.5" />
            <circle cx="40" cy="66" r="3" />
          </g>
        )}
        <g clipPath={`url(#clip-${id})`}>
          <motion.path
            initial={false}
            animate={{ d: moonShadowPath(shown, r + 0.5, 50, 50) }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            fill="#071739"
            opacity=".82"
          />
        </g>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth=".8" />
      </svg>
    </div>
  );
}
