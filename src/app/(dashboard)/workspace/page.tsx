"use client";

import { useEffect, useState, memo, useCallback, useMemo } from "react";
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
} from "lucide-react";
import Link from "next/link";
import {
  formatRelativeTime,
  getDeadlineProximity,
  getDayBounds,
  getWeekBounds,
  formatTimeOfDay,
} from "@/lib/date-utils";
import { format, addDays, startOfWeek } from "date-fns";

// ============================================
// WIDGET REGISTRY — Available widget types
// ============================================

interface WidgetMeta {
  type: string;
  name: string;
  description: string;
  sizes: string[]; // Allowed sizes
  icon: React.ReactNode;
}

const WIDGET_REGISTRY: WidgetMeta[] = [
  { type: "stat_card", name: "Stat Card", description: "Single metric display", sizes: ["1x1"], icon: <Zap className="h-4 w-4" /> },
  { type: "priority_inbox", name: "Priority Inbox", description: "Top urgent messages", sizes: ["2x2", "2x1"], icon: <Inbox className="h-4 w-4" /> },
  { type: "skill_feed", name: "Skill Feed", description: "AI skill alerts and insights", sizes: ["2x2", "2x1", "1x2"], icon: <Bell className="h-4 w-4" /> },
  { type: "client_health", name: "Client Health", description: "Client health + sentiment trends", sizes: ["2x1", "2x2"], icon: <Heart className="h-4 w-4" /> },
  { type: "recent_actions", name: "Action Items", description: "Recent extracted actions", sizes: ["2x1", "1x2"], icon: <Zap className="h-4 w-4" /> },
  { type: "revenue_signals", name: "Revenue Signals", description: "Deal signals, upsells, and budget changes", sizes: ["2x1", "1x2"], icon: <DollarSign className="h-4 w-4" /> },
  { type: "conversation_summaries", name: "Thread Summaries", description: "Recent AI conversation summaries", sizes: ["2x2", "2x1"], icon: <FileText className="h-4 w-4" /> },
  { type: "daily_briefing", name: "Daily Briefing", description: "Morning portfolio digest: priorities, risks, opportunities", sizes: ["2x2", "2x1"], icon: <Newspaper className="h-4 w-4" /> },
  { type: "sentiment_chart", name: "Sentiment Radar", description: "Client sentiment trends — spot declining relationships at a glance", sizes: ["2x1", "2x2"], icon: <TrendingUp className="h-4 w-4" /> },
  { type: "deadline_ticker", name: "Deadline Ticker", description: "Live count of overdue, due today, and due this week", sizes: ["2x1"], icon: <Clock className="h-4 w-4" /> },
  { type: "agenda_today", name: "Today's Agenda", description: "All commitments due today, sorted by time-of-day", sizes: ["2x2"], icon: <CalendarDays className="h-4 w-4" /> },
  { type: "agenda_week", name: "Week Agenda", description: "7-day commitment overview across all clients", sizes: ["2x2", "3x2"], icon: <Calendar className="h-4 w-4" /> },
  { type: "commitment_calendar", name: "Calendar", description: "Month-view calendar with commitment dot indicators", sizes: ["2x2"], icon: <Calendar className="h-4 w-4" /> },
];

// ============================================
// SIZE → CSS GRID CLASSES
// ============================================

const SIZE_CLASSES: Record<string, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x1": "col-span-2 row-span-1",
  "1x2": "col-span-1 row-span-2",
  "2x2": "col-span-2 row-span-2",
  "3x2": "col-span-3 row-span-2",
};

// ============================================
// WORKSPACE PAGE
// ============================================

export default function WorkspacePage() {
  const layout = useQuery(api.workspaceLayouts.getDefault);
  const ensureDefault = useMutation(api.workspaceLayouts.ensureDefault);
  const removeWidget = useMutation(api.workspaceLayouts.removeWidget);
  const addWidget = useMutation(api.workspaceLayouts.addWidget);

  const [editing, setEditing] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize default layout on first visit
  useEffect(() => {
    if (layout === null && !initialized) {
      setInitialized(true);
      ensureDefault({});
    }
  }, [layout, initialized, ensureDefault]);

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      if (layout) {
        removeWidget({ layoutId: layout._id, widgetId });
      }
    },
    [layout, removeWidget]
  );

  const handleAddWidget = useCallback(
    (type: string, size: string) => {
      if (!layout) return;
      const id = `${type}-${Date.now()}`;
      addWidget({
        layoutId: layout._id,
        widget: { id, type, size },
      });
      setShowAddPanel(false);
    },
    [layout, addWidget]
  );

  if (layout === undefined) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading workspace...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">
            Workspace
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your customizable dashboard — {layout?.name ?? "Overview"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <button
              onClick={() => setShowAddPanel(!showAddPanel)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Widget
            </button>
          )}
          <button
            onClick={() => {
              setEditing(!editing);
              setShowAddPanel(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              editing
                ? "bg-success text-white hover:bg-success/90"
                : "border border-border hover:bg-accent"
            }`}
          >
            {editing ? (
              <>Done</>
            ) : (
              <>
                <Settings2 className="h-3.5 w-3.5" />
                Edit
              </>
            )}
          </button>
        </div>
      </div>

      {/* Add Widget Panel */}
      {showAddPanel && (
        <div className="surface-raised rounded-xl p-4 mb-6 animate-slide-in">
          <div className="flex items-center gap-2 mb-3">
            <LayoutGrid className="h-4 w-4 text-primary" />
            <span className="text-sm font-display font-semibold text-foreground">
              Add Widget
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {WIDGET_REGISTRY.map((w) => (
              <button
                key={w.type}
                onClick={() => handleAddWidget(w.type, w.sizes[0])}
                className="p-3 rounded-lg border border-border/30 hover:bg-accent/50 hover:border-primary/30 transition-all text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-primary">{w.icon}</span>
                  <span className="text-xs font-medium text-foreground">
                    {w.name}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {w.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bento Grid */}
      {layout && layout.widgets.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[180px]">
          {layout.widgets.map((widget: Record<string, any>, index: number) => (
            <div
              key={widget.id}
              className={`${SIZE_CLASSES[widget.size] ?? "col-span-1 row-span-1"} relative group animate-slide-in`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {editing && (
                <button
                  onClick={() => handleRemoveWidget(widget.id)}
                  className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-urgent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <WidgetRenderer
                type={widget.type}
                size={widget.size}
                config={widget.config}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          <LayoutGrid className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm">Your workspace is empty</p>
          <p className="text-[11px] mt-1">Click Edit to add widgets</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// WIDGET RENDERER — Dispatches to the right component
// ============================================

const WidgetRenderer = memo(function WidgetRenderer({
  type,
  size,
  config,
}: {
  type: string;
  size: string;
  config?: any;
}) {
  switch (type) {
    case "stat_card":
      return <StatCardWidget metric={config?.metric ?? "unread"} />;
    case "priority_inbox":
      return <PriorityInboxWidget compact={size === "2x1"} />;
    case "skill_feed":
      return <SkillFeedWidget compact={size === "2x1"} />;
    case "client_health":
      return <ClientHealthWidget />;
    case "recent_actions":
      return <RecentActionsWidget />;
    case "revenue_signals":
      return <RevenueSignalsWidget />;
    case "conversation_summaries":
      return <ConversationSummariesWidget compact={size === "2x1"} />;
    case "daily_briefing":
      return <DailyBriefingWidget compact={size === "2x1"} />;
    case "sentiment_chart":
      return <SentimentChartWidget compact={size === "2x1"} />;
    case "deadline_ticker":
      return <DeadlineTickerWidget />;
    case "agenda_today":
      return <AgendaTodayWidget />;
    case "agenda_week":
      return <AgendaWeekWidget compact={size === "2x2"} />;
    case "commitment_calendar":
      return <CommitmentCalendarWidget />;
    default:
      return (
        <div className="surface-raised rounded-xl h-full flex items-center justify-center text-muted-foreground text-xs">
          Unknown widget: {type}
        </div>
      );
  }
});

// ============================================
// WIDGET COMPONENTS
// ============================================

// --- Stat Card ---
const STAT_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; key: string }
> = {
  unread: { label: "Unread", icon: <Inbox className="h-5 w-5" />, color: "primary", key: "unreadCount" },
  urgent: { label: "Urgent", icon: <AlertTriangle className="h-5 w-5" />, color: "urgent", key: "urgentCount" },
  actions: { label: "Actions", icon: <Zap className="h-5 w-5" />, color: "warning", key: "actionItemCount" },
  clients: { label: "Active Clients", icon: <Users className="h-5 w-5" />, color: "success", key: "activeClientCount" },
};

const COLOR_CLASSES: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  urgent: "bg-urgent/10 text-urgent",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
};

const StatCardWidget = memo(function StatCardWidget({ metric }: { metric: string }) {
  const stats = useQuery(api.analytics.getDailyStats);
  const cfg = STAT_CONFIG[metric] ?? STAT_CONFIG.unread;
  const value = (stats as any)?.[cfg.key] ?? 0;

  return (
    <div className="surface-raised rounded-xl h-full p-5 flex flex-col justify-center">
      <div className="flex items-center gap-4">
        <div
          className={`w-11 h-11 rounded-lg flex items-center justify-center ${COLOR_CLASSES[cfg.color]}`}
        >
          {cfg.icon}
        </div>
        <div>
          <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{cfg.label}</p>
        </div>
      </div>
    </div>
  );
});

// --- Priority Inbox ---
const PriorityInboxWidget = memo(function PriorityInboxWidget({
  compact,
}: {
  compact: boolean;
}) {
  const urgentMessages = useQuery(api.messages.getUrgent);
  const limit = compact ? 3 : 5;

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-sm font-display font-semibold text-foreground">
          Priority Inbox
        </span>
        <Link
          href="/inbox"
          className="text-[10px] text-primary hover:text-primary/80 font-medium"
        >
          View all
        </Link>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1 scrollbar-thin">
        {urgentMessages && urgentMessages.length > 0 ? (
          urgentMessages.slice(0, limit).map((msg: Record<string, any>) => (
            <Link
              key={msg._id}
              href={`/clients/${msg.clientId}`}
              className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div
                className={`w-1 h-8 rounded-full shrink-0 mt-0.5 ${
                  (msg.aiMetadata?.priorityScore ?? 0) >= 80
                    ? "bg-urgent"
                    : "bg-primary"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground truncate">
                    {msg.clientName ?? "Unknown"}
                  </span>
                  {msg.aiMetadata?.priorityScore && (
                    <span className="text-[9px] font-mono font-bold text-urgent">
                      P{msg.aiMetadata.priorityScore}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  {msg.text}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            No urgent messages
          </div>
        )}
      </div>
    </div>
  );
});

// --- Skill Feed ---
const SkillFeedWidget = memo(function SkillFeedWidget({
  compact,
}: {
  compact: boolean;
}) {
  const outputs = useQuery(api.skills.getOutputs, { limit: compact ? 4 : 8 });

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-sm font-display font-semibold text-foreground">
          AI Insights
        </span>
        <Link
          href="/skills"
          className="text-[10px] text-primary hover:text-primary/80 font-medium"
        >
          View all
        </Link>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1 scrollbar-thin">
        {outputs && outputs.length > 0 ? (
          outputs.map((o: Record<string, any>) => (
            <div
              key={o._id}
              className={`p-2.5 rounded-lg border transition-colors ${
                !o.isRead
                  ? "border-primary/20 bg-primary/5"
                  : "border-border/20"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    o.severity === "critical"
                      ? "bg-urgent"
                      : o.severity === "warning"
                        ? "bg-warning"
                        : "bg-primary"
                  }`}
                />
                <span className="text-xs font-medium text-foreground truncate">
                  {o.title}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3">
                {o.content}
              </p>
            </div>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            No insights yet
          </div>
        )}
      </div>
    </div>
  );
});

// --- Client Health ---
const ClientHealthWidget = memo(function ClientHealthWidget() {
  const clients = useQuery(api.clients.getByUser, { sortBy: "health" });

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-sm font-display font-semibold text-foreground">
          Client Health
        </span>
        <Link
          href="/clients"
          className="text-[10px] text-primary hover:text-primary/80 font-medium"
        >
          View all
        </Link>
      </div>
      <div className="space-y-1.5 overflow-y-auto flex-1 scrollbar-thin">
        {clients && clients.length > 0 ? (
          clients.slice(0, 8).map((client: Record<string, any>) => {
            const health = client.relationshipHealth ?? 50;
            const status =
              health >= 70 ? "healthy" : health >= 40 ? "attention" : "at-risk";
            const intel = client.intelligence;
            const trend = intel?.sentimentTrend;

            return (
              <Link
                key={client._id}
                href={`/clients/${client._id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    status === "healthy"
                      ? "bg-success/10 text-success"
                      : status === "attention"
                        ? "bg-warning/10 text-warning"
                        : "bg-urgent/10 text-urgent"
                  }`}
                >
                  {client.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate block">
                    {client.name}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-12 h-1 rounded-full bg-border/30">
                      <div
                        className={`h-full rounded-full ${
                          status === "healthy"
                            ? "bg-success"
                            : status === "attention"
                              ? "bg-warning"
                              : "bg-urgent"
                        }`}
                        style={{ width: `${health}%` }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        status === "healthy"
                          ? "text-success"
                          : status === "attention"
                            ? "text-warning"
                            : "text-urgent"
                      }`}
                    >
                      {health}
                    </span>
                  </div>
                </div>
                {trend && (
                  <span className="shrink-0">
                    {trend === "improving" ? (
                      <TrendingUp className="h-3 w-3 text-success" />
                    ) : trend === "declining" ? (
                      <TrendingDown className="h-3 w-3 text-urgent" />
                    ) : (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    )}
                  </span>
                )}
              </Link>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            No clients yet
          </div>
        )}
      </div>
    </div>
  );
});

// --- Recent Actions ---
const RecentActionsWidget = memo(function RecentActionsWidget() {
  const commitments = useQuery(api.commitments.getPendingWithClients);

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-sm font-display font-semibold text-foreground">
          Action Items
        </span>
        {commitments && commitments.length > 0 && (
          <span className="text-[10px] font-mono font-bold bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">
            {commitments.length}
          </span>
        )}
      </div>
      <div className="space-y-1.5 overflow-y-auto flex-1 scrollbar-thin">
        {commitments === undefined ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            Loading…
          </div>
        ) : commitments.length > 0 ? (
          commitments.slice(0, 8).map((c: any) => (
            <Link
              key={c._id}
              href={`/clients/${c.clientId}`}
              className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
            >
              <div className={`w-4 h-4 rounded border shrink-0 mt-0.5 ${c.isOverdue ? "border-urgent" : "border-border"}`} />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-foreground/80 line-clamp-1 group-hover:text-foreground transition-colors">
                  {c.text}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground truncate">
                    {c.clientName}
                  </span>
                  {c.isOverdue && (
                    <span className="text-[9px] font-bold text-urgent">overdue</span>
                  )}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            No pending action items
          </div>
        )}
      </div>
    </div>
  );
});

// --- Revenue Signals ---
const REVENUE_SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  deal:        { bg: "bg-success/10",  text: "text-success",  label: "Deal" },
  expansion:   { bg: "bg-primary/10",  text: "text-primary",  label: "Upsell" },
  contraction: { bg: "bg-urgent/10",   text: "text-urgent",   label: "Risk" },
  neutral:     { bg: "bg-accent",      text: "text-muted-foreground", label: "Signal" },
};

const RevenueSignalsWidget = memo(function RevenueSignalsWidget() {
  const outputs = useQuery(api.skills.getOutputs, { limit: 20 } as any);
  const revenueOutputs = ((outputs as any[]) ?? []).filter(
    (o: any) => o.skillSlug === "revenue_radar"
  );

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <DollarSign className="h-4 w-4 text-success" />
        <span className="text-sm font-display font-semibold text-foreground">
          Revenue Signals
        </span>
        {revenueOutputs.length > 0 && (
          <span className="ml-auto text-[10px] font-mono font-bold bg-success/10 text-success px-1.5 py-0.5 rounded-full">
            {revenueOutputs.length}
          </span>
        )}
      </div>
      <div className="space-y-1.5 overflow-y-auto flex-1 scrollbar-thin">
        {revenueOutputs.length > 0 ? (
          revenueOutputs.map((output: any) => {
            const meta = output.metadata as Record<string, any> | undefined;
            const signalType: string =
              meta?.signalType ?? meta?.type ??
              (output.title?.toLowerCase().includes("deal") ? "deal" :
               output.title?.toLowerCase().includes("upsell") ? "expansion" :
               output.title?.toLowerCase().includes("budget") ? "contraction" : "neutral");
            const style =
              REVENUE_SIGNAL_STYLES[signalType] ?? REVENUE_SIGNAL_STYLES.neutral;
            return (
              <Link
                key={output._id}
                href={`/clients/${output.clientId}`}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
              >
                <span
                  className={`mt-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${style.bg} ${style.text}`}
                >
                  {style.label}
                </span>
                <span className="text-[11px] text-foreground/80 line-clamp-2 group-hover:text-foreground transition-colors">
                  {output.content}
                </span>
              </Link>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            No revenue signals yet
          </div>
        )}
      </div>
    </div>
  );
});

// --- Conversation Summaries ---
const ARC_BADGE_STYLES: Record<string, string> = {
  active:     "bg-primary/10 text-primary",
  closing:    "bg-success/10 text-success",
  stalled:    "bg-warning/10 text-warning",
  escalating: "bg-urgent/10 text-urgent",
  resolved:   "bg-muted text-muted-foreground",
};

const ConversationSummariesWidget = memo(function ConversationSummariesWidget({
  compact,
}: {
  compact?: boolean;
}) {
  const summaries = useQuery(api.conversationSummaries.getForUser, {
    limit: compact ? 4 : 8,
  });

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-display font-semibold text-foreground">
          Thread Summaries
        </span>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1 scrollbar-thin">
        {summaries === undefined ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            Loading…
          </div>
        ) : summaries.length > 0 ? (
          summaries.map((s: any) => {
            const arcStyle = ARC_BADGE_STYLES[s.arc] ?? ARC_BADGE_STYLES.resolved;
            return (
              <Link
                key={s._id}
                href={`/clients/${s.clientId}`}
                className="block p-2.5 rounded-lg hover:bg-accent/50 transition-colors border border-border/20 hover:border-border/50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${arcStyle}`}
                  >
                    {s.arc}
                  </span>
                  {s.openCommitments > 0 && (
                    <span className="text-[9px] font-mono text-warning">
                      {s.openCommitments} open
                    </span>
                  )}
                  <span className="ml-auto text-[9px] text-muted-foreground">
                    {formatRelativeTime(s.updatedAt)}
                  </span>
                </div>
                <p className="text-[11px] text-foreground/80 line-clamp-2">
                  {s.summary}
                </p>
              </Link>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            No summaries yet — open a conversation and summarize it
          </div>
        )}
      </div>
    </div>
  );
});

// --- Daily Briefing ---
const SEVERITY_STYLES: Record<string, { ring: string; dot: string }> = {
  critical: { ring: "border-urgent/30",  dot: "bg-urgent" },
  warning:  { ring: "border-warning/30", dot: "bg-warning" },
  info:     { ring: "border-border/30",  dot: "bg-primary" },
};

const DailyBriefingWidget = memo(function DailyBriefingWidget({
  compact,
}: {
  compact?: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const [tick, setTick] = useState(0);
  const generateNow = useAction(api.ai.dailyBriefing.generateNow);

  // Fetch latest briefing from skill outputs
  const outputs = useQuery(api.skills.getOutputs, {
    skillSlug: "daily_briefing",
    limit: 1,
  } as any);

  const briefing = (outputs as any)?.[0] ?? null;
  const meta = briefing?.metadata as Record<string, any> | undefined;

  // Tick every minute so the "X minutes ago" timestamp stays current
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateNow({});
    } catch (err) {
      console.error("Briefing generation failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  const severityStyle = SEVERITY_STYLES[briefing?.severity ?? "info"] ?? SEVERITY_STYLES.info;

  return (
    <div
      className={`surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden border ${severityStyle.ring}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Newspaper className="h-4 w-4 text-primary" />
        <span className="text-sm font-display font-semibold text-foreground">
          Daily Briefing
        </span>
        {meta && (
          <span className="ml-auto text-[9px] font-mono text-muted-foreground" suppressHydrationWarning>
            {/* tick forces re-render every minute so "X ago" stays current */}
            {tick >= 0 && formatRelativeTime(meta.generatedAt as number)}
          </span>
        )}
      </div>

      {briefing ? (
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3">
          {/* Headline */}
          <p className="text-[12px] font-medium text-foreground leading-snug">
            {briefing.content}
          </p>

          {/* Stats strip */}
          {meta?.stats && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
              <span>{meta.stats.totalClients} clients</span>
              {meta.stats.atRiskClients > 0 && (
                <span className="text-urgent">{meta.stats.atRiskClients} at risk</span>
              )}
              {meta.stats.opportunityClients > 0 && (
                <span className="text-success">{meta.stats.opportunityClients} opportunities</span>
              )}
              {meta.stats.overdueCommitments > 0 && (
                <span className="text-warning">{meta.stats.overdueCommitments} overdue</span>
              )}
            </div>
          )}

          {!compact && (
            <>
              {/* Top Priorities */}
              {(meta?.topPriorities as any[])?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Priorities
                  </p>
                  <div className="space-y-1">
                    {(meta!.topPriorities as any[]).map((p: any) => (
                      <Link
                        key={p.clientId}
                        href={`/clients/${p.clientId}`}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/50 transition-colors group"
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            p.urgency === "high" ? "bg-urgent" : "bg-primary"
                          }`}
                        />
                        <span className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors truncate">
                          {p.clientName}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {p.reason}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Flags */}
              {(meta?.riskFlags as any[])?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Risk Flags
                  </p>
                  <div className="space-y-1">
                    {(meta!.riskFlags as any[]).map((r: any) => (
                      <Link
                        key={r.clientId}
                        href={`/clients/${r.clientId}`}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <AlertTriangle
                          className={`h-3 w-3 shrink-0 ${
                            r.severity === "critical" ? "text-urgent" : "text-warning"
                          }`}
                        />
                        <span className="text-[11px] font-medium text-foreground truncate">
                          {r.clientName}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {r.risk}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Opportunities */}
              {(meta?.opportunities as any[])?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Opportunities
                  </p>
                  <div className="space-y-1">
                    {(meta!.opportunities as any[]).map((o: any) => (
                      <Link
                        key={o.clientId}
                        href={`/clients/${o.clientId}`}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <TrendingUp className="h-3 w-3 text-success shrink-0" />
                        <span className="text-[11px] font-medium text-foreground truncate">
                          {o.clientName}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {o.opportunity}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Focus */}
              {meta?.suggestedFocus && (
                <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-[10px] font-bold text-primary mb-0.5 uppercase tracking-wider">
                    Suggested Focus
                  </p>
                  <p className="text-[11px] text-foreground/80 leading-snug">
                    {meta.suggestedFocus as string}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Compact: just workload summary */}
          {compact && meta?.workloadSummary && (
            <p className="text-[11px] text-muted-foreground leading-snug">
              {meta.workloadSummary as string}
            </p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <Newspaper className="h-8 w-8 text-muted-foreground/20" />
          <div>
            <p className="text-[11px] text-muted-foreground">No briefing yet today</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Auto-generates at 7am · or generate now
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Newspaper className="h-3 w-3" />
            )}
            {generating ? "Generating…" : "Generate Briefing"}
          </button>
        </div>
      )}
    </div>
  );
});

// --- Sentiment Radar ---
// Zero-cost: reads intelligence.sentimentTrend already stored on client records.
// Clients are sorted: declining first, then stable, then improving.
const SENTIMENT_TREND_META: Record<
  string,
  { icon: React.ReactNode; label: string; rowClass: string; badgeClass: string }
> = {
  declining:  {
    icon: <TrendingDown className="h-3 w-3 text-urgent" />,
    label: "Declining",
    rowClass: "border-urgent/20 bg-urgent/5",
    badgeClass: "bg-urgent/10 text-urgent",
  },
  stable:     {
    icon: <Minus className="h-3 w-3 text-muted-foreground" />,
    label: "Stable",
    rowClass: "border-border/20",
    badgeClass: "bg-muted text-muted-foreground",
  },
  improving:  {
    icon: <TrendingUp className="h-3 w-3 text-success" />,
    label: "Improving",
    rowClass: "border-success/20 bg-success/5",
    badgeClass: "bg-success/10 text-success",
  },
};

// Churn risk label derived from aggregateChurnRisk (exists in schema)
const CHURN_DISPLAY: Record<string, { label: string; cls: string }> = {
  high:   { label: "High churn risk",   cls: "text-urgent" },
  medium: { label: "Medium churn risk", cls: "text-warning" },
  low:    { label: "Low churn risk",    cls: "text-muted-foreground" },
  none:   { label: "Healthy",           cls: "text-success" },
};

const TREND_ORDER: Record<string, number> = { declining: 0, stable: 1, improving: 2 };

const SentimentChartWidget = memo(function SentimentChartWidget({
  compact,
}: {
  compact?: boolean;
}) {
  const clients = useQuery(api.clients.getByUser, {});
  const limit = compact ? 5 : 10;

  // Sort declining → stable → improving so the highest-risk rows appear first
  const sorted = ((clients as any[]) ?? [])
    .filter((c: any) => c.intelligence?.sentimentTrend)
    .sort((a: any, b: any) => {
      const ta = TREND_ORDER[a.intelligence.sentimentTrend] ?? 1;
      const tb = TREND_ORDER[b.intelligence.sentimentTrend] ?? 1;
      return ta - tb;
    })
    .slice(0, limit);

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="text-sm font-display font-semibold text-foreground">
          Sentiment Radar
        </span>
        {sorted.filter((c: any) => c.intelligence?.sentimentTrend === "declining").length > 0 && (
          <span className="ml-auto text-[10px] font-mono font-bold bg-urgent/10 text-urgent px-1.5 py-0.5 rounded-full">
            {sorted.filter((c: any) => c.intelligence?.sentimentTrend === "declining").length} declining
          </span>
        )}
      </div>

      <div className="space-y-1.5 overflow-y-auto flex-1 scrollbar-thin">
        {clients === undefined ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
            Loading…
          </div>
        ) : sorted.length > 0 ? (
          sorted.map((client: any) => {
            const trend = client.intelligence?.sentimentTrend ?? "stable";
            const meta = SENTIMENT_TREND_META[trend] ?? SENTIMENT_TREND_META.stable;
            const churnRisk = client.intelligence?.aggregateChurnRisk ?? "";
            const churnDisplay = CHURN_DISPLAY[churnRisk];
            const health = client.relationshipHealth ?? 50;

            return (
              <Link
                key={client._id}
                href={`/clients/${client._id}`}
                className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors hover:bg-accent/50 ${meta.rowClass}`}
              >
                {/* Trend icon */}
                <span className="shrink-0">{meta.icon}</span>

                {/* Client info */}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground truncate block">
                    {client.name}
                  </span>
                  {churnDisplay && (
                    <span className={`text-[10px] font-mono ${churnDisplay.cls}`}>
                      {churnDisplay.label}
                    </span>
                  )}
                </div>

                {/* Health bar */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-border/30">
                    <div
                      className={`h-full rounded-full ${
                        health >= 70 ? "bg-success" : health >= 40 ? "bg-warning" : "bg-urgent"
                      }`}
                      style={{ width: `${health}%` }}
                    />
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      health >= 70
                        ? "text-success"
                        : health >= 40
                          ? "text-warning"
                          : "text-urgent"
                    }`}
                  >
                    {health}
                  </span>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center">
            <TrendingUp className="h-6 w-6 text-muted-foreground/20" />
            <p className="text-[11px] text-muted-foreground">
              No sentiment data yet
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              Trends appear after AI analysis runs
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================
// NEW WIDGETS — Calendar & Agenda System
// ============================================

// --- Deadline Ticker ---
// Shows 3 counts: overdue | due today | due this week. Zero-cost, reads commitments.
const DeadlineTickerWidget = memo(function DeadlineTickerWidget() {
  const { start: dayStart, end: dayEnd }   = useMemo(() => getDayBounds(),  []);
  const { start: weekStart, end: weekEnd } = useMemo(() => getWeekBounds(), []);

  const todayItems  = useQuery(api.commitments.getAllForCalendar, { startDate: dayStart,  endDate: dayEnd  });
  const weekItems   = useQuery(api.commitments.getAllForCalendar, { startDate: weekStart, endDate: weekEnd });
  const pendingAll  = useQuery(api.commitments.getPending);

  const overdue  = (pendingAll ?? []).filter((c: any) => c.isOverdue).length;
  const dueToday = (todayItems  ?? []).filter((c: any) => c.status === "pending").length;
  const dueWeek  = (weekItems   ?? []).filter((c: any) => c.status === "pending").length;

  const TICKERS = [
    { label: "Overdue",     value: overdue,  color: "text-urgent",  bg: "bg-urgent/10"  },
    { label: "Due Today",   value: dueToday, color: "text-warning", bg: "bg-warning/10" },
    { label: "This Week",   value: dueWeek,  color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Clock className="h-4 w-4 text-primary" />
        <span className="text-sm font-display font-semibold text-foreground">Deadlines</span>
        <Link href="/calendar" className="ml-auto text-[10px] text-primary hover:text-primary/80 font-medium">
          Calendar →
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-around">
        {TICKERS.map(({ label, value, color, bg }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg}`}>
              <span className={`text-xl font-mono font-bold ${color}`}>{value ?? "—"}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// --- Agenda Today ---
// Today's commitments sorted by time-of-day. Inline complete action.
const TYPE_BADGE: Record<string, string> = {
  deadline:    "bg-urgent/10 text-urgent",
  deliverable: "bg-primary/10 text-primary",
  payment:     "bg-success/10 text-success",
  meeting:     "bg-chart-4/10 text-chart-4",
  check_in:    "bg-muted text-muted-foreground",
};

const AgendaTodayWidget = memo(function AgendaTodayWidget() {
  const { start, end } = useMemo(() => getDayBounds(), []);
  const items = useQuery(api.commitments.getAgendaForDateRange, {
    startDate: start,
    endDate: end,
    includeOverdue: true,
  });

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <CalendarDays className="h-4 w-4 text-primary" />
        <span className="text-sm font-display font-semibold text-foreground">Today</span>
        <span className="text-[10px] text-muted-foreground ml-1" suppressHydrationWarning>{format(new Date(), "EEE, MMM d")}</span>
        {items && items.length > 0 && (
          <span className="ml-auto text-[10px] font-mono font-bold bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        )}
      </div>
      <div className="space-y-1.5 overflow-y-auto flex-1 scrollbar-thin">
        {items === undefined ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">Loading…</div>
        ) : items.length > 0 ? (
          items.map((c: any) => {
            const proximity = c.dueDate ? getDeadlineProximity(c.dueDate) : null;
            const timeHint = formatTimeOfDay(c.dueTimeOfDay);
            const badge = TYPE_BADGE[c.type] ?? "bg-muted text-muted-foreground";
            return (
              <Link
                key={c._id}
                href={`/clients/${c.clientId}`}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors hover:bg-accent/50 ${
                  c.isOverdue ? "border-urgent/20 bg-urgent/5" : "border-border/20"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                  c.isOverdue ? "bg-urgent" : proximity?.severity === "warning" ? "bg-warning" : "bg-primary"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground leading-snug line-clamp-1">{c.text}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground truncate">{c.clientName}</span>
                    <span className={`text-[9px] font-mono font-bold ${
                      proximity?.severity === "critical" ? "text-urgent" :
                      proximity?.severity === "warning" ? "text-warning" : "text-muted-foreground"
                    }`}>
                      {proximity?.label ?? ""}
                    </span>
                    {timeHint && (
                      <span className="text-[9px] text-muted-foreground/60">{timeHint}</span>
                    )}
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${badge}`}>
                  {c.type}
                </span>
              </Link>
            );
          })
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-center">
            <CheckCircle2 className="h-6 w-6 text-muted-foreground/20" />
            <p className="text-[11px] text-muted-foreground">Nothing due today</p>
          </div>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-border/20 shrink-0">
        <Link href="/calendar" className="text-[10px] text-primary hover:text-primary/80 font-medium">
          Open calendar →
        </Link>
      </div>
    </div>
  );
});

// --- Agenda Week ---
// 7-day strip showing commitments grouped by day.
const AgendaWeekWidget = memo(function AgendaWeekWidget({ compact }: { compact?: boolean }) {
  const { start, end } = useMemo(() => getWeekBounds(), []);
  const items = useQuery(api.commitments.getAgendaForDateRange, {
    startDate: start,
    endDate: end,
    includeOverdue: true,
  });

  // Build 7 day buckets
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

  // Prepend overdue
  const overdue = (items ?? []).filter((c: any) => c.isOverdue);

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="text-sm font-display font-semibold text-foreground">This Week</span>
        <Link href="/calendar" className="ml-auto text-[10px] text-primary hover:text-primary/80 font-medium">
          Full calendar →
        </Link>
      </div>

      {/* Overdue strip */}
      {overdue.length > 0 && (
        <div className="mb-2 p-2 rounded-lg bg-urgent/5 border border-urgent/20 shrink-0">
          <p className="text-[9px] font-bold text-urgent uppercase tracking-wider mb-1">
            {overdue.length} overdue
          </p>
          <div className="space-y-0.5">
            {overdue.slice(0, 2).map((c: any) => (
              <Link key={c._id} href={`/clients/${c.clientId}`}
                className="flex items-center gap-1.5 hover:opacity-80">
                <span className="text-[10px] text-foreground/80 truncate">{c.text}</span>
                <span className="text-[9px] text-muted-foreground shrink-0">{c.clientName}</span>
              </Link>
            ))}
            {overdue.length > 2 && (
              <p className="text-[9px] text-urgent font-mono">+{overdue.length - 2} more</p>
            )}
          </div>
        </div>
      )}

      {/* 7-day grid */}
      <div className={`grid gap-1.5 flex-1 overflow-hidden ${compact ? "grid-cols-7" : "grid-cols-7"}`}>
        {days.map(({ label, dayLabel, isToday, items: dayItems }) => (
          <div key={label} className="flex flex-col gap-1">
            {/* Day header */}
            <div className={`text-center pb-1 border-b ${isToday ? "border-primary/40" : "border-border/20"}`}>
              <p className={`text-[9px] font-mono uppercase ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                {label}
              </p>
              <p className={`text-[11px] font-bold ${isToday ? "text-primary" : "text-foreground/60"}`}>
                {dayLabel}
              </p>
            </div>
            {/* Day items */}
            <div className="space-y-0.5 overflow-hidden">
              {dayItems.slice(0, 3).map((c: any) => (
                <Link key={c._id} href={`/clients/${c.clientId}`}
                  className="block p-0.5 rounded text-[9px] leading-tight text-foreground/70 hover:text-foreground truncate hover:bg-accent/50 transition-colors">
                  {c.text}
                </Link>
              ))}
              {dayItems.length > 3 && (
                <p className="text-[8px] text-muted-foreground font-mono">+{dayItems.length - 3}</p>
              )}
              {dayItems.length === 0 && (
                <div className="h-1 w-4 rounded-full bg-border/20 mx-auto mt-1" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// --- Mini Commitment Calendar ---
// Month grid with dot indicators per day. Click a day → navigates to /calendar.
const CommitmentCalendarWidget = memo(function CommitmentCalendarWidget() {
  const [viewDate, setViewDate] = useState(new Date());
  const { start, end } = useMemo(() => {
    const s = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const e = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start: s.getTime(), end: e.getTime() };
  }, [viewDate]);

  const items = useQuery(api.commitments.getAllForCalendar, { startDate: start, endDate: end });

  // Build a map of day-of-month → commitment counts
  const dayMap = new Map<number, { pending: number; overdue: number }>();
  for (const c of items ?? []) {
    if (!c.dueDate) continue;
    const d = new Date(c.dueDate).getDate();
    const prev = dayMap.get(d) ?? { pending: 0, overdue: 0 };
    if (c.isOverdue) prev.overdue++;
    else prev.pending++;
    dayMap.set(d, prev);
  }

  const today = new Date();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  // Offset: Monday=0 start
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  return (
    <div className="surface-raised rounded-xl h-full p-4 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="text-sm font-display font-semibold text-foreground">
          {format(viewDate, "MMMM yyyy")}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1 shrink-0">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-mono text-muted-foreground/60">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5 flex-1">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1;
          if (dayNum < 1 || dayNum > daysInMonth) return <div key={i} />;
          const isToday =
            dayNum === today.getDate() &&
            viewDate.getMonth() === today.getMonth() &&
            viewDate.getFullYear() === today.getFullYear();
          const counts = dayMap.get(dayNum);
          const hasOverdue  = (counts?.overdue ?? 0) > 0;
          const hasPending  = (counts?.pending ?? 0) > 0;

          return (
            <Link
              key={i}
              href="/calendar"
              className={`flex flex-col items-center justify-start pt-0.5 rounded transition-colors hover:bg-accent/50 ${
                isToday ? "bg-primary/10" : ""
              }`}
            >
              <span className={`text-[10px] font-mono leading-none ${
                isToday ? "text-primary font-bold" : "text-foreground/60"
              }`}>
                {dayNum}
              </span>
              {/* Dot indicators */}
              <div className="flex gap-0.5 mt-0.5">
                {hasOverdue  && <div className="w-1 h-1 rounded-full bg-urgent" />}
                {hasPending  && <div className="w-1 h-1 rounded-full bg-primary" />}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-border/20 shrink-0 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-urgent" />
          <span className="text-[9px] text-muted-foreground">Overdue</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[9px] text-muted-foreground">Pending</span>
        </div>
        <Link href="/calendar" className="ml-auto text-[9px] text-primary hover:text-primary/80 font-medium">
          Full view →
        </Link>
      </div>
    </div>
  );
});
