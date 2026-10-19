import { cn } from "@/lib/utils";
import { HTMLAttributes, ReactNode } from "react";

export default function Card({
  children,
  className,
  padded = true,
  interactive = false,
  ...rest
}: { children: ReactNode; className?: string; padded?: boolean; interactive?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "paper-card",
        padded && "p-5 md:p-6",
        interactive && "transition duration-300 hover:-translate-y-0.5 hover:shadow-lift",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, hint, right, className }: { icon?: ReactNode; title: string; hint?: string; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3">
        {icon && <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-dusk-50 text-dusk-600">{icon}</span>}
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight text-night-700">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-mist-600">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}
