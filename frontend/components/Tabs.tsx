"use client";

import { motion } from "framer-motion";
import { ReactNode, useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface TabDef {
  label: string;
  count?: number;
  icon?: ReactNode;
  content: ReactNode;
}

export default function Tabs({ tabs, initial = 0, onChange }: { tabs: TabDef[]; initial?: number; onChange?: (i: number) => void }) {
  const [active, setActive] = useState(initial);
  const id = useId();
  return (
    <div>
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-mist-100/80 p-1 ring-1 ring-inset ring-mist-200/70">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            role="tab"
            aria-selected={active === i}
            onClick={() => {
              setActive(i);
              onChange?.(i);
            }}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              active === i ? "text-white" : "text-dusk-600 hover:text-night-700"
            )}
          >
            {active === i && (
              <motion.span layoutId={`tab-${id}`} className="marble-night absolute inset-0 rounded-xl shadow-night" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
            )}
            <span className="relative flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active === i ? "bg-sand-300 text-night-700" : "bg-white text-dusk-600")}>{tab.count}</span>
              )}
            </span>
          </button>
        ))}
      </div>
      <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {tabs[active].content}
      </motion.div>
    </div>
  );
}
