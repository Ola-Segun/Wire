import {
  formatDistanceToNow,
  format,
  isToday,
  isYesterday,
  isTomorrow,
  differenceInHours,
  differenceInDays,
  differenceInMinutes,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";

/**
 * Format a timestamp into a human-readable relative time.
 * e.g. "2 hours ago", "Yesterday", "Feb 10"
 */
export function formatRelativeTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const hoursDiff = differenceInHours(now, date);

  if (hoursDiff < 24) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (isYesterday(date)) {
    return "Yesterday";
  }

  const daysDiff = differenceInDays(now, date);
  if (daysDiff < 7) {
    return format(date, "EEEE"); // "Monday", "Tuesday", etc.
  }

  return format(date, "MMM d"); // "Feb 10"
}

/**
 * Format timestamp for message display with time.
 */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);

  if (isToday(date)) {
    return format(date, "h:mm a"); // "2:30 PM"
  }

  if (isYesterday(date)) {
    return `Yesterday ${format(date, "h:mm a")}`;
  }

  return format(date, "MMM d, h:mm a"); // "Feb 10, 2:30 PM"
}

/**
 * Format date for section headers in message feeds.
 */
export function formatDateHeader(timestamp: number): string {
  const date = new Date(timestamp);

  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";

  return format(date, "MMMM d, yyyy"); // "February 10, 2026"
}

/**
 * Group items by date for timeline display.
 */
export function groupByDate<T extends { timestamp: number }>(
  items: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = formatDateHeader(item.timestamp);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

// ============================================
// DEADLINE PROXIMITY — calendar & agenda helpers
// ============================================

export interface DeadlineProximity {
  label: string;
  severity: "normal" | "warning" | "critical";
  isOverdue: boolean;
}

/**
 * Return a short human label + severity for a commitment's due date.
 * Used in CommitmentsPanel, agenda widgets, and the calendar page.
 */
export function getDeadlineProximity(epochMs: number): DeadlineProximity {
  const now = new Date();
  const due = new Date(epochMs);
  const isOverdue = due < now;

  if (isOverdue) {
    const absHours = differenceInHours(now, due);
    const absDays  = differenceInDays(now, due);
    if (absHours < 1)  return { label: "Overdue just now",       severity: "critical", isOverdue: true };
    if (absHours < 24) return { label: `Overdue ${absHours}h ago`, severity: "critical", isOverdue: true };
    if (absDays === 1) return { label: "Overdue yesterday",       severity: "critical", isOverdue: true };
    return { label: `Overdue ${absDays}d ago`,                    severity: "critical", isOverdue: true };
  }

  const mins = differenceInMinutes(due, now);
  const hrs  = differenceInHours(due, now);
  const days = differenceInDays(due, now);

  if (mins < 60)  return { label: `in ${mins}m`,         severity: "critical", isOverdue: false };
  if (hrs < 4)    return { label: `in ${hrs}h`,           severity: "critical", isOverdue: false };
  if (hrs < 24)   return { label: `in ${hrs}h`,           severity: "warning",  isOverdue: false };
  if (isToday(due))    return { label: "Today",           severity: "warning",  isOverdue: false };
  if (isTomorrow(due)) return { label: "Tomorrow",        severity: "warning",  isOverdue: false };
  if (days < 7)   return { label: `in ${days}d`,          severity: "normal",   isOverdue: false };
  return { label: format(due, "MMM d"),                   severity: "normal",   isOverdue: false };
}

/**
 * Epoch ms bounds for a calendar day.
 */
export function getDayBounds(date: Date = new Date()): { start: number; end: number } {
  return { start: startOfDay(date).getTime(), end: endOfDay(date).getTime() };
}

/**
 * Epoch ms bounds for a calendar week (Monday–Sunday).
 */
export function getWeekBounds(date: Date = new Date()): { start: number; end: number } {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }).getTime(),
    end:   endOfWeek(date,   { weekStartsOn: 1 }).getTime(),
  };
}

/**
 * Epoch ms bounds for a calendar month.
 */
export function getMonthBounds(date: Date = new Date()): { start: number; end: number } {
  return { start: startOfMonth(date).getTime(), end: endOfMonth(date).getTime() };
}

/**
 * Human-readable time-of-day label.
 * Accepts the AI-extracted dueTimeOfDay string stored on commitments.
 */
export function formatTimeOfDay(dueTimeOfDay?: string | null): string {
  if (!dueTimeOfDay) return "";
  const MAP: Record<string, string> = {
    morning:    "Morning",
    afternoon:  "Afternoon",
    evening:    "Evening",
    end_of_day: "EOD",
  };
  return MAP[dueTimeOfDay] ?? dueTimeOfDay; // pass-through for "HH:MM" literals
}
