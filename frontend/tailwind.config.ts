import type { Config } from "tailwindcss";

/**
 * Palette (from the supplied crane/moon reference):
 *   night  #071739  deep navy      -> sidebar, headings, dark surfaces
 *   dusk   #4B6382  slate blue     -> primary actions, links, focus
 *   mist   #A4B5C4  blue-grey      -> borders, muted text on dark
 *   fog    #CDD5DB  pale mist      -> dividers, soft fills (mist-200)
 *   bronze #A68868  warm bronze    -> accents, warnings (sand-600)
 *   sand   #E3C39D  moon gold      -> highlights, CTAs on dark, progress
 * Each base colour is expanded into a scale so it can be used for tints.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Fraunces Variable'", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        night: {
          50: "#E8ECF3", 100: "#CBD3E1", 200: "#9AA9C2", 300: "#6A7EA0", 400: "#3C5079",
          500: "#1B2E57", 600: "#0F2148", 700: "#071739", 800: "#05112B", 900: "#030B1D",
        },
        dusk: {
          50: "#EEF1F5", 100: "#DCE2EA", 200: "#B9C5D5", 300: "#94A6BD", 400: "#6E84A0",
          500: "#4B6382", 600: "#3D5270", 700: "#30415A", 800: "#243144", 900: "#18202D",
        },
        mist: {
          50: "#F4F6F8", 100: "#E6EBF0", 200: "#CDD5DB", 300: "#B8C5D0", 400: "#A4B5C4",
          500: "#8A9DAF", 600: "#6F8396", 700: "#56687A",
        },
        sand: {
          50: "#FBF6EF", 100: "#F6EBDC", 200: "#EFD9BC", 300: "#E3C39D", 400: "#D6AE80",
          500: "#C49B6F", 600: "#A68868", 700: "#876C51", 800: "#66513D", 900: "#463829",
        },
        ember: { 50: "#FBF0EE", 100: "#F5DAD6", 300: "#DE9A92", 400: "#C97A72", 500: "#B4584F", 600: "#96443C" },
        paper: "#F3F5F7",
      },
      boxShadow: {
        paper: "0 1px 0 rgba(255,255,255,.7) inset, 0 1px 2px rgba(7,23,57,.06), 0 8px 24px -12px rgba(7,23,57,.18)",
        lift: "0 1px 0 rgba(255,255,255,.7) inset, 0 2px 4px rgba(7,23,57,.06), 0 18px 40px -16px rgba(7,23,57,.28)",
        moon: "0 0 0 6px rgba(227,195,157,.12), 0 0 60px 10px rgba(227,195,157,.35)",
        sand: "0 10px 24px -10px rgba(166,136,104,.65)",
        night: "0 14px 30px -12px rgba(7,23,57,.55)",
      },
      borderRadius: { "4xl": "2rem" },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0) rotate(var(--r,0deg))" }, "50%": { transform: "translateY(-10px) rotate(calc(var(--r,0deg) + 4deg))" } },
        drift: { "0%": { transform: "translateX(-8%)" }, "100%": { transform: "translateX(108%)" } },
        twinkle: { "0%,100%": { opacity: ".25", transform: "scale(.8)" }, "50%": { opacity: "1", transform: "scale(1.1)" } },
        flap: { "0%,100%": { transform: "scaleY(1)" }, "50%": { transform: "scaleY(.55)" } },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "pop-in": { "0%": { opacity: "0", transform: "scale(.9) translateY(6px)" }, "100%": { opacity: "1", transform: "scale(1) translateY(0)" } },
        draw: { to: { strokeDashoffset: "0" } },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        "float-slow": "float 11s ease-in-out infinite",
        drift: "drift 60s linear infinite",
        twinkle: "twinkle 3.2s ease-in-out infinite",
        flap: "flap .9s ease-in-out infinite",
        "spin-slow": "spin-slow 40s linear infinite",
        shimmer: "shimmer 2.2s linear infinite",
        "pop-in": "pop-in .35s cubic-bezier(.16,1,.3,1) both",
        draw: "draw 1.6s ease forwards",
      },
    },
  },
  plugins: [],
};
export default config;
