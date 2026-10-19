"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="marble-night fixed inset-x-2 bottom-2 z-40 flex justify-around rounded-3xl px-1 py-1.5 shadow-night md:hidden" style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}>
      {NAV_ITEMS.filter((i) => !(i as any).desktopOnly).map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={cn("relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold", active ? "text-on-sand" : "text-mist-400")}>
            {active && <motion.span layoutId="mnav-pill" className="marble-sand absolute inset-0 rounded-2xl" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <Icon size={19} className="relative" />
            <span className="relative">{item.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
