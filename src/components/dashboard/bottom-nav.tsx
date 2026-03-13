"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  PanelTop,
  Inbox,
  Users,
  Brain,
  CalendarDays,
  Settings,
  Activity,
  Search,
  Sun,
  Moon,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home",      icon: LayoutDashboard },
  { href: "/workspace", label: "Workspace", icon: PanelTop },
  { href: "/bento", label: "Bento", icon: PanelTop },
  { href: "/pulse",     label: "Pulse",     icon: Activity },
  { href: "/inbox",     label: "Inbox",     icon: Inbox },
  { href: "/clients",   label: "Clients",   icon: Users },
  { href: "/calendar",  label: "Calendar",  icon: CalendarDays },
  { href: "/skills",    label: "Skills",    icon: Brain },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

const THEME_OPTIONS = [
  { value: "light",  label: "Light" },
  { value: "dark",   label: "Dark"  },
  { value: "system", label: "Auto"  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [showSearch, setShowSearch] = useState(false);
  const [showTheme, setShowTheme]   = useState(false);
  const [query, setQuery]           = useState("");
  const searchInputRef              = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [showSearch]);

  // Close panels on route change
  useEffect(() => {
    setShowSearch(false);
    setShowTheme(false);
  }, [pathname]);

  const toggleSearch = () => {
    setShowSearch((s) => !s);
    setShowTheme(false);
  };
  const toggleTheme = () => {
    setShowTheme((t) => !t);
    setShowSearch(false);
  };

  const isDark = theme === "dark";

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">

      {/* ── Expandable panels ── */}
      <AnimatePresence>

        {/* Search panel */}
        {showSearch && (
          <motion.div
            key="search-panel"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="w-80 bg-card/95 backdrop-blur-xl border border-border/60 rounded-2xl shadow-xl shadow-black/10 p-3"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background/60 focus-within:border-primary/40 focus-within:bg-secondary/50 transition-all">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients, messages, actions…"
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60"
                onKeyDown={(e) => e.key === "Escape" && setShowSearch(false)}
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-2 px-1">
              <span className="text-[10px] text-muted-foreground/60">Try:</span>
              {["Urgent today", "Action items", "Overdue"].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Theme panel */}
        {showTheme && (
          <motion.div
            key="theme-panel"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="bg-card/95 backdrop-blur-xl border border-border/60 rounded-full shadow-xl shadow-black/10 p-1 flex gap-0.5"
          >
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); setShowTheme(false); }}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                  theme === opt.value
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Nav pill ── */}
      <motion.nav
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 28, delay: 0.1 }}
        className="flex items-center gap-0.5 px-2 h-[58px] rounded-full bg-card/95 backdrop-blur-xl border border-border/60 shadow-xl shadow-black/10"
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center justify-center gap-[3px] px-3.5 py-2 rounded-full min-w-[52px]"
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-pill"
                  className="absolute inset-0 rounded-full bg-primary/10"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <item.icon
                className={`h-[18px] w-[18px] relative z-10 transition-colors duration-150 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <span
                className={`text-[10px] font-medium relative z-10 transition-colors duration-150 leading-none ${
                  isActive ? "text-primary" : "text-muted-foreground/70"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Divider */}
        <div className="h-6 w-px bg-border/50 mx-1 shrink-0" />

        {/* Search button */}
        <button
          onClick={toggleSearch}
          className={`relative flex flex-col items-center justify-center gap-[3px] px-3.5 py-2 rounded-full min-w-[52px] transition-colors duration-150 ${
            showSearch ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {showSearch && (
            <div className="absolute inset-0 rounded-full bg-primary/10" />
          )}
          <Search className="h-[18px] w-[18px] relative z-10" />
          <span className="text-[10px] font-medium relative z-10 leading-none">Search</span>
        </button>

        {/* Theme button */}
        <button
          onClick={toggleTheme}
          className={`relative flex flex-col items-center justify-center gap-[3px] px-3.5 py-2 rounded-full min-w-[52px] transition-colors duration-150 ${
            showTheme ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {showTheme && (
            <div className="absolute inset-0 rounded-full bg-primary/10" />
          )}
          <div className="relative h-[18px] w-[18px] z-10">
            <Sun
              className={`h-[18px] w-[18px] absolute transition-all duration-300 ${
                isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
              }`}
            />
            <Moon
              className={`h-[18px] w-[18px] absolute transition-all duration-300 ${
                isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"
              }`}
            />
          </div>
          <span className="text-[10px] font-medium relative z-10 leading-none">Theme</span>
        </button>
      </motion.nav>
    </div>
  );
}
