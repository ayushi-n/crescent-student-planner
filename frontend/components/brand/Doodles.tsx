import { cn } from "@/lib/utils";

/**
 * Hand-drawn line doodles (a student's notebook margins: cranes, stars,
 * pencils, books, paper planes...) scattered across backgrounds. Positions
 * come from a seeded PRNG so server and client render identically.
 */
export const DOODLES: Record<string, string> = {
  crane: "M6 40 L26 30 L32 12 L36 30 L58 22 L40 38 L46 52 L30 42 Z M32 12 L30 42 M26 30 L30 42",
  star: "M32 8 C34 24 40 30 56 32 C40 34 34 40 32 56 C30 40 24 34 8 32 C24 30 30 24 32 8Z",
  swirl: "M12 40 C12 20 40 14 46 30 C50 42 34 48 28 38 C24 30 36 26 38 34",
  pencil: "M14 50 L46 18 L54 26 L22 58 L12 60 Z M42 22 L50 30 M14 50 L22 58",
  book: "M8 18 C18 14 26 16 32 22 C38 16 46 14 56 18 L56 50 C46 46 38 48 32 54 C26 48 18 46 8 50 Z M32 22 L32 54",
  cloud: "M14 44 C6 44 6 32 14 32 C14 22 28 20 32 28 C36 18 52 20 50 32 C58 32 58 44 50 44 Z",
  plane: "M6 30 L58 10 L40 54 L30 36 Z M30 36 L58 10 M6 46 C12 50 18 50 24 46",
  bulb: "M24 40 C14 34 16 14 32 14 C48 14 50 34 40 40 L40 46 L24 46 Z M26 52 L38 52 M28 58 L36 58 M32 4 L32 8 M12 14 L15 17 M52 14 L49 17",
  moon: "M40 10 C26 14 22 34 32 46 C40 54 52 52 56 46 C40 50 28 34 40 10Z",
  pine: "M6 52 C20 46 34 40 58 36 M18 47 L13 38 M18 47 L24 37 M30 43 L26 33 M30 43 L37 34 M43 39 L41 30 M43 39 L50 32",
  squiggle: "M4 32 C12 24 16 40 24 32 C32 24 36 40 44 32 C52 24 56 40 60 32",
  coffee: "M14 26 L44 26 L40 54 L18 54 Z M44 32 C54 32 54 44 42 44 M24 18 C22 14 26 12 24 8 M32 18 C30 14 34 12 32 8",
  flask: "M26 8 L38 8 M28 8 L28 26 L14 52 C12 56 14 58 18 58 L46 58 C50 58 52 56 50 52 L36 26 L36 8 M20 44 L44 44",
  sparkle: "M32 14 L32 50 M14 32 L50 32 M20 20 L44 44 M44 20 L20 44",
  check: "M10 34 L26 48 L54 16",
  heart: "M32 52 C10 38 8 22 20 16 C27 13 31 18 32 22 C33 18 37 13 44 16 C56 22 54 38 32 52Z",
};

export function Doodle({ name, className, strokeWidth = 2.2 }: { name: keyof typeof DOODLES | string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("doodle", className)} stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      <path d={DOODLES[name] || DOODLES.star} />
    </svg>
  );
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function DoodleField({
  count = 14,
  seed = 7,
  tone = "light",
  className,
  names,
}: {
  count?: number;
  seed?: number;
  tone?: "light" | "dark" | "gold";
  className?: string;
  names?: string[];
}) {
  const rand = mulberry32(seed);
  const pool = names || Object.keys(DOODLES);
  const color = tone === "dark" ? "text-white/[0.13]" : tone === "gold" ? "text-sand-400/40" : "text-dusk-400/[0.16]";
  const items = Array.from({ length: count }, (_, i) => {
    const name = pool[Math.floor(rand() * pool.length)];
    return {
      key: i,
      name,
      left: rand() * 96,
      top: rand() * 92,
      size: 26 + rand() * 34,
      rot: Math.round(rand() * 50 - 25),
      delay: -(rand() * 10),
      slow: rand() > 0.5,
      accent: rand() > 0.8,
    };
  });
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      {items.map((d) => (
        <div
          key={d.key}
          className={cn("absolute", d.slow ? "animate-float-slow" : "animate-float", d.accent && tone !== "gold" ? (tone === "dark" ? "text-sand-300/30" : "text-sand-500/30") : color)}
          style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s`, ["--r" as any]: `${d.rot}deg` }}
        >
          <Doodle name={d.name} className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}
