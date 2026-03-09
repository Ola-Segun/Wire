"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative w-9 h-9 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors flex items-center justify-center group"
      aria-label="Toggle theme"
    >
      <Sun
        className={`w-4 h-4 absolute transition-all duration-300 ${isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100 text-primary"}`}
      />
      <Moon
        className={`w-4 h-4 absolute transition-all duration-300 ${isDark ? "opacity-100 rotate-0 scale-100 text-primary" : "opacity-0 -rotate-90 scale-0"}`}
      />
    </button>
  );
};

export default ThemeToggle;
