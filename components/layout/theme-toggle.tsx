"use client";

import { useEffect, useState } from "react";
type Theme = "light" | "dark" | "system";
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const saved = localStorage.getItem("stories-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("stories-theme", theme);
  }, [theme]);
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => setTheme(next[theme])}
      aria-label={`Color theme: ${theme}. Change theme.`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}</span>
      <span className="sr-only">{theme}</span>
    </button>
  );
}
