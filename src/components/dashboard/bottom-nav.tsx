"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  { href: "/bento",     label: "Bento",     icon: PanelTop },
  { href: "/pulse",     label: "Pulse",     icon: Activity },
  { href: "/inbox",     label: "Inbox",     icon: Inbox },
  { href: "/clients",   label: "Clients",   icon: Users },
  { href: "/calendar",  label: "Calendar",  icon: CalendarDays },
  { href: "/skills",    label: "Skills",    icon: Brain },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

// 2 most-used items always shown in dormant mode
const PINNED_HREFS = ["/dashboard", "/inbox"];

const THEME_OPTIONS = [
  { value: "light",  label: "Light" },
  { value: "dark",   label: "Dark"  },
  { value: "system", label: "Auto"  },
];

const DORMANT_DELAY = 4000;
const SPRING = { type: "spring", stiffness: 340, damping: 30 } as const;
const SPRING_FAST = { type: "spring", stiffness: 420, damping: 32 } as const;

export function BottomNav() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [showSearch, setShowSearch] = useState(false);
  const [showTheme, setShowTheme]   = useState(false);
  const [query, setQuery]           = useState("");
  const [isDormant, setIsDormant]   = useState(false);
  const searchInputRef              = useRef<HTMLInputElement>(null);
  const dormantTimerRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef               = useRef(false);

  const wake = useCallback(() => {
    setIsDormant(false);
    if (dormantTimerRef.current) clearTimeout(dormantTimerRef.current);
    dormantTimerRef.current = setTimeout(() => {
      // Only go dormant when the cursor is not currently over the nav
      if (!isHoveringRef.current) setIsDormant(true);
    }, DORMANT_DELAY);
  }, []);

  useEffect(() => {
    wake();
    return () => { if (dormantTimerRef.current) clearTimeout(dormantTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [showSearch]);

  useEffect(() => {
    setShowSearch(false);
    setShowTheme(false);
    wake();
  }, [pathname, wake]);

  const toggleSearch = () => { wake(); setShowSearch((s) => !s); setShowTheme(false); };
  const toggleTheme  = () => { wake(); setShowTheme((t) => !t); setShowSearch(false); };

  const isDark = theme === "dark";

  // Dormant: 2 pinned items + the currently active item (deduplicated)
  const visibleNavItems = isDormant
    ? (() => {
        const pinned = NAV_ITEMS.filter((item) => PINNED_HREFS.includes(item.href));
        const active = NAV_ITEMS.find(
          (item) => pathname === item.href || pathname.startsWith(item.href + "/")
        );
        // Add active only if it isn't already one of the pinned two
        if (active && !PINNED_HREFS.includes(active.href)) {
          return [...pinned, active];
        }
        return pinned;
      })()
    : NAV_ITEMS;

  return (
    <div
      className="fixed bottom-5 left-0 right-0 px-5 pointer-events-none flex justify-center"
      onMouseEnter={() => { isHoveringRef.current = true; wake(); }}
      onMouseLeave={() => { isHoveringRef.current = false; wake(); }}
      onPointerDown={wake}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-2">

        {/* ── Expandable panels ── */}
        <AnimatePresence mode="wait">
          {showSearch && (
            <motion.div
              key="search-panel"
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={SPRING_FAST}
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
                  <button key={s} onClick={() => setQuery(s)} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {showTheme && (
            <motion.div
              key="theme-panel"
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={SPRING_FAST}
              className="bg-card/95 backdrop-blur-xl border border-border/60 rounded-full shadow-xl shadow-black/10 p-1 flex gap-0.5"
            >
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setTheme(opt.value); setShowTheme(false); }}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                    theme === opt.value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
          layout
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={SPRING}
          className={`flex items-center gap-0.5 px-2 rounded-full backdrop-blur-xl border overflow-hidden transition-[background-color,border-color,box-shadow,height] duration-500 ease-in-out ${
            isDormant
              ? "h-10 bg-card/8 border-border/10 shadow-sm"
              : "h-14.5 bg-card/95 border-border/60 shadow-xl shadow-black/10"
          }`}
        >
          {/* Nav items */}
          <AnimatePresence mode="popLayout" initial={false}>
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <motion.div
                  key={item.href}
                  layout
                  initial={{ opacity: 0, scale: 0.55 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.55 }}
                  transition={SPRING_FAST}
                  className="overflow-hidden"
                >
                  <Link
                    href={item.href}
                    style={{ height: isDormant ? 40 : 58 }}
                    className="relative flex flex-col items-center justify-center gap-0.75 px-3.5 rounded-full min-w-13 transition-[height] duration-500"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bottom-nav-pill"
                        className="absolute inset-0 rounded-full bg-primary/10"
                        transition={SPRING_FAST}
                      />
                    )}
                    <item.icon
                      className={`h-4.5 w-4.5 relative z-10 transition-colors duration-150 ${
                        isActive ? "text-primary" : isDormant ? "text-foreground/35" : "text-muted-foreground"
                      }`}
                    />
                    <AnimatePresence initial={false}>
                      {!isDormant && (
                        <motion.span
                          key="label"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15, ease: "easeInOut" }}
                          className={`text-[10px] font-medium relative z-10 leading-none overflow-hidden whitespace-nowrap ${
                            isActive ? "text-primary" : "text-muted-foreground/70"
                          }`}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Divider + Search + Theme — disappear when dormant */}
          <AnimatePresence mode="popLayout" initial={false}>
            {!isDormant && (
              <motion.div
                key="extras"
                layout
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.55 }}
                transition={SPRING_FAST}
                className="flex items-center h-14.5 overflow-hidden"
              >
                <div className="h-6 w-px bg-border/50 mx-1 shrink-0" />

                {/* Search */}
                <button
                  onClick={toggleSearch}
                  className={`relative flex flex-col items-center justify-center gap-0.75 px-3.5 rounded-full min-w-13 h-full transition-colors duration-150 ${
                    showSearch ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {showSearch && <div className="absolute inset-0 rounded-full bg-primary/10" />}
                  <Search className="h-4.5 w-4.5 relative z-10" />
                  <span className="text-[10px] font-medium relative z-10 leading-none">Search</span>
                </button>

                {/* Theme */}
                <button
                  onClick={toggleTheme}
                  className={`relative flex flex-col items-center justify-center gap-0.75 px-3.5 rounded-full min-w-13 h-full transition-colors duration-150 ${
                    showTheme ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {showTheme && <div className="absolute inset-0 rounded-full bg-primary/10" />}
                  <div className="relative h-4.5 w-4.5 z-10">
                    <Sun className={`h-4.5 w-4.5 absolute transition-all duration-300 ${isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"}`} />
                    <Moon className={`h-4.5 w-4.5 absolute transition-all duration-300 ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"}`} />
                  </div>
                  <span className="text-[10px] font-medium relative z-10 leading-none">Theme</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.nav>

      </div>
    </div>
  );
}
