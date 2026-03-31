"use client";

import { Filter } from "lucide-react";
import { PLATFORMS, PLATFORM_LABELS, type PlatformType } from "@/lib/constants";
import { getPlatformIconComponent } from "@/lib/platform-icons";

export type FilterType = "all" | "unread" | "urgent" | "starred";
export type ChannelFilter = "all" | PlatformType;

interface InboxFiltersProps {
  filter: FilterType;
  channelFilter: ChannelFilter;
  onFilterChange: (filter: FilterType) => void;
  onChannelFilterChange: (channel: ChannelFilter) => void;
  unreadCount: number;
  urgentCount: number;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "urgent", label: "Urgent" },
  { key: "starred", label: "Starred" },
];

export default function InboxFilters({
  filter,
  channelFilter,
  onFilterChange,
  onChannelFilterChange,
  unreadCount,
  urgentCount,
}: InboxFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Status filters */}
      <div className="flex items-center gap-0.5 bg-secondary/50 rounded-xl p-1">
        {FILTERS.map((f) => {
          const badge =
            f.key === "unread" && unreadCount > 0
              ? unreadCount
              : f.key === "urgent" && urgentCount > 0
                ? urgentCount
                : null;

          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                filter === f.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {badge && (
                <span className="bg-urgent text-urgent-foreground text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Platform filters — dynamically generated from constants */}
      <div className="flex items-center gap-0.5 bg-secondary/50 rounded-xl p-1">
        <button
          onClick={() => onChannelFilterChange("all")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${
            channelFilter === "all"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Filter className="w-3 h-3" />
          <span className="hidden sm:inline">All</span>
        </button>
        {PLATFORMS.map((p) => {
          const Icon = getPlatformIconComponent(p);
          return (
            <button
              key={p}
              onClick={() => onChannelFilterChange(p)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                channelFilter === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{PLATFORM_LABELS[p]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
