"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Bell, X, CheckCheck, AlertTriangle, Info,
  TrendingDown, Shield, Clock, Sparkles,
} from "lucide-react";
import Link from "next/link";

const SKILL_ICONS: Record<string, React.ElementType> = {
  scope_guardian:         Shield,
  churn_predictor:        TrendingDown,
  ghosting_detector:      Clock,
  payment_sentinel:       AlertTriangle,
  revenue_radar:          Sparkles,
  conflict_detector:      AlertTriangle,
  reengagement_scheduler: Clock,
  daily_briefing:         Info,
  commitment_watchdog:    Clock,
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-urgent/40 bg-urgent/5",
  warning:  "border-warning/40 bg-warning/5",
  info:     "border-primary/30 bg-primary/5",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-urgent animate-pulse",
  warning:  "bg-warning",
  info:     "bg-primary",
};

const SEVERITY_ORDER = ["critical", "warning", "info"];

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---- Shared notification list ----
function NotificationList({ onClose }: { onClose?: () => void }) {
  const outputs    = useQuery(api.skills.getOutputs, { limit: 30, unreadOnly: false });
  const markRead   = useMutation(api.skills.markOutputRead);
  const dismiss    = useMutation(api.skills.dismissOutput);
  const markAllRead = useMutation(api.skills.markAllOutputsRead);
  const unreadCount = useQuery(api.skills.getUnreadCount) ?? 0;

  const grouped = (outputs ?? []).reduce((acc: Record<string, any[]>, o: any) => {
    const sev = o.severity ?? "info";
    if (!acc[sev]) acc[sev] = [];
    acc[sev].push(o);
    return acc;
  }, {});

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-[9px] font-mono font-bold bg-urgent/15 text-urgent px-1.5 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Mark all read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
        {(!outputs || outputs.length === 0) && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <Bell className="w-8 h-8 opacity-20" />
            <p className="text-sm font-medium opacity-50">All clear!</p>
            <p className="text-xs opacity-30">No notifications right now</p>
          </div>
        )}

        {SEVERITY_ORDER.map((sev) => {
          const items = grouped[sev];
          if (!items?.length) return null;
          const label = sev === "critical" ? "🔴 Critical" : sev === "warning" ? "🟡 Warnings" : "🔵 Info";
          return (
            <div key={sev} className="py-1">
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 px-4 py-1.5">
                {label}
              </p>
              {items.map((output: any) => (
                <div
                  key={output._id}
                  onClick={() => { if (!output.isRead) markRead({ id: output._id }); }}
                  className={`mx-2 mb-1.5 p-3 rounded-lg border cursor-pointer transition-all ${
                    SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.info
                  } ${output.isRead ? "opacity-55" : ""}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-1 shrink-0">
                      {!output.isRead && (
                        <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[sev] ?? "bg-primary"}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-1">
                          {output.title}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismiss({ id: output._id }); }}
                          className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">
                        {output.content}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-mono text-muted-foreground/40">
                          {timeAgo(output.createdAt)}
                        </span>
                        {output.clientId && (
                          <Link
                            href={`/clients/${output.clientId}`}
                            onClick={() => onClose?.()}
                            className="text-[9px] font-medium text-primary/70 hover:text-primary transition-colors"
                          >
                            View client →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-border/40 px-4 py-2.5 shrink-0">
        <Link
          href="/skills"
          onClick={() => onClose?.()}
          className="text-xs text-primary/70 hover:text-primary transition-colors font-medium"
        >
          View all in Skills →
        </Link>
      </div>
    </>
  );
}

// ---- Inline panel (used in BottomNav above-pill popover) ----
export function NotificationPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-80 bg-card/95 backdrop-blur-xl border border-border/60 rounded-2xl shadow-xl shadow-black/10 overflow-hidden flex flex-col">
      <NotificationList onClose={onClose} />
    </div>
  );
}

// ---- Popover button variant (kept for any future sidebar-style use) ----
export function NotificationCenter({ inlineMode, onClose }: { inlineMode?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const unreadCount = useQuery(api.skills.getUnreadCount) ?? 0;

  useEffect(() => {
    if (inlineMode) return;
    const handler = (e: MouseEvent) => {
      if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, inlineMode]);

  // In inline mode just render the list directly (for embedding)
  if (inlineMode) {
    return <NotificationList onClose={onClose} />;
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        id="notification-bell"
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2 rounded-lg transition-all duration-200 ${
          open ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
        }`}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-urgent text-white text-[9px] font-bold flex items-center justify-center px-0.5">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-80 glass rounded-xl shadow-2xl border border-border/60 z-[100] animate-fade-in overflow-hidden flex flex-col">
          <NotificationList onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
