import { ReactNode } from "react";
import { Doodle } from "./brand/Doodles";

export default function EmptyState({
  doodle = "crane",
  title,
  description,
  action,
}: {
  doodle?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative mb-4 grid h-20 w-20 place-items-center">
        <div className="absolute inset-0 rounded-full bg-sand-100" />
        <div className="absolute inset-2 animate-spin-slow rounded-full border border-dashed border-sand-400/60" />
        <Doodle name={doodle} className="relative h-10 w-10 animate-float text-dusk-500" />
      </div>
      <p className="font-display text-base font-semibold text-night-700">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-mist-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
