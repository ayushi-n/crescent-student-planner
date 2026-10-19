import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Crescent moon mark with a small star. Two-tone so it reads on light and dark. */
export function BrandMark({ className, light = false }: { className?: string; light?: boolean }) {
  const moon = light ? "#E3C39D" : "#071739";
  const star = light ? "#FFFFFF" : "#A68868";
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M30.5 7.5A17 17 0 1 0 40.5 36 14 14 0 0 1 30.5 7.5Z" fill={moon} />
      <path d="M30.5 7.5A17 17 0 0 0 19 10.5 15 15 0 0 1 28 9Z" fill={light ? "#FBF6EF" : "#4B6382"} opacity=".55" />
      <path d="M36 13l1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3Z" fill={star} />
    </svg>
  );
}

/** @deprecated old name, kept so older imports still compile */
export const CraneMark = BrandMark;

export default function Logo({ light = false, className, showTagline = true }: { light?: boolean; className?: string; showTagline?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className={cn("grid h-10 w-10 place-items-center rounded-2xl", light ? "bg-white/10 ring-1 ring-white/15" : "marble-mist ring-1 ring-white")}>
        <BrandMark className="h-7 w-7" light={light} />
      </span>
      <span className="leading-none">
        <span className={cn("block font-display text-[22px] font-semibold tracking-tight", light ? "text-white" : "text-night-700")}>
          {BRAND.name}
        </span>
        {showTagline && (
          <span className={cn("mt-1 block text-[11px] font-semibold", light ? "text-sand-300" : "text-sand-600")}>{BRAND.tagline}</span>
        )}
      </span>
    </div>
  );
}
