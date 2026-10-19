"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { ReactNode, useEffect } from "react";
import { DoodleField } from "./brand/Doodles";

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-night-800/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full max-w-lg overflow-hidden rounded-t-4xl bg-white shadow-lift sm:rounded-4xl"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="marble-night relative overflow-hidden px-6 pb-5 pt-6">
              <DoodleField count={6} seed={title.length} tone="dark" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
                  {description && <p className="mt-1 text-sm text-mist-300">{description}</p>}
                </div>
                <button onClick={onClose} aria-label="Close" className="rounded-xl p-1.5 text-mist-300 transition hover:bg-white/10 hover:text-white">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
