import { cn, type Tone } from "@/lib/utils";
import { ReactNode } from "react";

const TONES: Record<Tone, string> = {
  danger: "bg-ember-50 text-ember-600 ring-ember-100",
  warning: "bg-sand-100 text-sand-800 ring-sand-200",
  info: "bg-dusk-50 text-dusk-700 ring-dusk-100",
  success: "bg-night-50 text-night-600 ring-night-100",
  neutral: "bg-mist-100 text-mist-700 ring-mist-200",
  brand: "bg-night-700 text-white ring-night-700",
  gold: "bg-sand-300 text-night-700 ring-sand-400",
};

export default function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}
