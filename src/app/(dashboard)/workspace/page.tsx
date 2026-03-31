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
  GripVertical,
  Pen
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
} from "@/lib/date-utils";
import { format, addDays, startOfWeek } from "date-fns";
import { GlassDateStrip } from "@/components/dashboard/glass-date-strip";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";

function NumberTicker({ value, className }: { value: number; className?: string }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20, mass: 0.5 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span className={className}>{display}</motion.span>;
}

import { WorkspaceDynamicToolbar } from "@/components/dashboard/workspace-toolbar";
import { WireHubWidget } from "@/components/dashboard/hub-widget";
import { SentimentTrajectoryChart, type SentimentPoint } from "@/components/dashboard/sentiment-trajectory-chart";


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
  { type: "hub", name: "Intelligence Hub", description: "Tabbed hub: inbox, clients, skills, actions", sizes: ["2x2"], icon: <LayoutGrid className="h-4 w-4" /> },
  { type: "animated_insights", name: "AI Insights (Live)", description: "Auto-cycling skill feed with filter tabs", sizes: ["2x2", "1x2"], icon: <Bell className="h-4 w-4" /> },
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
// THREE-COLUMN SIDE PANELS
// ============================================

function WorkspaceStatsPanel() {
  const stats = useQuery(api.analytics.getDailyStats);
  const METRICS = [
    { label: "Unread",  key: "unreadCount",      color: "text-primary", bg: "bg-primary/10",  bar: "bg-primary",  icon: Inbox },
    { label: "Urgent",  key: "urgentCount",       color: "text-urgent",  bg: "bg-urgent/10",   bar: "bg-urgent",   icon: AlertTriangle },
    { label: "Actions", key: "actionItemCount",   color: "text-warning", bg: "bg-warning/10",  bar: "bg-warning",  icon: Zap },
    { label: "Clients", key: "activeClientCount", color: "text-success", bg: "bg-success/10",  bar: "bg-success",  icon: Users },
  ] as const;
  return (
    <div className="surface-raised rounded-xl p-3 shrink-0 space-y-1.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 px-1 pb-1">Overview</p>
      {METRICS.map(({ label, key, color, bg, bar, icon: Icon }) => {
        const value = (stats as any)?.[key] ?? 0;
        return (
          <div key={label} className="flex items-center gap-2.5 px-1 py-1.5 rounded-lg hover:bg-accent/30 transition-colors">
            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${bg}`}>
              <Icon className={`h-3 w-3 ${color}`} />
            </div>
            <span className="text-[11px] text-muted-foreground flex-1">{label}</span>
            <span className={`text-sm font-mono font-bold ${color}`}>
              <NumberTicker value={value} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WorkspaceClientPanel() {
  const clients = useQuery(api.clients.getByUser, { sortBy: "health" });
  const atRisk = (clients ?? []).filter((c: any) => (c.relationshipHealth ?? 50) < 40).length;
  return (
    <div className="surface-raised rounded-xl p-3 flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">Clients</span>
          {atRisk > 0 && (
            <span className="text-[9px] font-mono font-bold bg-urgent/10 text-urgent px-1.5 py-0.5 rounded-full">
              {atRisk} at risk
            </span>
          )}
        </div>
        <Link href="/clients" className="text-[10px] text-primary hover:text-primary/80 font-medium">View all</Link>
      </div>
      <div className="overflow-y-auto scrollbar-thin space-y-0.5 flex-1">
        {!clients ? (
          <div className="flex justify-center py-4"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>
        ) : (clients).slice(0, 10).map((c: any) => {
          const h = c.relationshipHealth ?? 50;
          const color = h >= 70 ? "text-success" : h >= 40 ? "text-warning" : "text-urgent";
          const bg   = h >= 70 ? "bg-success/10" : h >= 40 ? "bg-warning/10" : "bg-urgent/10";
          return (
            <Link key={c._id} href={`/clients/${c._id}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/40 transition-colors group"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${bg} ${color}`}>
                {c.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-foreground truncate group-hover:text-primary transition-colors">{c.name}</p>
                <div className="w-full h-0.5 rounded-full bg-border/30 mt-0.5">
                  <div className={`h-full rounded-full transition-all ${h >= 70 ? "bg-success" : h >= 40 ? "bg-warning" : "bg-urgent"}`} style={{ width: `${h}%` }} />
                </div>
              </div>
              <span className={`text-[9px] font-mono font-bold shrink-0 ${color}`}>{h}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceActionsPanel() {
  const items = useQuery(api.commitments.getPendingWithClients);
  const complete = useMutation(api.commitments.complete);
  const overdueCount = (items ?? []).filter((i: any) => i.isOverdue).length;

  return (
    <div className="surface-raised rounded-xl p-3 flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">Action Items</span>
          {overdueCount > 0 && (
            <span className="text-[9px] font-mono font-bold bg-urgent/10 text-urgent px-1.5 py-0.5 rounded-full">
              {overdueCount} overdue
            </span>
          )}
        </div>
        <Link href="/pulse" className="text-[10px] text-primary hover:text-primary/80 font-medium">
          View all
        </Link>
      </div>
      <div className="overflow-y-auto scrollbar-thin space-y-1 flex-1 min-h-0">
        {items === undefined ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length > 0 ? items.map((item: any) => (
          <div
            key={item._id}
            className={`flex items-start gap-2 p-2 rounded-lg border group transition-colors cursor-pointer ${
              item.isOverdue
                ? "border-urgent/20 bg-urgent/[0.03] hover:bg-urgent/[0.05]"
                : "border-border/20 hover:border-border/40 hover:bg-accent/30"
            }`}
            onClick={() => complete({ id: item._id })}
          >
            <div className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded border border-border/60 group-hover:border-primary/50 group-hover:bg-primary/5 transition-colors" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-1">{item.text ?? item.title}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-muted-foreground truncate">{item.clientName ?? "No client"}</span>
                {item.dueDate && (
                  <span className={`text-[9px] font-mono shrink-0 ${item.isOverdue ? "text-urgent font-bold" : "text-muted-foreground/60"}`}>
                    · {item.isOverdue ? "⚠ " : ""}{format(new Date(item.dueDate), "MMM d")}
                  </span>
                )}
              </div>
            </div>
          </div>
        )) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 py-4 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 opacity-20" />
            <span className="text-[11px]">All clear!</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single client sentiment slide (always renders, no null returns) ──────────
function ClientSentimentSlide({ client }: { client: any }) {
  const sentimentData = useQuery(api.messages.getSentimentData, { clientId: client._id, limit: 20 });
  const trend = (client.intelligence?.sentimentTrend ?? "stable") as "improving" | "declining" | "stable";
  const health = client.relationshipHealth ?? 50;
  const healthColor = health >= 70 ? "text-success" : health >= 40 ? "text-warning" : "text-urgent";
  const healthBg    = health >= 70 ? "bg-success/10" : health >= 40 ? "bg-warning/10" : "bg-urgent/10";

  return (
    <Link href={`/clients/${client._id}`} className="block">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${healthBg} ${healthColor}`}>
          {client.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-[12px] font-semibold text-foreground truncate flex-1">{client.name}</span>
        {trend === "improving" && <TrendingUp className="h-3.5 w-3.5 text-success shrink-0" />}
        {trend === "declining" && <TrendingDown className="h-3.5 w-3.5 text-urgent shrink-0" />}
        {trend === "stable"    && <Minus className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
      </div>
      {sentimentData === undefined ? (
        <div className="h-14 flex items-center justify-center">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      ) : sentimentData.length >= 2 ? (
        <SentimentTrajectoryChart
          data={sentimentData as SentimentPoint[]}
          intelligenceTrend={trend}
          height={56}
          showXAxis={false}
        />
      ) : (
        <div className="h-14 flex items-center justify-center text-[10px] text-muted-foreground">
          Not enough data yet
        </div>
      )}
    </Link>
  );
}

function WorkspaceSentimentPanel() {
  const clients = useQuery(api.clients.getByUser, { sortBy: "health" });
  const [activeIdx, setActiveIdx] = useState(0);

  const list = (clients ?? []).slice(0, 8);

  // Auto-advance every 5s
  useEffect(() => {
    if (list.length <= 1) return;
    const id = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % list.length);
    }, 5000);
    return () => clearInterval(id);
  }, [list.length]);

  const safeIdx = list.length > 0 ? activeIdx % list.length : 0;

  const goTo = (i: number) => setActiveIdx(i);

  if (!clients) {
    return (
      <div className="surface-raised rounded-xl p-3 flex items-center justify-center shrink-0" style={{ minHeight: 100 }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="surface-raised rounded-xl p-3 flex items-center justify-center shrink-0 text-[11px] text-muted-foreground" style={{ minHeight: 100 }}>
        No clients yet
      </div>
    );
  }

  return (
    <div className="surface-raised rounded-xl p-3 flex flex-col gap-2 shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Sentiment</span>
        {list.length > 1 && (
          <div className="flex items-center gap-1 mx-auto">
            {list.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === safeIdx ? "w-4 bg-primary" : "w-1.5 bg-border/50 hover:bg-border"
                }`}
              />
            ))}
          </div>
        )}
        <Link href="/clients" className="ml-auto text-[10px] text-primary hover:text-primary/80 font-medium">View all</Link>
      </div>

      {/* Always-mounted slides — CSS fade only, no unmount so queries stay cached */}
      <div className="relative" style={{ minHeight: 100 }}>
        {list.map((client, idx) => (
          <div
            key={client._id}
            className="transition-opacity duration-300"
            style={{
              position: idx === safeIdx ? "relative" : "absolute",
              inset: idx === safeIdx ? "auto" : 0,
              opacity: idx === safeIdx ? 1 : 0,
              pointerEvents: idx === safeIdx ? "auto" : "none",
            }}
          >
            <ClientSentimentSlide client={client} />
          </div>
        ))}
      </div>
    </div>
  );
}

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
    <div ref={setNodeRef} style={style} className={`${className} relative group`} {...attributes}>
      {editing && (
        <>
          <div
            {...listeners}
            className="absolute top-1.5 left-1.5 z-20 p-1 rounded-md bg-card/80 backdrop-blur-sm border border-border/40 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <button
            onClick={onRemove}
            className="absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full bg-urgent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
      {children}
    </div>
  );
}

// ============================================
// WORKSPACE PAGE
// ============================================

export default function WorkspacePage() {
  const layout = useQuery(api.workspaceLayouts.getDefault);
  const ensureDefault = useMutation(api.workspaceLayouts.ensureDefault);
  const removeWidget = useMutation(api.workspaceLayouts.removeWidget);
  const addWidget = useMutation(api.workspaceLayouts.addWidget);
  const updateWidgets = useMutation(api.workspaceLayouts.updateWidgets);

  const [editing, setEditing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  // Local copy of widgets for optimistic drag-to-reorder
  const [localWidgets, setLocalWidgets] = useState<any[]>([]);

  // Sync local widgets when Convex layout changes
  useEffect(() => {
    if (layout?.widgets) setLocalWidgets(layout.widgets);
  }, [layout?.widgets]);

  // DnD sensors — require 8px movement before drag activates (prevents click interference)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

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
    (type: string) => {
      if (!layout) return;
      const meta = WIDGET_REGISTRY.find((w) => w.type === type);
      const size = meta?.sizes[0] ?? "2x2";
      const id = `${type}-${Date.now()}`;
      addWidget({ layoutId: layout._id, widget: { id, type, size } });
    },
    [layout, addWidget]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !layout) return;
      const oldIdx = localWidgets.findIndex((w) => w.id === active.id);
      const newIdx = localWidgets.findIndex((w) => w.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(localWidgets, oldIdx, newIdx);
      setLocalWidgets(reordered);
      updateWidgets({ layoutId: layout._id, widgets: reordered });
    },
    [localWidgets, layout, updateWidgets]
  );

  if (layout === undefined) {
    return (
      <div className="h-full flex flex-col overflow-hidden animate-fade-in">
        {/* Skeleton header */}
        <div className="px-5 pt-5 pb-3 shrink-0 flex items-center justify-between">
          <div className="h-9 w-48 rounded-full bg-muted/40 animate-pulse" />
          <div className="h-11 w-44 rounded-full bg-muted/40 animate-pulse" />
        </div>
        {/* Skeleton body */}
        <div className="flex-1 flex gap-4 px-5 pb-5 min-h-0 overflow-hidden">
          <div className="w-[220px] shrink-0 flex flex-col gap-3">
            <div className="h-36 rounded-xl bg-muted/30 animate-pulse" />
            <div className="flex-1 rounded-xl bg-muted/30 animate-pulse" />
          </div>
          <div className="flex-1 grid grid-cols-4 gap-4 auto-rows-[180px] content-start">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`rounded-xl bg-muted/30 animate-pulse ${i % 3 === 0 ? "col-span-2 row-span-2" : i % 2 === 0 ? "col-span-2" : "col-span-1"}`} />
            ))}
          </div>
          <div className="w-[240px] shrink-0 flex flex-col gap-3">
            <div className="flex-1 rounded-xl bg-muted/30 animate-pulse" />
            <div className="h-40 rounded-xl bg-muted/30 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-fade-in overflow-hidden">

      {/* ── Header ── */}
      <div className={`px-5 pt-5 pb-3 shrink-0 flex items-center justify-between transition-colors duration-300 ${
        editing ? "border-b border-primary/20 bg-primary/[0.02]" : ""
      }`}>
        <GlassDateStrip />
        <div className="flex items-center gap-2">
          {editing && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-medium text-primary">
                <Pen className="h-3 w-3" />
              </span>
            </motion.div>
          )}
          <WorkspaceDynamicToolbar
            editing={editing}
            onToggleEdit={() => setEditing(!editing)}
            onAddWidget={handleAddWidget}
            widgetRegistry={WIDGET_REGISTRY}
          />
        </div>
      </div>

      {/* ── Three-column body ── */}
      <div className="flex-1 flex gap-4 px-5 py-3 min-h-0 overflow-hidden">

        {/* Left panel */}
        <div className="w-[220px] shrink-0 hidden lg:flex flex-col gap-3 overflow-hidden">
          <WorkspaceStatsPanel />
          <WorkspaceClientPanel />
        </div>

        {/* Center — main widget grid */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
          {localWidgets.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-4 gap-4 auto-rows-[180px] pb-24">
                  <AnimatePresence initial={false}>
                    {localWidgets.map((widget: Record<string, any>) => (
                      <SortableWidget
                        key={widget.id}
                        id={widget.id}
                        className={SIZE_CLASSES[widget.size] ?? "col-span-1 row-span-1"}
                        editing={editing}
                        onRemove={() => handleRemoveWidget(widget.id)}
                      >
                        <WidgetRenderer type={widget.type} size={widget.size} config={widget.config} />
                      </SortableWidget>
                    ))}
                  </AnimatePresence>
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
              <div className="w-20 h-20 rounded-2xl bg-muted/30 border border-border/30 flex items-center justify-center">
                <LayoutGrid className="h-9 w-9 text-muted-foreground/20" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground/70">Your workspace is empty</p>
                <p className="text-xs mt-1 opacity-50">Click Customize → Add Widget to get started</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px]">1</span>
                <span>Click Customize</span>
                <span className="text-border">→</span>
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px]">2</span>
                <span>Add Widget</span>
                <span className="text-border">→</span>
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px]">3</span>
                <span>Drag to arrange</span>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-[240px] shrink-0 hidden xl:flex flex-col gap-3 overflow-hidden">
          <WorkspaceActionsPanel />
          <WorkspaceSentimentPanel />
        </div>

      </div>
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
      return <AgendaWeekWidget compact={size === "2x1"} />;
    case "commitment_calendar":
      return <CommitmentCalendarWidget />;
    case "hub":
      return <WireHubWidget />;
    case "animated_insights":
      return <AnimatedInsightsWidget />;
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
          <p className="text-2xl font-mono font-bold text-foreground">
            <NumberTicker value={value} />
          </p>
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
// OPTIMISED: uses limit:50 so Convex deduplicates this subscription with
// RevenueSignalsWidget and DailyBriefingWidget — one network round-trip total.
const SkillFeedWidget = memo(function SkillFeedWidget({
  compact,
}: {
  compact: boolean;
}) {
  const allOutputs = useQuery(api.skills.getOutputs, { limit: 50 });
  const outputs = (allOutputs ?? []).slice(0, compact ? 4 : 8);

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

// OPTIMISED: same limit:50 args as SkillFeedWidget — Convex deduplicates to
// a single shared subscription. Revenue filtering is done client-side.
const RevenueSignalsWidget = memo(function RevenueSignalsWidget() {
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });
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

  // Fetch latest briefing from shared outputs subscription (same args as
  // SkillFeedWidget + RevenueSignalsWidget → single Convex dedup'd subscription).
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });
  const briefing = ((outputs as any[]) ?? []).find(
    (o: any) => o.skillSlug === "daily_briefing"
  ) ?? null;
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

// OPTIMISED: same { sortBy: "health" } args as WorkspaceClientPanel,
// WorkspaceSentimentPanel, and ClientHealthWidget → single dedup'd subscription.
// This widget sorts client-side by sentimentTrend anyway.
const SentimentChartWidget = memo(function SentimentChartWidget({
  compact,
}: {
  compact?: boolean;
}) {
  const clients = useQuery(api.clients.getByUser, { sortBy: "health" });
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
// Shows 3 counts: overdue | due today | due this week.
// OPTIMISED: single getPending subscription instead of 3 separate queries.
// Day/week filtering is done client-side from the already-fetched pending list.
const DeadlineTickerWidget = memo(function DeadlineTickerWidget() {
  const { start: dayStart, end: dayEnd }   = useMemo(() => getDayBounds(),  []);
  const { start: weekStart, end: weekEnd } = useMemo(() => getWeekBounds(), []);

  // One subscription instead of three — all filtering is in-memory
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
              <span className={`text-xl font-mono font-bold ${color}`}>
                <NumberTicker value={value} />
              </span>
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
    <div className="surface-raised rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
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
      <div className="grid gap-1.5 grid-cols-7 mt-1 flex-1 overflow-hidden">
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

// ============================================
// ANIMATED INSIGHTS WIDGET
// Auto-cycling filter tabs with progress bar + animated content swap
// ============================================

const INSIGHTS_TABS = [
  { id: "all",      label: "All",      filter: null       },
  { id: "critical", label: "Critical", filter: "critical" },
  { id: "warning",  label: "Warning",  filter: "warning"  },
  { id: "info",     label: "Info",     filter: "info"     },
] as const;

const INSIGHTS_AUTO_MS = 5000;
const EASE_QUINT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// OPTIMISED: same limit:50 args → deduplicated with all other getOutputs callers
const AnimatedInsightsWidget = memo(function AnimatedInsightsWidget() {
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState(1);
  const activeTab = INSIGHTS_TABS[activeIdx];

  useEffect(() => {
    const step = 50;
    const steps = INSIGHTS_AUTO_MS / step;
    let tick = 0;
    const id = setInterval(() => {
      tick++;
      setProgress(Math.min(tick / steps, 1));
      if (tick >= steps) {
        clearInterval(id);
        setDirection(1);
        setActiveIdx((prev) => (prev + 1) % INSIGHTS_TABS.length);
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
    <div className="surface-raised rounded-xl h-full flex overflow-hidden">
      {/* Tab column */}
      <div className="w-20 border-r border-border/30 flex flex-col p-2 gap-1 shrink-0 bg-muted/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2 mb-1">Filter</p>
        {INSIGHTS_TABS.map((tab, idx) => {
          const isActive = activeIdx === idx;
          return (
            <button
              key={tab.id}
              onClick={() => selectTab(idx)}
              className={`relative flex flex-col items-start px-2 py-2 rounded-lg text-left transition-colors overflow-hidden ${
                isActive
                  ? "bg-background border border-border/40 text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              <span className="text-xs font-medium relative z-10">{tab.label}</span>
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 h-0.5 bg-primary/60 rounded-full transition-none"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
            </button>
          );
        })}
        <Link href="/skills" className="mt-auto text-[9px] text-primary/70 hover:text-primary px-2 font-medium transition-colors">
          View all →
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 px-3 pt-3 pb-1 z-10 bg-gradient-to-b from-background/80 to-transparent">
          <span className="text-xs font-display font-semibold text-foreground">AI Insights</span>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeTab.id}
            initial={{ opacity: 0, y: direction > 0 ? 14 : -14, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: direction > 0 ? -14 : 14, filter: "blur(3px)" }}
            transition={{ duration: 0.3, ease: EASE_QUINT }}
            className="absolute inset-0 overflow-y-auto px-3 pb-3 pt-9 scrollbar-thin space-y-1.5"
          >
            {!outputs ? (
              <div className="flex items-center justify-center h-20 gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">
                No {activeTab.label.toLowerCase()} insights
              </div>
            ) : (
              filtered.slice(0, 8).map((o: any, i: number) => (
                <motion.div
                  key={o._id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                  className={`p-2.5 rounded-xl border transition-colors ${
                    !o.isRead ? "border-primary/20 bg-primary/5" : "border-border/20"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      o.severity === "critical" ? "bg-urgent" : o.severity === "warning" ? "bg-warning" : "bg-primary"
                    }`} />
                    <span className="text-[11px] font-medium text-foreground truncate flex-1">{o.title}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${
                      o.severity === "critical"
                        ? "bg-urgent/10 text-urgent"
                        : o.severity === "warning"
                          ? "bg-warning/10 text-warning"
                          : "bg-primary/10 text-primary"
                    }`}>{o.severity ?? "info"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3 mt-0.5">{o.content}</p>
                </motion.div>
              ))
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/70 to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
});
