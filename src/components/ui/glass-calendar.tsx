"use client";

import * as React from "react";
import { Settings, Plus, Edit2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
  getDate,
  getDaysInMonth,
  startOfMonth,
} from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarkedDate {
  date: Date;
  /** Visual dot color — defaults to "primary" */
  color?: "primary" | "urgent" | "success" | "warning";
}

interface Day {
  date: Date;
  isToday: boolean;
  isSelected: boolean;
}

export interface GlassCalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  /** Dates that have events/commitments — shows colored indicator dots */
  markedDates?: MarkedDate[];
  /** Hide footer actions (useful when embedded as a widget) */
  hideFooter?: boolean;
  className?: string;
}

// ─── Scrollbar hide ────────────────────────────────────────────────────────────
const ScrollbarHide = () => (
  <style>{`
    .gc-scrollbar-hide::-webkit-scrollbar { display: none; }
    .gc-scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
);

// ─── Dot color map ────────────────────────────────────────────────────────────
const DOT_COLOR: Record<string, string> = {
  primary: "bg-blue-400",
  urgent:  "bg-rose-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
};

// ─── Main component ───────────────────────────────────────────────────────────
export const GlassCalendar = React.forwardRef<HTMLDivElement, GlassCalendarProps>(
  (
    {
      className,
      selectedDate: propSelectedDate,
      onDateSelect,
      markedDates = [],
      hideFooter = false,
      ...props
    },
    ref
  ) => {
    const [currentMonth, setCurrentMonth] = React.useState(propSelectedDate ?? new Date());
    const [selectedDate, setSelectedDate] = React.useState(propSelectedDate ?? new Date());
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Scroll selected day into view on mount / month change
    React.useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const selected = el.querySelector("[data-selected='true']") as HTMLElement | null;
      if (selected) {
        selected.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }, [currentMonth, selectedDate]);

    const monthDays = React.useMemo(() => {
      const start = startOfMonth(currentMonth);
      const total = getDaysInMonth(currentMonth);
      const days: Day[] = [];
      for (let i = 0; i < total; i++) {
        const date = new Date(start.getFullYear(), start.getMonth(), i + 1);
        days.push({ date, isToday: isToday(date), isSelected: isSameDay(date, selectedDate) });
      }
      return days;
    }, [currentMonth, selectedDate]);

    const handleDateClick = (date: Date) => {
      setSelectedDate(date);
      onDateSelect?.(date);
    };

    // Find top marker for a given day (priority: urgent > warning > primary > success)
    const getMarker = (date: Date): MarkedDate | undefined => {
      const matches = markedDates.filter((m) => isSameDay(m.date, date));
      if (!matches.length) return undefined;
      const priority = ["urgent", "warning", "primary", "success"];
      return (
        matches.find((m) => m.color === "urgent") ??
        matches.find((m) => m.color === "warning") ??
        matches.find((m) => m.color === "primary") ??
        matches[0]
      );
    };

    return (
      <div
        ref={ref}
        className={cn(
          "w-full rounded-3xl p-5 overflow-hidden",
          "bg-black/25 backdrop-blur-xl border border-white/10",
          "text-white font-sans shadow-2xl",
          className
        )}
        {...props}
      >
        <ScrollbarHide />

        {/* ── Header: tab switcher + settings ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 rounded-lg bg-black/20 p-1">
            <button className="rounded-md bg-white px-4 py-1 text-xs font-bold text-black shadow-md">
              Monthly
            </button>
            <Link
              href="/calendar"
              className="rounded-md px-4 py-1 text-xs font-semibold text-white/60 transition-colors hover:text-white"
            >
              Full View
            </Link>
          </div>
          <Link
            href="/calendar"
            className="p-2 text-white/70 transition-colors hover:bg-white/10 rounded-full"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        {/* ── Month name + navigation ── */}
        <div className="my-5 flex items-center justify-between">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={format(currentMonth, "yyyy-MM")}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.25 }}
              className="text-3xl font-bold tracking-tight"
            >
              {format(currentMonth, "MMMM")}
              <span className="ml-2 text-lg font-normal text-white/40">
                {format(currentMonth, "yyyy")}
              </span>
            </motion.p>
          </AnimatePresence>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 rounded-full text-white/60 transition-colors hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-2 py-1 rounded-lg text-[10px] font-bold text-white/50 hover:bg-white/10 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 rounded-full text-white/60 transition-colors hover:bg-white/10"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Day-of-week labels (fixed Mon→Sun) ── */}
        <div className="grid grid-cols-7 mb-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="flex justify-center">
              <span className="text-[10px] font-bold text-white/40">{d}</span>
            </div>
          ))}
        </div>

        {/* ── Scrollable date strip ── */}
        <div
          ref={scrollRef}
          className="overflow-x-auto gc-scrollbar-hide -mx-5 px-5"
        >
          <div className="flex space-x-2 min-w-max">
            {monthDays.map((day) => {
              const marker = getMarker(day.date);
              return (
                <div
                  key={format(day.date, "yyyy-MM-dd")}
                  data-selected={day.isSelected}
                  className="flex flex-col items-center space-y-1 flex-shrink-0"
                >
                  <button
                    onClick={() => handleDateClick(day.date)}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200",
                      {
                        "bg-gradient-to-br from-pink-500 to-orange-400 text-white shadow-lg shadow-orange-500/30":
                          day.isSelected,
                        "hover:bg-white/15": !day.isSelected,
                        "ring-1 ring-white/30": day.isToday && !day.isSelected,
                      }
                    )}
                  >
                    {getDate(day.date)}
                    {/* Today indicator */}
                    {day.isToday && !day.isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-pink-400" />
                    )}
                    {/* Commitment dot */}
                    {marker && !day.isSelected && !day.isToday && (
                      <span
                        className={cn(
                          "absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full",
                          DOT_COLOR[marker.color ?? "primary"]
                        )}
                      />
                    )}
                    {/* Both today + commitment */}
                    {marker && !day.isSelected && day.isToday && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-pink-400" />
                        <span className={cn("h-1 w-1 rounded-full", DOT_COLOR[marker.color ?? "primary"])} />
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Divider ── */}
        {!hideFooter && <div className="mt-5 h-px bg-white/10" />}

        {/* ── Footer ── */}
        {!hideFooter && (
          <div className="mt-4 flex items-center justify-between">
            <button className="flex items-center space-x-2 text-sm font-medium text-white/60 transition-colors hover:text-white">
              <Edit2 className="h-3.5 w-3.5" />
              <span>Add a note…</span>
            </button>
            <Link
              href="/calendar"
              className="flex items-center space-x-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Event</span>
            </Link>
          </div>
        )}
      </div>
    );
  }
);

GlassCalendar.displayName = "GlassCalendar";
