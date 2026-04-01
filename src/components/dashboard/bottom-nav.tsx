"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
  Bell,
  Hash,
  ExternalLink,
} from "lucide-react";
import { NotificationPanel } from "./notification-center";

const NAV_ITEMS = [
  // { href: "/dashboard", label: "Home",      icon: LayoutDashboard },
  { href: "/workspace", label: "Workspace", icon: PanelTop },
  // { href: "/bento",     label: "Bento",     icon: PanelTop },
  { href: "/pulse",     label: "Pulse",     icon: Activity },
  // { href: "/inbox",     label: "Inbox",     icon: Inbox },
  { href: "/clients",   label: "Clients",   icon: Users },
  { href: "/calendar",  label: "Calendar",  icon: CalendarDays },
  { href: "/skills",    label: "Skills",    icon: Brain },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

// 2 most-used items always shown in dormant mode
const PINNED_HREFS = ["/workspace", "/pulse"];

const THEME_OPTIONS = [
  { value: "light",  label: "Light" },
  { value: "dark",   label: "Dark"  },
  { value: "system", label: "Auto"  },
];

const PLATFORM_COLORS: Record<string, string> = {
  gmail:    "bg-red-500/20 text-red-400",
  slack:    "bg-purple-500/20 text-purple-400",
  whatsapp: "bg-green-500/20 text-green-400",
  discord:  "bg-indigo-500/20 text-indigo-400",
};

const SUGGESTIONS = [
  "Find where client mentioned budget",
  "Messages about project deadline",
  "Show payment discussions",
  "Scope change requests this week",
];

const DORMANT_DELAY = 4000;
const SPRING = { type: "spring", stiffness: 340, damping: 30 } as const;
const SPRING_FAST = { type: "spring", stiffness: 420, damping: 32 } as const;

interface BottomNavProps {
  onOpenCommandPalette?: () => void;
}

export function BottomNav({ onOpenCommandPalette }: BottomNavProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [showSearch, setShowSearch]       = useState(false);
  const [showTheme, setShowTheme]         = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [query, setQuery]                 = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isDormant, setIsDormant]         = useState(false);
  const searchInputRef                    = useRef<HTMLInputElement>(null);
  const dormantTimerRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef                     = useRef(false);

  const unreadCount = useQuery(api.skills.getUnreadCount) ?? 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useQuery(
    api.messages.search,
    debouncedQuery.length >= 2 ? { query: debouncedQuery, limit: 8 } : "skip"
  );

  const wake = useCallback(() => {
    setIsDormant(false);
    if (dormantTimerRef.current) clearTimeout(dormantTimerRef.current);
    dormantTimerRef.current = setTimeout(() => {
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
    setShowNotifications(false);
    wake();
  }, [pathname, wake]);

  // ⌘K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenCommandPalette?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenCommandPalette]);

  const closeAll = () => {
    setShowSearch(false);
    setShowTheme(false);
    setShowNotifications(false);
  };

  const toggleSearch = () => {
    wake();
    setShowTheme(false);
    setShowNotifications(false);
    setShowSearch((s) => !s);
  };

  const toggleTheme = () => {
    wake();
    setShowSearch(false);
    setShowNotifications(false);
    setShowTheme((t) => !t);
  };

  const toggleNotifications = () => {
    wake();
    setShowSearch(false);
    setShowTheme(false);
    setShowNotifications((n) => !n);
  };

  const isDark = theme === "dark";

  // Dormant: 2 pinned items + the currently active item (deduplicated)
  const visibleNavItems = isDormant
    ? (() => {
        const pinned = NAV_ITEMS.filter((item) => PINNED_HREFS.includes(item.href));
        const active = NAV_ITEMS.find(
          (item) => pathname === item.href || pathname.startsWith(item.href + "/")
        );
        if (active && !PINNED_HREFS.includes(active.href)) {
          return [...pinned, active];
        }
        return pinned;
      })()
    : NAV_ITEMS;

  return (
    <div
      className="fixed bottom-5 left-0 right-0 px-5 pointer-events-none flex justify-center z-50"
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
              className="w-[440px] flex flex-col items-stretch overflow-hidden bg-card/95 backdrop-blur-xl border border-border/60 rounded-2xl shadow-xl shadow-black/10 origin-bottom"
            >
              <div className="flex-1 max-h-[300px] overflow-y-auto scrollbar-thin p-1.5 flex flex-col-reverse justify-end">
                {/* Live search results */}
                {query.length >= 2 && (
                  <div className="pb-2">
                    {results === undefined && (
                      <div className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                        Searching…
                      </div>
                    )}
                    {results && results.length === 0 && (
                      <div className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                        No results for "{query}"
                      </div>
                    )}
                    {results && results.length > 0 && (
                      <>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 px-2.5 py-1.5">
                          {results.length} result{results.length !== 1 ? "s" : ""}
                        </p>
                        {results.map((msg: any) => (
                          <Link
                            key={msg._id}
                            href={`/clients/${msg.clientId}`}
                            onClick={closeAll}
                            className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent transition-colors group"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-xs font-medium text-foreground truncate">
                                  {(msg as any).clientName ?? "Unknown"}
                                </span>
                                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${PLATFORM_COLORS[msg.platform] ?? "bg-muted text-muted-foreground"}`}>
                                  {msg.platform}
                                </span>
                                {msg.aiMetadata?.priorityScore >= 70 && (
                                  <span className="text-[9px] font-bold text-urgent">P{msg.aiMetadata.priorityScore}</span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-1">
                                {msg.text}
                              </p>
                            </div>
                            <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                          </Link>
                        ))}
                      </>
                    )}
                  </div>
                )}
                
                {/* Suggestions (empty state) */}
                {!query && (
                  <div className="pb-2 pt-1.5">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 px-2.5 py-1.5">
                      Try asking
                    </p>
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        className="w-full text-left px-2.5 py-2 text-sm text-secondary-foreground hover:bg-accent hover:text-foreground rounded-lg transition-colors flex items-center gap-2"
                        onMouseDown={() => { setQuery(s); }}
                      >
                        <Hash className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-border/40 bg-card/80">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-background/60 focus-within:border-primary/40 focus-within:bg-secondary/50 transition-all">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search clients, messages, actions…"
                    className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setShowSearch(false);
                      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); closeAll(); onOpenCommandPalette?.(); }
                    }}
                  />
                  {query && (
                    <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {!query && (
                  <div className="flex items-center gap-2 mt-2 px-1">
                    <span className="text-[10px] text-muted-foreground/60">Try:</span>
                    {["Urgent today", "Action items", "Overdue"].map((s) => (
                      <button key={s} onClick={() => setQuery(s)} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                        {s}
                      </button>
                    ))}
                    <button
                      onClick={() => { closeAll(); onOpenCommandPalette?.(); }}
                      className="ml-auto flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors font-medium border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded"
                    >
                      ⌘K
                    </button>
                  </div>
                )}
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

          {/* Notification panel — rendered as NotificationCenter popover */}
          {showNotifications && (
            <motion.div
              key="notification-panel"
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={SPRING_FAST}
              className="relative"
            >
              <NotificationCenterPanel onClose={() => setShowNotifications(false)} />
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
              ? unreadCount > 0
                ? "h-10 bg-urgent/[0.02] border-urgent/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                : "h-10 bg-card/8 border-border/10 shadow-sm"
              : "h-[58px] bg-card/95 border-border/60 shadow-xl shadow-black/10"
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
                    className="relative flex flex-col items-center justify-center gap-[3px] px-3.5 rounded-full min-w-[52px] transition-[height] duration-500"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bottom-nav-pill"
                        className="absolute inset-0 rounded-full bg-primary/10"
                        transition={SPRING_FAST}
                      />
                    )}
                    <item.icon
                      className={`h-[18px] w-[18px] relative z-10 transition-colors duration-150 ${
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

          {/* Divider + extras — disappear when dormant */}
          <AnimatePresence mode="popLayout" initial={false}>
            {!isDormant && (
              <motion.div
                key="extras"
                layout
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.55 }}
                transition={SPRING_FAST}
                className="flex items-center h-[58px] overflow-hidden"
              >
                <div className="h-6 w-px bg-border/50 mx-1 shrink-0" />

                {/* Bell / Notifications */}
                <button
                  id="bottom-nav-bell"
                  onClick={toggleNotifications}
                  className={`relative flex flex-col items-center justify-center gap-[3px] px-3.5 rounded-full min-w-[52px] h-full transition-colors duration-150 ${
                    showNotifications ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {showNotifications && <div className="absolute inset-0 rounded-full bg-primary/10" />}
                  <div className="relative">
                    <Bell className="h-[18px] w-[18px] relative z-10" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 rounded-full bg-urgent text-white text-[8px] font-bold flex items-center justify-center px-0.5 z-20">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium relative z-10 leading-none">Alerts</span>
                </button>

                {/* Search */}
                <button
                  onClick={toggleSearch}
                  className={`relative flex flex-col items-center justify-center gap-[3px] px-3.5 rounded-full min-w-[52px] h-full transition-colors duration-150 ${
                    showSearch ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {showSearch && <div className="absolute inset-0 rounded-full bg-primary/10" />}
                  <Search className="h-[18px] w-[18px] relative z-10" />
                  <span className="text-[10px] font-medium relative z-10 leading-none">Search</span>
                </button>

                {/* Theme */}
                <button
                  onClick={toggleTheme}
                  className={`relative flex flex-col items-center justify-center gap-[3px] px-3.5 rounded-full min-w-[52px] h-full transition-colors duration-150 ${
                    showTheme ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {showTheme && <div className="absolute inset-0 rounded-full bg-primary/10" />}
                  <div className="relative h-[18px] w-[18px] z-10">
                    <Sun className={`h-[18px] w-[18px] absolute transition-all duration-300 ${isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"}`} />
                    <Moon className={`h-[18px] w-[18px] absolute transition-all duration-300 ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"}`} />
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

// ---- Inline notification panel rendered above the nav pill ----
function NotificationCenterPanel({ onClose }: { onClose: () => void }) {
  return <NotificationPanel onClose={onClose} />;
}
