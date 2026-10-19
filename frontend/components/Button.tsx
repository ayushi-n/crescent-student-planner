import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold" | "night" | "glass";
  size?: "xs" | "sm" | "md" | "lg";
}

const VARIANTS: Record<string, string> = {
  primary: "bg-gradient-to-b from-dusk-500 to-dusk-600 text-white shadow-[0_8px_18px_-8px_rgba(61,82,112,.8)] hover:from-dusk-400 hover:to-dusk-600",
  night: "marble-night text-white shadow-night hover:brightness-125",
  gold: "marble-sand text-night-700 shadow-sand hover:brightness-105",
  secondary: "bg-white text-night-700 ring-1 ring-mist-200 hover:ring-dusk-300 hover:bg-mist-50",
  ghost: "text-dusk-700 hover:bg-dusk-50",
  danger: "bg-ember-50 text-ember-600 ring-1 ring-ember-100 hover:bg-ember-100",
  glass: "bg-white/10 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/20",
};
const SIZES: Record<string, string> = {
  xs: "h-7 px-2.5 text-xs gap-1 rounded-lg",
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-sm gap-2 rounded-2xl",
  lg: "h-14 px-7 text-base gap-2.5 rounded-2xl",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = "primary", size = "md", className, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-200",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;
