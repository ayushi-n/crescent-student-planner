export type ThemePref = "light" | "dark" | "system";
const KEY = "crescent_theme";

export function getTheme(): ThemePref {
  if (typeof window === "undefined") return "system";
  return (window.localStorage.getItem(KEY) as ThemePref) || "system";
}

export function applyTheme(pref: ThemePref = getTheme()) {
  if (typeof window === "undefined") return;
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(pref: ThemePref) {
  window.localStorage.setItem(KEY, pref);
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent("crescent-theme"));
}

/** Inlined in <head> so the right theme is applied before first paint (no flash). */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;
