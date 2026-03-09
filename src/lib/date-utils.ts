import {
  formatDistanceToNow,
  format,
  isToday,
  isYesterday,
  differenceInHours,
  differenceInDays,
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
