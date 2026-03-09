"use client";

import { useState, useMemo, memo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  CalendarCheck,
} from "lucide-react";
import Link from "next/link";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import {
  getDeadlineProximity,
  getMonthBounds,
  formatTimeOfDay,
} from "@/lib/date-utils";

// ============================================
// TYPE METADATA
// ============================================

const TYPE_META: Record<string, { label: string; dot: string; badge: string }> = {
  deadline:    { label: "Deadline",    dot: "bg-urgent",   badge: "bg-urgent/10 text-urgent" },
  deliverable: { label: "Deliverable", dot: "bg-primary",  badge: "bg-primary/10 text-primary" },
  payment:     { label: "Payment",     dot: "bg-success",  badge: "bg-success/10 text-success" },
  meeting:     { label: "Meeting",     dot: "bg-chart-4",  badge: "bg-chart-4/10 text-chart-4" },
  check_in:    { label: "Check-in",   dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

// ============================================
// CALENDAR PAGE
// ============================================

export default function CalendarPage() {
  const [viewDate, setViewDate]   = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [view, setView]           = useState<"month" | "week">("month");
  const [actioningId, setActioningId] = useState<string | null>(null);

  const { start, end } = useMemo(() => getMonthBounds(viewDate), [viewDate]);
  const allItems = useQuery(api.commitments.getAllForCalendar, { startDate: start, endDate: end });

  const completeMutation = useMutation(api.commitments.complete);
  const cancelMutation   = useMutation(api.commitments.cancel);

  const handleComplete = async (id: string) => {
    setActioningId(id);
    try { await completeMutation({ id: id as any }); } catch { /* noop */ } finally { setActioningId(null); }
  };
  const handleCancel = async (id: string) => {
    setActioningId(id);
    try { await cancelMutation({ id: id as any }); } catch { /* noop */ } finally { setActioningId(null); }
  };

  // Build day → items map for the month grid
  const dayMap = useMemo(() => {
    const map = new Map<string, typeof allItems>();
    for (const c of allItems ?? []) {
      if (!c.dueDate) continue;
      const key = format(new Date(c.dueDate), "yyyy-MM-dd");
      const prev = map.get(key) ?? [];
      map.set(key, [...prev, c]);
    }
    return map;
  }, [allItems]);

  // Selected day items (or today if nothing selected)
  const panelDate   = selectedDay ?? new Date();
  const panelKey    = format(panelDate, "yyyy-MM-dd");
  const panelItems  = dayMap.get(panelKey) ?? [];

  // Stats
  const overdueCount  = (allItems ?? []).filter((c) => c.isOverdue && c.status === "pending").length;
  const pendingCount  = (allItems ?? []).filter((c) => !c.isOverdue && c.status === "pending").length;
  const doneCount     = (allItems ?? []).filter((c) => c.status === "completed").length;

  return (
    <div className="max-w-7xl mx-auto p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Calendar
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            All commitment deadlines across clients
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border/40 rounded-lg overflow-hidden text-xs">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border/40 hover:bg-accent transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewDate(new Date())}
              className="px-3 py-1.5 text-xs font-medium border border-border/40 rounded-lg hover:bg-accent transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border/40 hover:bg-accent transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="text-sm font-display font-semibold text-foreground min-w-[130px] text-right">
            {format(viewDate, "MMMM yyyy")}
          </span>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-4 mb-6">
        {[
          { label: "Overdue",  value: overdueCount, color: "text-urgent",  bg: "bg-urgent/10"  },
          { label: "Pending",  value: pendingCount, color: "text-warning", bg: "bg-warning/10" },
          { label: "Completed this month", value: doneCount, color: "text-success", bg: "bg-success/10" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${bg}`}>
            <span className={`text-lg font-mono font-bold ${color}`}>{value ?? "—"}</span>
            <span className={`text-[10px] font-mono ${color}`}>{label}</span>
          </div>
        ))}

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3">
          {Object.entries(TYPE_META).map(([, meta]) => (
            <div key={meta.label} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
              <span className="text-[10px] text-muted-foreground">{meta.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main grid + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Calendar grid */}
        <div className="surface-raised rounded-xl overflow-hidden">
          {view === "month" ? (
            <MonthGrid
              viewDate={viewDate}
              dayMap={dayMap}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          ) : (
            <WeekGrid
              viewDate={viewDate}
              dayMap={dayMap}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          )}
        </div>

        {/* Day panel */}
        <DayPanel
          date={panelDate}
          items={panelItems}
          actioningId={actioningId}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}

// ============================================
// MONTH GRID
// ============================================

const MonthGrid = memo(function MonthGrid({
  viewDate,
  dayMap,
  selectedDay,
  onSelectDay,
}: {
  viewDate: Date;
  dayMap: Map<string, any[]>;
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
}) {
  const monthStart = startOfMonth(viewDate);
  const monthEnd   = endOfMonth(viewDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 1 });

  const days: Date[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border/20">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key       = format(day, "yyyy-MM-dd");
          const dayItems  = dayMap.get(key) ?? [];
          const isCurrentMonth = isSameMonth(day, viewDate);
          const isSelected     = selectedDay ? isSameDay(day, selectedDay) : false;
          const isTodayDay     = isToday(day);

          const overdueItems  = dayItems.filter((c) => c.isOverdue  && c.status === "pending");
          const pendingItems  = dayItems.filter((c) => !c.isOverdue && c.status === "pending");
          const doneItems     = dayItems.filter((c) => c.status === "completed");

          return (
            <button
              key={i}
              onClick={() => onSelectDay(day)}
              className={`min-h-[90px] p-2 border-b border-r border-border/10 text-left transition-colors hover:bg-accent/30 ${
                !isCurrentMonth ? "opacity-30" : ""
              } ${isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}
              ${isTodayDay && !isSelected ? "bg-accent/50" : ""}`}
            >
              {/* Day number */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-bold mb-1 ${
                isTodayDay
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/70"
              }`}>
                {format(day, "d")}
              </div>

              {/* Commitment chips */}
              <div className="space-y-0.5">
                {overdueItems.slice(0, 1).map((c) => (
                  <CommitmentChip key={c._id} commitment={c} />
                ))}
                {pendingItems.slice(0, 2).map((c) => (
                  <CommitmentChip key={c._id} commitment={c} />
                ))}
                {doneItems.slice(0, 1).map((c) => (
                  <CommitmentChip key={c._id} commitment={c} />
                ))}
                {/* Overflow indicator */}
                {dayItems.length > 3 && (
                  <p className="text-[9px] font-mono text-muted-foreground px-0.5">
                    +{dayItems.length - 3} more
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// ============================================
// WEEK GRID
// ============================================

const WeekGrid = memo(function WeekGrid({
  viewDate,
  dayMap,
  selectedDay,
  onSelectDay,
}: {
  viewDate: Date;
  dayMap: Map<string, any[]>;
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
}) {
  const weekStart = startOfWeek(viewDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border/20">
        {days.map((day) => {
          const isTodayDay = isToday(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`py-3 text-center transition-colors hover:bg-accent/30 ${
                isTodayDay ? "bg-primary/10" : ""
              }`}
            >
              <p className={`text-[10px] font-mono uppercase tracking-wider ${isTodayDay ? "text-primary font-bold" : "text-muted-foreground"}`}>
                {format(day, "EEE")}
              </p>
              <p className={`text-lg font-mono font-bold ${isTodayDay ? "text-primary" : "text-foreground/70"}`}>
                {format(day, "d")}
              </p>
            </button>
          );
        })}
      </div>

      {/* Items per day */}
      <div className="grid grid-cols-7 min-h-[400px] divide-x divide-border/10">
        {days.map((day) => {
          const key      = format(day, "yyyy-MM-dd");
          const dayItems = dayMap.get(key) ?? [];
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;

          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={`p-2 space-y-1.5 cursor-pointer hover:bg-accent/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
            >
              {dayItems.length > 0 ? (
                dayItems.map((c) => <CommitmentChip key={c._id} commitment={c} />)
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="w-4 h-px bg-border/20" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ============================================
// COMMITMENT CHIP — inline calendar event
// ============================================

const CommitmentChip = memo(function CommitmentChip({ commitment }: { commitment: any }) {
  const meta = TYPE_META[commitment.type] ?? TYPE_META.deliverable;
  const isDone = commitment.status === "completed";

  return (
    <div
      className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] leading-tight truncate ${
        isDone ? "opacity-50 line-through" : ""
      } ${meta.badge}`}
      title={`${commitment.text} — ${commitment.clientName}`}
    >
      <div className={`w-1 h-1 rounded-full shrink-0 ${commitment.isOverdue ? "bg-urgent" : meta.dot}`} />
      <span className="truncate">{commitment.text}</span>
    </div>
  );
});

// ============================================
// DAY PANEL — right-side detail for selected day
// ============================================

const DayPanel = memo(function DayPanel({
  date,
  items,
  actioningId,
  onComplete,
  onCancel,
}: {
  date: Date;
  items: any[];
  actioningId: string | null;
  onComplete: (id: string) => void;
  onCancel:   (id: string) => void;
}) {
  const pending   = items.filter((c) => c.status === "pending");
  const completed = items.filter((c) => c.status === "completed");

  return (
    <div className="surface-raised rounded-xl p-4 flex flex-col h-fit lg:sticky lg:top-6">
      {/* Panel header */}
      <div className="flex items-center gap-2 mb-4">
        <CalendarCheck className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-display font-semibold text-foreground">
            {isToday(date) ? "Today" : format(date, "EEEE")}
          </p>
          <p className="text-[10px] text-muted-foreground font-mono">
            {format(date, "MMMM d, yyyy")}
          </p>
        </div>
        {pending.length > 0 && (
          <span className="ml-auto text-[10px] font-mono font-bold bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">
            {pending.length} pending
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground">No commitments on this day</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Pending */}
          {pending.map((c) => {
            const proximity = c.dueDate ? getDeadlineProximity(c.dueDate) : null;
            const timeHint  = formatTimeOfDay(c.dueTimeOfDay);
            const meta      = TYPE_META[c.type] ?? TYPE_META.deliverable;

            return (
              <div
                key={c._id}
                className={`p-3 rounded-lg border transition-all ${
                  c.isOverdue
                    ? "border-urgent/30 bg-urgent/5"
                    : proximity?.severity === "warning"
                      ? "border-warning/20 bg-warning/5"
                      : "border-border/20 bg-card"
                }`}
              >
                {/* Type + time */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${meta.badge}`}>
                    {meta.label}
                  </span>
                  {proximity && (
                    <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${
                      proximity.severity === "critical" ? "text-urgent" :
                      proximity.severity === "warning"  ? "text-warning" : "text-muted-foreground"
                    }`}>
                      {c.isOverdue && <AlertTriangle className="h-2.5 w-2.5" />}
                      {proximity.label}
                    </span>
                  )}
                  {timeHint && (
                    <span className="text-[9px] text-muted-foreground ml-auto">{timeHint}</span>
                  )}
                </div>

                {/* Text */}
                <p className="text-[12px] text-foreground leading-snug mb-1.5">{c.text}</p>

                {/* Client link */}
                <Link
                  href={`/clients/${c.clientId}`}
                  className="text-[10px] text-primary hover:text-primary/80 font-medium"
                >
                  {c.clientName} →
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/20">
                  <button
                    disabled={actioningId === c._id}
                    onClick={() => onComplete(c._id)}
                    className="flex items-center gap-1 text-[10px] font-medium text-success hover:text-success/80 disabled:opacity-50 transition-colors"
                  >
                    {actioningId === c._id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Done
                  </button>
                  <button
                    disabled={actioningId === c._id}
                    onClick={() => onCancel(c._id)}
                    className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-urgent disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="pt-2 border-t border-border/20">
              <p className="text-[10px] font-mono text-muted-foreground/60 mb-1.5">
                {completed.length} completed
              </p>
              {completed.map((c) => (
                <div key={c._id} className="flex items-center gap-2 p-1.5 opacity-50">
                  <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
                  <span className="text-[11px] text-foreground/60 line-through truncate">{c.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer: quick time display */}
      <div className="mt-4 pt-3 border-t border-border/20 flex items-center gap-1.5 text-muted-foreground/50">
        <Clock className="h-3 w-3" />
        <span className="text-[9px] font-mono">
          {format(new Date(), "h:mm a")} · {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </span>
      </div>
    </div>
  );
});
