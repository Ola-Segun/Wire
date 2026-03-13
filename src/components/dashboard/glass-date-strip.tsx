"use client";

import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CalendarCheck,
  Clock,
} from "lucide-react";
import {
  format,
  addDays,
  subDays,
  isSameDay,
  isToday,
  getDay,
} from "date-fns";
import Link from "next/link";

// ─── Helper: get N days around a pivot ───────────────────────────────────────
function getWindowDays(pivot: Date, count = 14): Date[] {
  const days: Date[] = [];
  const start = subDays(pivot, Math.floor(count / 2));
  for (let i = 0; i < count; i++) days.push(addDays(start, i));
  return days;
}

// ─── Dot type styles ─────────────────────────────────────────────────────────
const TYPE_DOT: Record<string, string> = {
  deadline:    "bg-rose-400",
  deliverable: "bg-blue-400",
  payment:     "bg-emerald-400",
  meeting:     "bg-violet-400",
  check_in:    "bg-slate-400",
  default:     "bg-blue-400",
};

// ─── Component ────────────────────────────────────────────────────────────────
interface GlassDateStripProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
}

export function GlassDateStrip({ selectedDate: propDate, onDateSelect }: GlassDateStripProps) {
  const [pivot, setPivot] = useState(new Date());
  const [selected, setSelected] = useState(propDate ?? new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => getWindowDays(pivot, 21), [pivot]);

  // Fetch commitments for the visible window.
  // Normalize to midnight boundaries so args are stable across renders —
  // Convex only deduplicates subscriptions when args are byte-identical.
  const startDate = useMemo(() => {
    const d = new Date(days[0]);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [days[0].toDateString()]);
  const endDate = useMemo(() => {
    const d = addDays(days[days.length - 1], 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [days[days.length - 1].toDateString()]);
  const commitments = useQuery(api.commitments.getAllForCalendar, { startDate, endDate });

  // Build day → commitment list map
  const dayMap = useMemo(() => {
    const map = new Map<string, typeof commitments>();
    for (const c of commitments ?? []) {
      if (!c.dueDate) continue;
      const key = format(new Date(c.dueDate), "yyyy-MM-dd");
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [commitments]);

  // Today stats
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const todayItems = dayMap.get(todayKey) ?? [];
  const todayPending = todayItems.filter((c: any) => c.status === "pending").length;
  const overdueCount = (commitments ?? []).filter(
    (c: any) => c.isOverdue && c.status === "pending"
  ).length;

  // Scroll today into view on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayEl = el.querySelector("[data-today='true']") as HTMLElement | null;
    todayEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  const handleSelect = (date: Date) => {
    setSelected(date);
    onDateSelect?.(date);
  };

  const handlePrev = () => setPivot((p) => subDays(p, 7));
  const handleNext = () => setPivot((p) => addDays(p, 7));
  const handleToday = () => { setPivot(new Date()); handleSelect(new Date()); };

  return (
    <div className="relative w-full mb-4 rounded-2xl overflow-hidden">
      {/* Glass layer */}
      <div className="absolute inset-0 bg-card/40 backdrop-blur-xl border border-white/5 rounded-2xl " />

      {/* Subtle gradient sheen */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent rounded-2xl pointer-events-none" />

      <div className="relative flex items-center gap-4 px-5 py-2   w-fit">

        {/* ── Left: date label ── */}
        <div className="shrink-0 min-w-[110px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={format(selected, "yyyy-MM-dd")}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-none">
                {isToday(selected) ? "Today" : format(selected, "EEEE")}
              </p>
              <p className="text-lg font-bold text-foreground mt-0.5 leading-none">
                {format(selected, "MMMM d")}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {format(selected, "yyyy")}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Divider ── */}
        <div className="h-10 w-px bg-border/40 shrink-0" />

        {/* ── Nav prev ── */}
        <button
          onClick={handlePrev}
          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* ── Scrollable day strip ── */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          <div className="flex items-center gap-1.5">
            {days.map((day, index) => {
              const key = format(day, "yyyy-MM-dd");
              const items = dayMap.get(key) ?? [];
              const isSelected = isSameDay(day, selected);
              const isTodayDay = isToday(day);
              const hasItems = items.length > 0;
              // Sunday = getDay 0 → start of a new week; skip separator for very first day
              const isWeekStart = getDay(day) === 0 && index > 0;

              // Pick top dot color
              const topType = (items as any[]).find((c) => c.commitmentType === "deadline")
                ? "deadline"
                : (items as any[]).find((c) => c.commitmentType === "payment")
                ? "payment"
                : (items as any[]).find((c) => c.commitmentType === "deliverable")
                ? "deliverable"
                : "default";

              return (
                <Fragment key={key}>
                  {/* Week separator — short soft line before each Sunday */}
                  {isWeekStart && (
                    <div className="shrink-0 flex flex-col items-center self-stretch justify-center mx-0.5">
                      <div className="w-px h-5 rounded-full bg-primary/25" />
                    </div>
                  )}
                <button
                  data-today={isTodayDay || undefined}
                  onClick={() => handleSelect(day)}
                  className="relative flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl transition-all duration-200 shrink-0 group"
                >
                  {/* Background */}
                  {isSelected && (
                    <motion.div
                      layoutId="strip-selected"
                      className="absolute inset-0 rounded-xl bg-gradient-to-br from-pink-500/80 to-orange-400/80 shadow-lg shadow-orange-500/20"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  {isTodayDay && !isSelected && (
                    <div className="absolute inset-0 rounded-xl ring-1 ring-primary/40 bg-primary/5" />
                  )}
                  {!isSelected && !isTodayDay && (
                    <div className="absolute inset-0 rounded-xl group-hover:bg-accent/40 transition-colors" />
                  )}

                  {/* Day letter */}
                  <span
                    className={`text-[10px] font-bold relative z-10 ${
                      isSelected ? "text-white" : isTodayDay ? "text-primary" : "text-muted-foreground/60"
                    }`}
                  >
                    {format(day, "EEEEE")}
                  </span>

                  {/* Day number */}
                  <span
                    className={`text-sm font-bold relative z-10 leading-none ${
                      isSelected ? "text-white" : isTodayDay ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {format(day, "d")}
                  </span>

                  {/* Commitment dot(s) */}
                  <div className="relative z-10 h-1 flex gap-0.5 items-center justify-center">
                    {hasItems && !isSelected && (
                      <>
                        <span className={`h-1 w-1 rounded-full ${TYPE_DOT[topType]}`} />
                        {items.length > 1 && (
                          <span className="h-1 w-1 rounded-full bg-white/30" />
                        )}
                      </>
                    )}
                    {hasItems && isSelected && (
                      <span className="h-1 w-1 rounded-full bg-white/70" />
                    )}
                    {!hasItems && <span className="h-1 w-1" />}
                  </div>
                </button>
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* ── Nav next ── */}
        <button
          onClick={handleNext}
          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* ── Divider ── */}
        <div className="h-10 w-px bg-border/40 shrink-0" />

        {/* ── Right: quick stats ── */}
        <div className="shrink-0 flex flex-col gap-1.5 min-w-[90px]">
          <Link
            href="/calendar"
            className="flex items-center gap-1.5 group"
          >
            {overdueCount > 0 ? (
              <>
                <AlertTriangle className="h-3 w-3 text-urgent shrink-0" />
                <span className="text-[11px] font-bold text-urgent">
                  {overdueCount} overdue
                </span>
              </>
            ) : (
              <>
                <CalendarCheck className="h-3 w-3 text-success shrink-0" />
                <span className="text-[11px] font-medium text-success">On track</span>
              </>
            )}
          </Link>

          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground">
              {todayPending > 0 ? `${todayPending} today` : "Clear today"}
            </span>
          </div>

          <button
            onClick={handleToday}
            className="text-[10px] font-bold text-primary/70 hover:text-primary transition-colors text-left"
          >
            Jump to today →
          </button>
        </div>
      </div>
    </div>
  );
}
