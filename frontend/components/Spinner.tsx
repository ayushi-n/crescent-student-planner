import { cn } from "@/lib/utils";
import { BrandMark } from "./brand/Logo";

export default function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80", className)} aria-label="Loading" />;
}

export function PageLoader({ label = "Folding your plan…" }: { label?: string }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative grid h-16 w-16 place-items-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-sand-300/40" />
        <div className="marble-night relative grid h-14 w-14 place-items-center rounded-full shadow-night">
          <BrandMark className="h-8 w-8 animate-float" light />
        </div>
      </div>
      <p className="text-sm font-medium text-dusk-600">{label}</p>
    </div>
  );
}
