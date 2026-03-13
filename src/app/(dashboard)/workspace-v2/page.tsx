"use client";

import { useEffect, useState, memo, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Inbox,
  AlertTriangle,
  Users,
  Zap,
  Bell,
  Heart,
  Plus,
  X,
  LayoutGrid,
  Settings2,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  FileText,
  Newspaper,
  Loader2,
  CalendarDays,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CheckSquare,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import {
  formatRelativeTime,
  getDeadlineProximity,
  getDayBounds,
  getWeekBounds,
  formatTimeOfDay,
  getMonthBounds,
} from "@/lib/date-utils";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { GlassDateStrip } from "@/components/dashboard/glass-date-strip";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
  LayoutGroup,
} from "framer-motion";
import { Input } from "@/components/ui/input";
import { GlassCalendar } from "@/components/ui/glass-calendar";

// ============================================
// ANIMATIONS & UTILS
// ============================================
const SPRING = { type: "spring" as const, stiffness: 200, damping: 22, mass: 0.8 };
const SPRING_FAST = { type: "spring" as const, stiffness: 400, damping: 35, mass: 0.5 };
const EASE_OUT_QUINT: [number, number, number, number] = [0.23, 1, 0.32, 1];

function NumberTicker({ value, className }: { value: number; className?: string }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20, mass: 0.5 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span className={className}>{display}</motion.span>;
}

function useMeasure<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBounds({ width, height });
    });
    ro.observe(el);
    setBounds({ width: el.offsetWidth, height: el.offsetHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, bounds] as const;
}

// ============================================
// TOOLBAR (From Bento, adjusted for v2)
// ============================================
interface ToolbarProps {
  editing: boolean;
  onToggleEdit: () => void;
  onAddWidget: (type: string) => void;
  widgetRegistry: { type: string; name: string; icon: React.ReactNode }[];
}

function WorkspaceV2Toolbar({
  editing,
  onToggleEdit,
  onAddWidget,
  widgetRegistry,
}: ToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [primaryRef, primaryBounds] = useMeasure();
  const [secondaryRef, secondaryBounds] = useMeasure();
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const currentWidth = isExpanded ? secondaryBounds.width : primaryBounds.width;
  const initialWidth = primaryBounds.width > 0 ? primaryBounds.width : "auto";

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="relative">
        <motion.div
          className="relative h-11 rounded-full bg-card/80 backdrop-blur-xl border border-white/10 overflow-hidden shadow-sm flex items-center"
          initial={{ width: initialWidth }}
          animate={primaryBounds.width > 0 ? { width: currentWidth } : { width: initialWidth }}
          transition={isMounted ? SPRING : { duration: 0 }}
        >
          <motion.div
            className="h-full flex"
            animate={{ x: isExpanded ? -(primaryBounds.width) : 0 }}
            transition={isMounted ? SPRING : { duration: 0 }}
          >
            {/* Primary panel */}
            <div
              ref={primaryRef as React.RefObject<HTMLDivElement>}
              className="flex items-center gap-3 pl-4 pr-3 shrink-0 h-full whitespace-nowrap"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <LayoutGrid className="h-4 w-4 text-primary" />
                <span>Workspace V2</span>
              </div>
              <div className="w-px h-5 bg-border/60" />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsExpanded(true)}
                className="flex items-center gap-1.5 h-8 pl-3 pr-2.5 rounded-full bg-muted/80 hover:bg-accent transition-colors text-xs font-medium text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                <span>Customize</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </motion.button>
            </div>

            {/* Secondary panel */}
            <div
              ref={secondaryRef as React.RefObject<HTMLDivElement>}
              className="flex items-center gap-2 pl-1 pr-3 shrink-0 h-full whitespace-nowrap"
              style={{
                position: isExpanded ? "relative" : "absolute",
                opacity: isExpanded ? 1 : 0,
                pointerEvents: isExpanded ? "auto" : "none",
              }}
            >
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { setIsExpanded(false); setShowPicker(false); }}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-muted hover:bg-accent transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </motion.button>
              <button
                onClick={() => setShowPicker(!showPicker)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Widget
              </button>
              <button
                onClick={() => { onToggleEdit(); setIsExpanded(false); setShowPicker(false); }}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-colors ${
                  editing
                    ? "bg-success text-white hover:bg-success/90 shadow-lg shadow-success/20"
                    : "border border-border hover:bg-accent"
                }`}
              >
                {editing ? "Done" : <><Settings2 className="h-3.5 w-3.5" />Edit</>}
              </button>
            </div>
          </motion.div>
        </motion.div>

        {/* Widget picker dropdown */}
        <AnimatePresence>
          {showPicker && isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-14 z-50 bg-card/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl shadow-black/20 p-3 w-64"
            >
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Drag to Grid
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {widgetRegistry.map((w) => (
                  <button
                    key={w.type}
                    onClick={() => { onAddWidget(w.type); setShowPicker(false); setIsExpanded(false); }}
                    className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-accent/80 transition-colors text-left border border-transparent hover:border-white/5"
                  >
                    <span className="text-primary shrink-0 drop-shadow-sm">{w.icon}</span>
                    <span className="text-xs font-medium text-foreground truncate">{w.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================
// MODERN WIDGETS
// ============================================

// 1. STATS OVERVIEW (Bento style)
const STATS_GRID = [
  { label: "Unread",   key: "unreadCount",      icon: Inbox,          bg: "bg-primary/10",  fg: "text-primary",  num: "text-primary" },
  { label: "Urgent",   key: "urgentCount",       icon: AlertTriangle,  bg: "bg-urgent/10",   fg: "text-urgent",   num: "text-urgent" },
  { label: "Actions",  key: "actionItemCount",   icon: Zap,            bg: "bg-warning/10",  fg: "text-warning",  num: "text-warning" },
  { label: "Clients",  key: "activeClientCount", icon: Users,          bg: "bg-success/10",  fg: "text-success",  num: "text-success" },
] as const;

const StatsOverviewWidget = memo(function StatsOverviewWidget() {
  const stats = useQuery(api.analytics.getDailyStats);

  return (
    <div className="surface-raised rounded-2xl h-full p-4 grid grid-cols-2 grid-rows-2 gap-3 bg-card/40 backdrop-blur-md">
      {STATS_GRID.map((m) => {
        const value = (stats as any)?.[m.key] ?? 0;
        const Icon = m.icon;
        return (
          <div key={m.label} className="flex flex-col justify-between p-3 rounded-xl bg-background/20 border border-white/5 hover:bg-background/40 transition-colors group">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.bg} group-hover:scale-105 transition-transform`}>
              <Icon className={`h-4 w-4 ${m.fg}`} />
            </div>
            <div className="mt-2">
              <p className={`text-2xl font-mono font-bold ${m.num}`}>
                <NumberTicker value={value} />
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{m.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
});

// 2. ANIMATED SIGNAL FEED (Revenue Radar)
const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  deal:        { bg: "bg-success/10",  text: "text-success",          label: "Deal",     dot: "bg-success" },
  expansion:   { bg: "bg-primary/10",  text: "text-primary",          label: "Upsell",   dot: "bg-primary" },
  contraction: { bg: "bg-urgent/10",   text: "text-urgent",           label: "Risk",     dot: "bg-urgent" },
  critical:    { bg: "bg-urgent/10",   text: "text-urgent",           label: "Critical", dot: "bg-urgent" },
  warning:     { bg: "bg-warning/10",  text: "text-warning",          label: "Warning",  dot: "bg-warning" },
  info:        { bg: "bg-primary/10",  text: "text-primary",          label: "Info",     dot: "bg-primary" },
  neutral:     { bg: "bg-muted",       text: "text-muted-foreground", label: "Signal",   dot: "bg-muted-foreground/60" },
};

const AnimatedSignalFeedWidget = memo(function AnimatedSignalFeedWidget() {
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });

  const displayItems = useMemo(() => {
    const list = (outputs ?? []) as any[];
    const revenue = list.filter((o) => o.skillSlug === "revenue_radar");
    return revenue.length > 0 ? revenue : list;
  }, [outputs]);

  return (
    <div className="surface-raised rounded-2xl h-full p-4 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <DollarSign className="h-4 w-4 text-success" />
        <span className="text-sm font-display font-semibold text-foreground">Revenue Signals</span>
        {displayItems.length > 0 && (
          <motion.span
            key={displayItems.length}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING_FAST}
            className="ml-auto text-[10px] font-mono font-bold bg-success/10 text-success px-1.5 py-0.5 rounded-full"
          >
            {displayItems.length}
          </motion.span>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative">
        {!outputs ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            No revenue signals yet
          </div>
        ) : (
          <motion.div
            className="space-y-1.5 overflow-y-auto h-full scrollbar-thin pb-4"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
          >
            {displayItems.slice(0, 8).map((o: any) => {
              const meta = o.metadata as Record<string, any> | undefined;
              const sigType = meta?.signalType ?? meta?.type ?? o.severity ?? "neutral";
              const s = SIGNAL_STYLES[sigType] ?? SIGNAL_STYLES.neutral;
              return (
                <motion.div
                  key={o._id}
                  variants={{
                    hidden: { opacity: 0, y: -16, scale: 0.94 },
                    visible: { opacity: 1, y: 0, scale: 1 },
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 26 }}
                >
                  <Link
                    href={`/clients/${o.clientId}`}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl border border-white/5 bg-background/20 hover:bg-background/40 transition-colors group"
                  >
                    <span className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${s.dot}`} style={{ boxShadow: `0 0 6px var(--${s.dot.split('-')[1]})` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-medium text-foreground truncate flex-1 group-hover:text-primary transition-colors">
                          {o.title ?? "Signal"}
                        </span>
                        <span className={`shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase ${s.bg} ${s.text}`}>
                          {s.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 group-hover:text-foreground/80 transition-colors">
                        {o.content}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background/40 to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
});

// 3. DEADLINE TICKER (Glassified)
const DeadlineTickerWidget = memo(function DeadlineTickerWidget() {
  const { start: dayStart, end: dayEnd }   = useMemo(() => getDayBounds(),  []);
  const { start: weekStart, end: weekEnd } = useMemo(() => getWeekBounds(), []);

  const pendingAll = useQuery(api.commitments.getPending);

  const overdue  = (pendingAll ?? []).filter((c: any) => c.isOverdue).length;
  const dueToday = (pendingAll ?? []).filter(
    (c: any) => !c.isOverdue && c.dueDate != null && c.dueDate >= dayStart && c.dueDate <= dayEnd
  ).length;
  const dueWeek  = (pendingAll ?? []).filter(
    (c: any) => c.dueDate != null && c.dueDate >= weekStart && c.dueDate <= weekEnd
  ).length;

  const TICKERS = [
    { label: "Overdue",     value: overdue,  color: "text-urgent",  bg: "bg-urgent/10"  },
    { label: "Due Today",   value: dueToday, color: "text-warning", bg: "bg-warning/10" },
    { label: "This Week",   value: dueWeek,  color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div className="surface-raised rounded-2xl h-full p-4 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Clock className="h-4 w-4 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
        <span className="text-sm font-display font-semibold text-foreground">Deadlines</span>
        <Link href="/calendar" className="ml-auto text-[10px] text-primary hover:text-primary/80 font-medium">
          Calendar →
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-around">
        {TICKERS.map(({ label, value, color, bg }) => (
          <div key={label} className="flex flex-col items-center gap-1 group">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${bg} border border-white/5 group-hover:scale-105 transition-transform shadow-inner`}>
              <span className={`text-2xl font-mono font-bold ${color}`}>
                <NumberTicker value={value} />
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono mt-1 opacity-80 group-hover:opacity-100 transition-opacity">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// 4. VERTICAL SKILLS (Animated Tabs)
const SKILL_TABS = [
  { id: "all",      label: "All",      filter: null       },
  { id: "critical", label: "Critical", filter: "critical" },
  { id: "warning",  label: "Warning",  filter: "warning"  },
  { id: "info",     label: "Info",     filter: "info"     },
] as const;

const AUTO_PLAY_MS = 6000;

const VerticalSkillsWidget = memo(function VerticalSkillsWidget() {
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState(1);
  const activeTab = SKILL_TABS[activeIdx];

  useEffect(() => {
    const step = 50;
    const steps = AUTO_PLAY_MS / step;
    let tick = 0;
    const id = setInterval(() => {
      tick++;
      const p = tick / steps;
      setProgress(Math.min(p, 1));
      if (tick >= steps) {
        clearInterval(id);
        setDirection(1);
        setActiveIdx((prev) => (prev + 1) % SKILL_TABS.length);
        setProgress(0);
      }
    }, step);
    return () => clearInterval(id);
  }, [activeIdx]);

  const selectTab = (idx: number) => {
    setDirection(idx > activeIdx ? 1 : -1);
    setActiveIdx(idx);
    setProgress(0);
  };

  const filtered = useMemo(() => {
    const list = (outputs ?? []) as any[];
    if (!activeTab.filter) return list;
    return list.filter((o) => o.severity === activeTab.filter);
  }, [outputs, activeTab]);

  return (
    <div className="surface-raised rounded-2xl h-full flex overflow-hidden bg-card/40 backdrop-blur-md">
      <div className="w-24 border-r border-white/5 flex flex-col p-2 gap-1 shrink-0 bg-background/20">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2 mb-1 mt-1">
          Insights
        </p>
        {SKILL_TABS.map((tab, idx) => {
          const isActive = activeIdx === idx;
          return (
            <button
              key={tab.id}
              onClick={() => selectTab(idx)}
              className={`relative flex flex-col items-start px-2 py-2.5 rounded-xl text-left transition-colors overflow-hidden ${
                isActive
                  ? "bg-primary/20 border border-primary/30 text-primary shadow-[0_0_10px_rgba(var(--primary),0.1)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span className={`text-xs font-semibold relative z-10 ${isActive ? "text-primary" : ""}`}>{tab.label}</span>
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 h-0.5 bg-primary rounded-full transition-none shadow-[0_0_8px_rgba(var(--primary),0.8)]"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
            </button>
          );
        })}
        <Link
          href="/skills"
          className="mt-auto text-[9px] text-primary/70 hover:text-primary px-2 py-2 font-medium transition-colors"
        >
          Explore →
        </Link>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeTab.id}
            initial={{ opacity: 0, y: direction > 0 ? 14 : -14, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: direction > 0 ? -14 : 14, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: EASE_OUT_QUINT }}
            className="absolute inset-0 overflow-y-auto px-4 py-4 scrollbar-thin space-y-2"
          >
            {!outputs ? (
              <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                No {activeTab.label.toLowerCase()} insights
              </div>
            ) : (
              filtered.slice(0, 8).map((o: any, i: number) => (
                <motion.div
                  key={o._id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className={`p-3 rounded-xl border bg-background/30 backdrop-blur-sm transition-colors hover:bg-background/50 ${
                    !o.isRead ? "border-primary/30" : "border-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor] ${
                      o.severity === "critical" ? "bg-urgent" : o.severity === "warning" ? "bg-warning" : "bg-primary"
                    }`} />
                    <span className="text-xs font-semibold text-foreground truncate flex-1">{o.title}</span>
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                      o.severity === "critical"
                        ? "bg-urgent/10 text-urgent"
                        : o.severity === "warning"
                        ? "bg-warning/10 text-warning"
                        : "bg-primary/10 text-primary"
                    }`}>{o.severity ?? "info"}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-1.5">{o.content}</p>
                </motion.div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background/50 to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
});

// 5. STACKED CLIENT LIST (Bottom Drawer style)
function StackedClientListWidget() {
  const clients = useQuery(api.clients.getByUser, { sortBy: "health" });
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const healthyClients = useMemo(
    () => (clients ?? []).filter((c: any) => (c.relationshipHealth ?? 50) >= 70),
    [clients]
  );

  const filteredAll = useMemo(
    () =>
      (clients ?? []).filter(
        (c: any) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [clients, searchQuery]
  );

  return (
    <div className="surface-raised rounded-2xl h-full flex flex-col overflow-hidden relative bg-card/40 backdrop-blur-md border border-white/5">
      <div className="p-4 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
            Client Health
            <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full font-mono font-bold border border-success/20">
              <NumberTicker value={healthyClients.length} /> healthy
            </span>
          </h3>
          <Link href="/clients" className="text-[10px] text-primary hover:text-primary/80 font-medium">
            View all
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-16 scrollbar-thin">
        {!clients ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : healthyClients.length > 0 ? (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {healthyClients.slice(0, 6).map((c: any) => {
              const h = c.relationshipHealth ?? 50;
              const trend = c.intelligence?.sentimentTrend;
              return (
                <motion.div
                  key={c._id}
                  variants={{ hidden: { opacity: 0, x: 8, y: 12 }, visible: { opacity: 1, x: 0, y: 0 } }}
                  transition={SPRING_FAST}
                >
                  <Link
                    href={`/clients/${c._id}`}
                    className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0 hover:bg-background/40 -mx-1 px-2 rounded-xl transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center text-xs font-bold text-success shrink-0 group-hover:scale-105 transition-transform">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate block group-hover:text-primary transition-colors">{c.name}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-16 h-1.5 rounded-full bg-black/20 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${h}%` }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="h-full rounded-full bg-gradient-to-r from-success/80 to-success" 
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-success">{h}</span>
                      </div>
                    </div>
                    {trend === "improving" && <TrendingUp className="h-4 w-4 text-success drop-shadow-[0_0_4px_rgba(var(--success),0.5)] shrink-0" />}
                    {trend === "declining" && <TrendingDown className="h-4 w-4 text-urgent drop-shadow-[0_0_4px_rgba(var(--urgent),0.5)] shrink-0" />}
                    {(!trend || trend === "stable") && <Minus className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            No healthy clients yet
          </div>
        )}
      </div>

      {/* Stacked Bottom Drawer */}
      <motion.div
        layout
        initial={false}
        animate={{
          height: isExpanded ? "calc(100% - 12px)" : "56px",
          width: isExpanded ? "calc(100% - 12px)" : "calc(100% - 24px)",
          bottom: isExpanded ? "6px" : "12px",
          left: isExpanded ? "6px" : "12px",
          borderRadius: isExpanded ? "20px" : "16px",
        }}
        transition={{ type: "spring", stiffness: 240, damping: 30, mass: 0.8 }}
        className="absolute z-20 bg-card/95 backdrop-blur-2xl border border-white/10 shadow-xl flex flex-col overflow-hidden"
        style={{ cursor: isExpanded ? "default" : "pointer" }}
        onClick={() => !isExpanded && setIsExpanded(true)}
      >
        <div
          className={`flex items-center justify-between px-3 h-14 shrink-0 transition-colors ${
            isExpanded ? "border-b border-white/10 bg-background/40" : "hover:bg-white/5 bg-background/20"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-inner transition-colors ${isExpanded ? "bg-primary/20 text-primary border border-primary/30" : "bg-card border border-white/5 text-muted-foreground"}`}>
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground leading-none">All Directory</p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-none">
                {clients?.length ?? "…"} registered
              </p>
            </div>
          </div>
          {!isExpanded && clients && clients.length > 0 && (
            <div className="flex -space-x-2.5">
              {clients.slice(0, 3).map((c: any) => (
                <div
                  key={c._id}
                  className="w-8 h-8 rounded-full bg-card border-2 border-background flex items-center justify-center text-[9px] font-bold text-foreground shadow-sm"
                >
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
              ))}
              {clients.length > 3 && (
                <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] font-bold text-muted-foreground shadow-sm">
                  +{clients.length - 3}
                </div>
              )}
            </div>
          )}
          {isExpanded && (
            <button
              className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); setSearchQuery(""); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="px-4 py-3 shrink-0">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    placeholder="Search clients…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-9 bg-black/20 border border-white/5 focus-visible:ring-1 focus-visible:ring-primary rounded-xl text-sm placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-3 scrollbar-thin">
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.03, delayChildren: 0.08 } } }}
                >
                  {filteredAll.map((c: any) => {
                    const h = c.relationshipHealth ?? 50;
                    const color = h >= 70 ? "text-success" : h >= 40 ? "text-warning" : "text-urgent";
                    const bg = h >= 70 ? "bg-success/10" : h >= 40 ? "bg-warning/10" : "bg-urgent/10";
                    return (
                      <motion.div
                        key={c._id}
                        variants={{ hidden: { opacity: 0, x: 10, y: 12 }, visible: { opacity: 1, x: 0, y: 0 } }}
                        transition={SPRING_FAST}
                      >
                        <Link
                          href={`/clients/${c._id}`}
                          className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 -mx-2 px-2 rounded-xl transition-colors"
                          onClick={() => setIsExpanded(false)}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0 ${bg} ${color}`}>
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate block">{c.name}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="w-12 h-1 rounded-full bg-black/20 overflow-hidden">
                                <div className={`h-full rounded-full ${h >= 70 ? "bg-success" : h >= 40 ? "bg-warning" : "bg-urgent"}`} style={{ width: `${h}%` }} />
                              </div>
                              <span className={`text-[10px] font-mono font-bold ${color}`}>{h}</span>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
// Helper for Stacked Client search
function SearchIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  );
}


// 6. CALENDAR WIDGET (Glassified)
function CalendarWidget() {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { start, end } = useMemo(() => getMonthBounds(selectedDate), [selectedDate]);
  const commitments = useQuery(api.commitments.getAllForCalendar, { startDate: start, endDate: end });

  const markedDates = useMemo(() => {
    return (commitments ?? [])
      .filter((c: any) => c.dueDate)
      .map((c: any) => ({
        date: new Date(c.dueDate),
        color: (
          c.commitmentType === "deadline" ? "urgent"
          : c.commitmentType === "payment" ? "success"
          : "primary"
        ) as "primary" | "urgent" | "success" | "warning",
      }));
  }, [commitments]);

  const selectedItems = useMemo(
    () => (commitments ?? []).filter((c: any) => c.dueDate && isSameDay(new Date(c.dueDate), selectedDate)),
    [commitments, selectedDate]
  );

  return (
    <div className="h-full overflow-hidden flex flex-col gap-2 surface-raised rounded-2xl p-2 bg-card/40 backdrop-blur-md">
      <GlassCalendar
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        markedDates={markedDates}
        hideFooter={selectedItems.length > 0}
        className="max-w-none rounded-xl border-none shadow-none bg-transparent"
      />
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-1 overflow-y-auto scrollbar-thin px-2 pb-2"
          >
            {selectedItems.map((c: any) => (
              <Link
                key={c._id}
                href={`/clients/${c.clientId}`}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-background/40 backdrop-blur-sm border border-white/5 hover:bg-background/60 hover:border-white/10 transition-colors group"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor] ${
                  c.commitmentType === "deadline" ? "bg-urgent"
                  : c.commitmentType === "payment" ? "bg-success"
                  : "bg-primary"
                }`} />
                <span className="text-xs font-medium text-foreground truncate flex-1 group-hover:text-primary transition-colors">{c.text}</span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ============================================
// 7. WEEK AGENDA WIDGET (Glassified & Fitted)
// ============================================
const AgendaWeekWidget = memo(function AgendaWeekWidget() {
  const { start, end } = useMemo(() => getWeekBounds(), []);
  const items = useQuery(api.commitments.getAgendaForDateRange, {
    startDate: start,
    endDate: end,
    includeOverdue: true,
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i);
    return {
      date: d,
      label: format(d, "EEE"),
      dayLabel: format(d, "d"),
      isToday: format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"),
      items: (items ?? []).filter((c: any) => {
        if (!c.dueDate) return false;
        return format(new Date(c.dueDate), "yyyy-MM-dd") === format(d, "yyyy-MM-dd");
      }),
    };
  });

  const overdue = (items ?? []).filter((c: any) => c.isOverdue);

  return (
    <div className="surface-raised rounded-2xl h-full p-4 flex flex-col bg-card/40 backdrop-blur-md overflow-hidden">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Calendar className="h-4 w-4 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
        <span className="text-sm font-display font-semibold text-foreground">This Week</span>
        <Link href="/calendar" className="ml-auto text-[10px] text-primary hover:text-primary/80 font-medium">
          Full calendar →
        </Link>
      </div>

      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        {overdue.length > 0 && (
          <div className="mb-2 p-2 rounded-xl bg-urgent/10 border border-urgent/20 shrink-0">
            <p className="text-[9px] font-bold text-urgent uppercase tracking-wider mb-1">
              <span className="animate-pulse mr-1">●</span>
              {overdue.length} overdue
            </p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none snap-x pb-1">
              {overdue.slice(0, 4).map((c: any) => (
                <Link key={c._id} href={`/clients/${c.clientId}`}
                  className="flex-none max-w-[120px] bg-background/40 hover:bg-background/80 transition-colors p-1.5 rounded-lg border border-white/5 snap-start">
                  <p className="text-[10px] text-foreground/80 truncate">{c.text}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{c.clientName}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-1 grid-cols-7 flex-1 min-h-0">
          {days.map(({ label, dayLabel, isToday, items: dayItems }) => (
            <div key={label} className="flex flex-col gap-1 min-w-0">
              <div className={`text-center pb-1 border-b ${isToday ? "border-primary/50 shadow-[0_1px_4px_rgba(var(--primary),0.3)]" : "border-white/10"}`}>
                <p className={`text-[9px] font-mono uppercase ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {label}
                </p>
                <p className={`text-[11px] font-bold ${isToday ? "text-primary" : "text-foreground/60"}`}>
                  {dayLabel}
                </p>
              </div>
              <div className="space-y-0.5 overflow-y-auto scrollbar-none flex-1 pb-1">
                {dayItems.slice(0, 4).map((c: any) => (
                  <Link key={c._id} href={`/clients/${c.clientId}`}
                    className="block p-1 rounded-md text-[9px] leading-tight text-foreground/70 hover:text-foreground truncate bg-background/20 hover:bg-background/60 transition-colors border border-transparent hover:border-white/5 mx-[1px]">
                    {c.text}
                  </Link>
                ))}
                {dayItems.length > 4 && (
                  <p className="text-[8px] text-muted-foreground font-mono text-center">+{dayItems.length - 4}</p>
                )}
                {dayItems.length === 0 && (
                  <div className="h-4 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-white/5" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ============================================
// SORTABLE WIDGET WRAPPER
// ============================================
function SortableWidget({
  id,
  className,
  editing,
  onRemove,
  children,
}: {
  id: string;
  className: string;
  editing: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`${className} relative group h-full`} {...attributes}>
      {editing && (
        <>
          <div
            {...listeners}
            className="absolute top-2 left-2 z-20 p-1.5 rounded-lg bg-card/80 backdrop-blur-md border border-white/10 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
          </div>
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={onRemove}
            className="absolute -top-2 -right-2 z-30 w-7 h-7 rounded-full bg-urgent text-white flex items-center justify-center shadow-[0_0_15px_rgba(var(--urgent),0.5)] border border-urgent/50 hover:scale-110 transition-transform"
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        </>
      )}
      {children}
    </div>
  );
}

// ============================================
// WIDGET REGISTRY & RENDERER
// ============================================
const WIDGET_REGISTRY = [
  { type: "stats",       name: "Core Metrics",     icon: <Zap className="h-4 w-4" /> },
  { type: "skills",      name: "Insights Feed",    icon: <Bell className="h-4 w-4" /> },
  { type: "revenue",     name: "Revenue Radar",    icon: <DollarSign className="h-4 w-4" /> },
  { type: "clients_stack", name: "Client Directory", icon: <Users className="h-4 w-4" /> },
  { type: "calendar",    name: "Mini Calendar",    icon: <CalendarDays className="h-4 w-4" /> },
  { type: "deadlines",   name: "Deadline Ticker",  icon: <Clock className="h-4 w-4" /> },
  { type: "agenda",      name: "Week Agenda",      icon: <Calendar className="h-4 w-4" /> },
];

function WidgetRenderer({ type }: { type: string }) {
  switch (type) {
    case "stats":         return <StatsOverviewWidget />;
    case "skills":        return <VerticalSkillsWidget />;
    case "revenue":       return <AnimatedSignalFeedWidget />;
    case "clients_stack": return <StackedClientListWidget />;
    case "calendar":      return <CalendarWidget />;
    case "deadlines":     return <DeadlineTickerWidget />;
    case "agenda":        return <AgendaWeekWidget />;
    default: return (
      <div className="surface-raised rounded-2xl h-full flex flex-col items-center justify-center text-muted-foreground bg-card/20 border border-white/5 border-dashed">
        <LayoutGrid className="h-6 w-6 mb-2 opacity-50" />
        <span className="text-xs font-mono">{type}</span>
      </div>
    );
  }
}

const SIZE_CLASSES: Record<string, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x1": "col-span-2 row-span-1",
  "1x2": "col-span-1 row-span-2",
  "2x2": "col-span-2 row-span-2",
  "3x1": "col-span-3 row-span-1",
  "4x1": "col-span-4 row-span-1",
};

const DEFAULT_WIDGETS = [
  { id: "stats-v2",    type: "stats",         size: "2x2" },
  { id: "revenue-v2",  type: "revenue",       size: "2x2" },
  { id: "skills-v2",   type: "skills",        size: "2x2" },
  { id: "clients-v2",  type: "clients_stack", size: "2x2" },
  { id: "agenda-v2",   type: "agenda",        size: "4x1" },
  { id: "calendar-v2", type: "calendar",      size: "2x2" },
  { id: "deadlines-v2",type: "deadlines",     size: "2x1" },
];

// ============================================
// PAGE
// ============================================
export default function WorkspaceV2Page() {
  const [editing, setEditing] = useState(false);
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleAddWidget = useCallback((type: string) => {
    const id = `${type}-${Date.now()}`;
    const size = type === "agenda" ? "4x1" : type === "deadlines" ? "2x1" : "2x2";
    setWidgets((prev) => [...prev, { id, type, size }]);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgets((prev) => {
      const oldIdx = prev.findIndex((w) => w.id === active.id);
      const newIdx = prev.findIndex((w) => w.id === over.id);
      return oldIdx === -1 || newIdx === -1 ? prev : arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  return (
    <div className="h-full flex flex-col animate-fade-in overflow-hidden relative">
      {/* Dynamic Glass Background Elements */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-success/5 rounded-full blur-[150px] pointer-events-none" />
      
      <div className="px-6 pt-6 shrink-0 flex items-center justify-between z-50">
        <GlassDateStrip />
        <WorkspaceV2Toolbar
          editing={editing}
          onToggleEdit={() => setEditing((e) => !e)}
          onAddWidget={handleAddWidget}
          widgetRegistry={WIDGET_REGISTRY}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin z-10">
        {widgets.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-5 auto-rows-[190px]">
                {widgets.map((w) => (
                  <SortableWidget
                    key={w.id}
                    id={w.id}
                    className={SIZE_CLASSES[w.size] ?? "col-span-2 row-span-2"}
                    editing={editing}
                    onRemove={() => handleRemove(w.id)}
                  >
                    <WidgetRenderer type={w.type} />
                  </SortableWidget>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <LayoutGrid className="h-16 w-16 mb-4 opacity-20 drop-shadow-lg" />
            <p className="text-lg font-medium text-foreground/80">Workspace canvas is empty</p>
            <p className="text-sm mt-1.5 opacity-60">Click Customize to bring in modern widgets</p>
          </div>
        )}
      </div>
    </div>
  );
}
