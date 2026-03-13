"use client";

import { useState, memo, useMemo, useRef, useEffect, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  LayoutGroup,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Inbox,
  Bell,
  Users,
  Zap,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Plus,
  X,
  Settings2,
  ChevronRight,
  ChevronLeft,
  Search,
  LayoutGrid,
  Heart,
  CheckSquare,
  Loader2,
  CalendarDays,
  GripVertical,
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
import { getMonthBounds } from "@/lib/date-utils";
import { Input } from "@/components/ui/input";
import { GlassCalendar } from "@/components/ui/glass-calendar";
import { GlassDateStrip } from "@/components/dashboard/glass-date-strip";
import { isSameDay } from "date-fns";

// ─── useMeasure hook (inline, no extra dep) ───────────────────────────────────
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
    // Measure immediately
    setBounds({ width: el.offsetWidth, height: el.offsetHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, bounds] as const;
}

// ─── Spring config ────────────────────────────────────────────────────────────
const SPRING = { type: "spring" as const, stiffness: 200, damping: 22, mass: 0.8 };
const SPRING_FAST = { type: "spring" as const, stiffness: 400, damping: 35, mass: 0.5 };
const EASE_OUT_QUINT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// ─── NumberTicker — count-up animation ───────────────────────────────────────
function NumberTicker({ value, className }: { value: number; className?: string }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 120, damping: 20, mass: 0.5 });
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  return <motion.span className={className}>{display}</motion.span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DYNAMIC TOOLBAR  (adapted from uselayouts Dynamic Toolbar)
// ─────────────────────────────────────────────────────────────────────────────
interface ToolbarProps {
  editing: boolean;
  onToggleEdit: () => void;
  onAddWidget: (type: string) => void;
  widgetRegistry: { type: string; name: string; icon: React.ReactNode }[];
}

function WorkspaceDynamicToolbar({
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

      {/* Dynamic Toolbar */}
      <div className="relative">
        <motion.div
          className="relative h-11 rounded-full bg-card border border-border overflow-hidden shadow-sm flex items-center"
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
                <span>Workspace</span>
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
                className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Widget
              </button>
              <button
                onClick={() => { onToggleEdit(); setIsExpanded(false); setShowPicker(false); }}
                className={`flex items-center gap-1.5 h-8 px-3  rounded-full text-xs font-medium transition-colors ${
                  editing
                    ? "bg-success text-white hover:bg-success/90"
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
              className="absolute right-0 top-14 z-50 bg-card border border-border rounded-2xl shadow-xl p-3 w-64"
            >
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Add Widget
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {widgetRegistry.map((w) => (
                  <button
                    key={w.type}
                    onClick={() => { onAddWidget(w.type); setShowPicker(false); setIsExpanded(false); }}
                    className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-accent transition-colors text-left"
                  >
                    <span className="text-primary shrink-0">{w.icon}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. WIRE BENTO HUB  (adapted from uselayouts Bento Card)
//    — "Browser preview" card with animated sidebar tabs + real Wire data
// ─────────────────────────────────────────────────────────────────────────────
const HUB_TABS = [
  { id: "inbox",   label: "Inbox",   icon: Inbox },
  { id: "clients", label: "Clients", icon: Users },
  { id: "skills",  label: "Skills",  icon: Bell },
  { id: "actions", label: "Actions", icon: CheckSquare },
];

function WireBentoHub() {
  const [activeTab, setActiveTab] = useState("inbox");

  const urgentMessages = useQuery(api.messages.getUrgent);
  const clients        = useQuery(api.clients.getByUser, { sortBy: "health" });
  const skillOutputs   = useQuery(api.skills.getOutputs, { limit: 50 });
  const commitments    = useQuery(api.commitments.getPendingWithClients);

  const activeLabel = HUB_TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <div className="surface-raised rounded-2xl h-full overflow-hidden flex flex-col shadow-sm">

      {/* ── Browser chrome ── */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3 bg-muted/30 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-border/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-border/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-border/60" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px] text-muted-foreground/60 font-medium">
            Wire Intelligence Hub · {activeLabel}
          </span>
        </div>
      </div>

      {/* ── Sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <LayoutGroup>
          <nav className="w-28 border-r border-border/30 p-2 flex flex-col gap-0.5 bg-muted/5 shrink-0">
            {HUB_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <>
                      <motion.div
                        layoutId="hub-tab-bg"
                        className="absolute inset-0 rounded-lg bg-background border border-border/40"
                        transition={SPRING_FAST}
                      />
                      <motion.div
                        layoutId="hub-tab-bar"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary"
                        transition={SPRING_FAST}
                      />
                    </>
                  )}
                  <tab.icon className="h-3.5 w-3.5 relative z-10 shrink-0" />
                  <span className="truncate relative z-10 font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </LayoutGroup>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.28, ease: EASE_OUT_QUINT }}
              className="absolute inset-0 overflow-y-auto p-3 scrollbar-thin"
            >
              {activeTab === "inbox"   && <HubInboxTab data={urgentMessages} />}
              {activeTab === "clients" && <HubClientsTab data={clients} />}
              {activeTab === "skills"  && <HubSkillsTab data={skillOutputs} />}
              {activeTab === "actions" && <HubActionsTab data={commitments} />}
            </motion.div>
          </AnimatePresence>
          {/* Fade */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/60 to-transparent pointer-events-none z-10" />
        </div>
      </div>
    </div>
  );
}

// Hub tab sub-components
function HubInboxTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No urgent messages" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 6).map((msg: any) => (
        <Link
          key={msg._id}
          href={`/clients/${msg.clientId}`}
          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
        >
          <div className={`w-1 h-7 rounded-full shrink-0 mt-0.5 ${
            (msg.aiMetadata?.priorityScore ?? 0) >= 80 ? "bg-urgent" : "bg-primary"
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-foreground truncate">
                {msg.clientName ?? "Unknown"}
              </span>
              {msg.aiMetadata?.priorityScore && (
                <span className="text-[9px] font-mono font-bold text-urgent shrink-0">
                  P{msg.aiMetadata.priorityScore}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{msg.text}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function HubClientsTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No clients yet" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 6).map((c: any) => {
        const h = c.relationshipHealth ?? 50;
        const color = h >= 70 ? "bg-success" : h >= 40 ? "bg-warning" : "bg-urgent";
        return (
          <Link key={c._id} href={`/clients/${c._id}`}
            className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
              h >= 70 ? "bg-success/10 text-success" : h >= 40 ? "bg-warning/10 text-warning" : "bg-urgent/10 text-urgent"
            }`}>
              {c.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium text-foreground truncate block">{c.name}</span>
              <div className="w-16 h-1 rounded-full bg-border/30 mt-0.5">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${h}%` }} />
              </div>
            </div>
            <span className={`text-[9px] font-mono font-bold shrink-0 ${
              h >= 70 ? "text-success" : h >= 40 ? "text-warning" : "text-urgent"
            }`}>{h}</span>
          </Link>
        );
      })}
    </div>
  );
}

function HubSkillsTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No insights yet" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 7).map((o: any) => (
        <div key={o._id} className={`p-2 rounded-lg border transition-colors ${
          !o.isRead ? "border-primary/20 bg-primary/5" : "border-border/20"
        }`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              o.severity === "critical" ? "bg-urgent" : o.severity === "warning" ? "bg-warning" : "bg-primary"
            }`} />
            <span className="text-[11px] font-medium text-foreground truncate">{o.title}</span>
          </div>
          <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3">{o.content}</p>
        </div>
      ))}
    </div>
  );
}

function HubActionsTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No pending actions" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 7).map((c: any) => (
        <Link key={c._id} href={`/clients/${c.clientId}`}
          className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
        >
          <div className={`w-3.5 h-3.5 rounded border shrink-0 mt-0.5 ${
            c.isOverdue ? "border-urgent" : "border-border"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-foreground/80 line-clamp-1 group-hover:text-foreground">
              {c.text}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-muted-foreground truncate">{c.clientName}</span>
              {c.isOverdue && (
                <span className="text-[9px] font-bold text-urgent">overdue</span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="flex items-center justify-center h-20 gap-2 text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="text-xs">Loading…</span>
    </div>
  );
}
function HubEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">{label}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. STACKED CLIENT LIST  (adapted from uselayouts Stacked List)
//    — Healthy clients in the main area; expandable bottom drawer for all
// ─────────────────────────────────────────────────────────────────────────────
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
    <div className="surface-raised rounded-2xl h-full flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="p-4 pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
            Client Health
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-normal">
              {healthyClients.length} healthy
            </span>
          </h3>
          <Link href="/clients" className="text-[10px] text-primary hover:text-primary/80 font-medium">
            View all
          </Link>
        </div>
      </div>

      {/* Healthy clients list */}
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
                    className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0 hover:bg-accent/30 -mx-1 px-1 rounded-lg transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center text-[11px] font-bold text-success shrink-0">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate block">{c.name}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-14 h-1.5 rounded-full bg-border/30">
                          <div className="h-full rounded-full bg-success" style={{ width: `${h}%` }} />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-success">{h}</span>
                      </div>
                    </div>
                    {trend === "improving" && <TrendingUp className="h-3.5 w-3.5 text-success shrink-0" />}
                    {trend === "declining" && <TrendingDown className="h-3.5 w-3.5 text-urgent shrink-0" />}
                    {(!trend || trend === "stable") && <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            No clients yet
          </div>
        )}
      </div>

      {/* ── Bottom Drawer (Stacked List pattern) ── */}
      <motion.div
        layout
        initial={false}
        animate={{
          height: isExpanded ? "calc(100% - 12px)" : "56px",
          width: isExpanded ? "calc(100% - 12px)" : "calc(100% - 24px)",
          bottom: isExpanded ? "6px" : "12px",
          left: isExpanded ? "6px" : "12px",
          borderRadius: isExpanded ? "16px" : "14px",
        }}
        transition={{ type: "spring", stiffness: 240, damping: 30, mass: 0.8 }}
        className="absolute z-20 bg-card border border-border shadow-md flex flex-col overflow-hidden"
        style={{ cursor: isExpanded ? "default" : "pointer" }}
        onClick={() => !isExpanded && setIsExpanded(true)}
      >
        {/* Drawer header */}
        <div
          className={`flex items-center justify-between px-3 h-14 shrink-0 transition-colors ${
            isExpanded ? "border-b border-border/40" : "hover:bg-muted/20"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center text-muted-foreground shadow-sm">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground leading-none">All Clients</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                {clients?.length ?? "…"} registered
              </p>
            </div>
          </div>
          {!isExpanded && clients && clients.length > 0 && (
            <div className="flex -space-x-2.5">
              {clients.slice(0, 3).map((c: any) => (
                <div
                  key={c._id}
                  className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] font-bold text-foreground shadow-sm"
                >
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
              ))}
              {clients.length > 3 && (
                <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] text-muted-foreground shadow-sm">
                  +{clients.length - 3}
                </div>
              )}
            </div>
          )}
          {isExpanded && (
            <button
              className="h-8 w-8 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); setSearchQuery(""); }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Drawer content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              {/* Search */}
              <div className="px-4 py-3 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    placeholder="Search clients…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-9 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-border rounded-xl text-sm placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>

              {/* Client list */}
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
                          className="flex items-center gap-3 py-3 border-b border-border/30 last:border-0"
                          onClick={() => setIsExpanded(false)}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0 ${bg} ${color}`}>
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate block">{c.name}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="w-12 h-1 rounded-full bg-border/30">
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

// ─────────────────────────────────────────────────────────────────────────────
// 4. SUPPORTING WIDGETS
// ─────────────────────────────────────────────────────────────────────────────

const STAT_META: Record<string, { label: string; icon: React.ReactNode; color: string; key: string }> = {
  unread:  { label: "Unread",         icon: <Inbox className="h-5 w-5" />,         color: "bg-primary/10 text-primary",  key: "unreadCount" },
  urgent:  { label: "Urgent",         icon: <AlertTriangle className="h-5 w-5" />, color: "bg-urgent/10 text-urgent",    key: "urgentCount" },
  actions: { label: "Action Items",   icon: <Zap className="h-5 w-5" />,           color: "bg-warning/10 text-warning",  key: "actionItemCount" },
  clients: { label: "Active Clients", icon: <Users className="h-5 w-5" />,         color: "bg-success/10 text-success",  key: "activeClientCount" },
};

const StatCardWidget = memo(function StatCardWidget({ metric }: { metric: string }) {
  const stats = useQuery(api.analytics.getDailyStats);
  const cfg = STAT_META[metric] ?? STAT_META.unread;
  const value = (stats as any)?.[cfg.key] ?? 0;

  return (
    <div className="surface-raised rounded-2xl h-full p-5 flex flex-col justify-center">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${cfg.color}`}>
        {cfg.icon}
      </div>
      <motion.p
        key={value}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-2xl font-mono font-bold text-foreground"
      >
        {value}
      </motion.p>
      <p className="text-xs text-muted-foreground mt-0.5">{cfg.label}</p>
    </div>
  );
});

// ─── Combined Stats Overview ──────────────────────────────────────────────────
const STATS_GRID = [
  { label: "Unread",   key: "unreadCount",      icon: Inbox,          bg: "bg-primary/10",  fg: "text-primary",  num: "text-primary" },
  { label: "Urgent",   key: "urgentCount",       icon: AlertTriangle,  bg: "bg-urgent/10",   fg: "text-urgent",   num: "text-urgent" },
  { label: "Actions",  key: "actionItemCount",   icon: Zap,            bg: "bg-warning/10",  fg: "text-warning",  num: "text-warning" },
  { label: "Clients",  key: "activeClientCount", icon: Users,          bg: "bg-success/10",  fg: "text-success",  num: "text-success" },
] as const;

const StatsOverviewWidget = memo(function StatsOverviewWidget() {
  const stats = useQuery(api.analytics.getDailyStats);

  return (
    <div className="surface-raised rounded-2xl h-full p-4 grid grid-cols-2 grid-rows-2 gap-3">
      {STATS_GRID.map((m) => {
        const value = (stats as any)?.[m.key] ?? 0;
        const Icon = m.icon;
        return (
          <div key={m.label} className="flex flex-col justify-between p-3 rounded-xl bg-background/40 border border-border/30">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.bg}`}>
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

// ─────────────────────────────────────────────────────────────────────────────
// 5. VERTICAL SKILLS WIDGET  (adapted from uselayouts Vertical Tabs)
//    — Auto-cycling filter tabs with progress bar + animated content swap
// ─────────────────────────────────────────────────────────────────────────────
const SKILL_TABS = [
  { id: "all",      label: "All",      filter: null       },
  { id: "critical", label: "Critical", filter: "critical" },
  { id: "warning",  label: "Warning",  filter: "warning"  },
  { id: "info",     label: "Info",     filter: "info"     },
] as const;

const AUTO_PLAY_MS = 5000;

const VerticalSkillsWidget = memo(function VerticalSkillsWidget() {
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState(1);
  const activeTab = SKILL_TABS[activeIdx];

  // Auto-cycle with progress fill
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
    <div className="surface-raised rounded-2xl h-full flex overflow-hidden">
      {/* ── Left: tab column ── */}
      <div className="w-24 border-r border-border/30 flex flex-col p-2 gap-1 shrink-0 bg-muted/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2 mb-1">
          Filter
        </p>
        {SKILL_TABS.map((tab, idx) => {
          const isActive = activeIdx === idx;
          return (
            <button
              key={tab.id}
              onClick={() => selectTab(idx)}
              className={`relative flex flex-col items-start px-2 py-2.5 rounded-lg text-left transition-colors overflow-hidden ${
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
        <Link
          href="/skills"
          className="mt-auto text-[9px] text-primary/70 hover:text-primary px-2 font-medium transition-colors"
        >
          View all →
        </Link>
      </div>

      {/* ── Right: content ── */}
      <div className="flex-1 overflow-hidden relative">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 px-3 pt-3 pb-1 z-10 bg-gradient-to-b from-background/80 to-transparent">
          <span className="text-xs font-display font-semibold text-foreground">AI Insights</span>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeTab.id}
            initial={{ opacity: 0, y: direction > 0 ? 14 : -14, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: direction > 0 ? -14 : 14, filter: "blur(3px)" }}
            transition={{ duration: 0.3, ease: EASE_OUT_QUINT }}
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

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/70 to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ANIMATED SIGNAL FEED  (inspired by MagicUI Animated List)
//    — Items push in from top with spring physics + severity badges
// ─────────────────────────────────────────────────────────────────────────────
const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  deal:        { bg: "bg-success/10",  text: "text-success",          label: "Deal",     dot: "bg-success" },
  expansion:   { bg: "bg-primary/10",  text: "text-primary",          label: "Upsell",   dot: "bg-primary" },
  contraction: { bg: "bg-urgent/10",   text: "text-urgent",           label: "Risk",     dot: "bg-urgent" },
  critical:    { bg: "bg-urgent/10",   text: "text-urgent",           label: "Critical", dot: "bg-urgent" },
  warning:     { bg: "bg-warning/10",  text: "text-warning",          label: "Warning",  dot: "bg-warning" },
  info:        { bg: "bg-primary/10",  text: "text-primary",          label: "Info",     dot: "bg-primary" },
  neutral:     { bg: "bg-muted",       text: "text-muted-foreground", label: "Signal",   dot: "bg-muted-foreground/60" },
};

const AnimatedSignalFeed = memo(function AnimatedSignalFeed() {
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });

  const displayItems = useMemo(() => {
    const list = (outputs ?? []) as any[];
    const revenue = list.filter((o) => o.skillSlug === "revenue_radar");
    return revenue.length > 0 ? revenue : list;
  }, [outputs]);

  return (
    <div className="surface-raised rounded-2xl h-full p-4 flex flex-col overflow-hidden">
      {/* Header */}
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

      {/* Feed */}
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
            className="space-y-1.5 overflow-y-auto h-full scrollbar-thin"
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
                    className="flex items-start gap-2.5 p-2.5 rounded-xl border border-border/20 hover:bg-accent/50 transition-colors group"
                  >
                    <span className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-medium text-foreground truncate flex-1">
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
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/70 to-transparent pointer-events-none z-10" />
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET REGISTRY for toolbar picker
// ─────────────────────────────────────────────────────────────────────────────
const WIDGET_REGISTRY = [
  { type: "hub",      name: "Intelligence Hub", icon: <LayoutGrid className="h-4 w-4" /> },
  { type: "clients",  name: "Client Health",    icon: <Heart className="h-4 w-4" /> },
  { type: "calendar", name: "Calendar",         icon: <CalendarDays className="h-4 w-4" /> },
  { type: "stats",    name: "Stats Overview",   icon: <Zap className="h-4 w-4" /> },
  { type: "skills",   name: "AI Insights",      icon: <Bell className="h-4 w-4" /> },
  { type: "revenue",  name: "Revenue",          icon: <DollarSign className="h-4 w-4" /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function WidgetRenderer({ type }: { type: string }) {
  switch (type) {
    case "hub":      return <WireBentoHub />;
    case "clients":  return <StackedClientListWidget />;
    case "calendar": return <CalendarWidget />;
    case "stats":    return <StatsOverviewWidget />;
    case "skills":   return <VerticalSkillsWidget />;
    case "revenue":  return <AnimatedSignalFeed />;
    // legacy single-stat fallbacks
    case "unread":   return <StatCardWidget metric="unread" />;
    case "urgent":   return <StatCardWidget metric="urgent" />;
    case "actions":  return <StatCardWidget metric="actions" />;
    case "clientsc": return <StatCardWidget metric="clients" />;
    default:         return (
      <div className="surface-raised rounded-2xl h-full flex items-center justify-center text-muted-foreground text-xs">
        {type}
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR WIDGET  — GlassCalendar wired to Wire commitment data
// ─────────────────────────────────────────────────────────────────────────────
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
    <div className="h-full overflow-hidden flex flex-col gap-2">
      <GlassCalendar
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        markedDates={markedDates}
        hideFooter={selectedItems.length > 0}
        className="max-w-none rounded-2xl"
      />
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-1 overflow-hidden"
          >
            {selectedItems.slice(0, 3).map((c: any) => (
              <Link
                key={c._id}
                href={`/clients/${c.clientId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/60 backdrop-blur-sm border border-white/5 hover:bg-card/80 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  c.commitmentType === "deadline" ? "bg-rose-400"
                  : c.commitmentType === "payment" ? "bg-emerald-400"
                  : "bg-blue-400"
                }`} />
                <span className="text-xs text-foreground truncate flex-1">{c.text}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{c.clientName}</span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIZE CLASSES
// ─────────────────────────────────────────────────────────────────────────────
const SIZE_CLS: Record<string, string> = {
  "1x1": "col-span-1 row-span-1",
  "2x1": "col-span-2 row-span-1",
  "1x2": "col-span-1 row-span-2",
  "2x2": "col-span-2 row-span-2",
};

// Default layout
const DEFAULT_WIDGETS = [
  { id: "hub-default",      type: "hub",      size: "2x2" },
  { id: "stats-default",    type: "stats",    size: "2x2" },
  { id: "clients-default",  type: "clients",  size: "2x2" },
  { id: "calendar-default", type: "calendar", size: "2x2" },
  { id: "skills-default",   type: "skills",   size: "2x2" },
  { id: "revenue-default",  type: "revenue",  size: "2x2" },
];

// ─────────────────────────────────────────────────────────────────────────────
// BENTO THREE-COLUMN SIDE PANELS
// ─────────────────────────────────────────────────────────────────────────────

function BentoLeftPanel() {
  const clients = useQuery(api.clients.getByUser, { sortBy: "health" });
  return (
    <div className="surface-raised rounded-2xl p-3 flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-foreground">Client Health</span>
        <Link href="/clients" className="text-[10px] text-primary hover:text-primary/80 font-medium">View all</Link>
      </div>
      <div className="overflow-y-auto scrollbar-thin space-y-1 flex-1">
        {(clients ?? []).slice(0, 12).map((c: any) => {
          const h = c.relationshipHealth ?? 50;
          const color = h >= 70 ? "text-success" : h >= 40 ? "text-warning" : "text-urgent";
          const bg   = h >= 70 ? "bg-success/10" : h >= 40 ? "bg-warning/10" : "bg-urgent/10";
          const trend = c.intelligence?.sentimentTrend;
          return (
            <Link key={c._id} href={`/clients/${c._id}`}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${bg} ${color}`}>
                {c.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-foreground truncate">{c.name}</p>
                <div className="w-full h-0.5 rounded-full bg-border/30 mt-0.5">
                  <div className={`h-full rounded-full ${h >= 70 ? "bg-success" : h >= 40 ? "bg-warning" : "bg-urgent"}`} style={{ width: `${h}%` }} />
                </div>
              </div>
              {trend === "improving" && <TrendingUp className="h-3 w-3 text-success shrink-0" />}
              {trend === "declining" && <TrendingDown className="h-3 w-3 text-urgent shrink-0" />}
              {(!trend || trend === "stable") && <Minus className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function BentoRightPanel() {
  const stats = useQuery(api.analytics.getDailyStats);
  const outputs = useQuery(api.skills.getOutputs, { limit: 50 });
  const METRICS = [
    { label: "Unread",  key: "unreadCount",      color: "text-primary", bg: "bg-primary/10", icon: Inbox },
    { label: "Urgent",  key: "urgentCount",       color: "text-urgent",  bg: "bg-urgent/10",  icon: AlertTriangle },
    { label: "Actions", key: "actionItemCount",   color: "text-warning", bg: "bg-warning/10", icon: Zap },
    { label: "Clients", key: "activeClientCount", color: "text-success", bg: "bg-success/10", icon: Users },
  ] as const;

  return (
    <>
      {/* Stats 2x2 */}
      <div className="surface-raised rounded-2xl p-3 grid grid-cols-2 gap-2 shrink-0">
        {METRICS.map(({ label, key, color, bg, icon: Icon }) => (
          <div key={label} className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-background/40 border border-border/20">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </div>
            <p className={`text-xl font-mono font-bold leading-none ${color}`}>{(stats as any)?.[key] ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Skill insights */}
      <div className="surface-raised rounded-2xl p-3 flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-foreground">AI Insights</span>
          <Link href="/skills" className="text-[10px] text-primary hover:text-primary/80 font-medium">View all</Link>
        </div>
        <div className="overflow-y-auto scrollbar-thin space-y-1.5 flex-1">
          {outputs && outputs.length > 0 ? outputs.map((o: any) => (
            <div key={o._id} className={`p-2 rounded-lg border transition-colors ${!o.isRead ? "border-primary/20 bg-primary/5" : "border-border/20"}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${o.severity === "critical" ? "bg-urgent" : o.severity === "warning" ? "bg-warning" : "bg-primary"}`} />
                <span className="text-[11px] font-medium text-foreground truncate">{o.title}</span>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3">{o.content}</p>
            </div>
          )) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">No insights yet</div>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SORTABLE BENTO WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function SortableBentoWidget({
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
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={onRemove}
            className="absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full bg-urgent text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          >
            <X className="h-3 w-3" />
          </motion.button>
        </>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BENTO PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function BentoPage() {
  const [editing, setEditing] = useState(false);
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);

  // DnD sensors — 8px distance prevents accidental drags on widget interactions
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleAddWidget = useCallback((type: string) => {
    const id = `${type}-${Date.now()}`;
    // All main widgets get 2x2
    const size = ["hub", "clients", "calendar", "stats", "skills", "revenue"].includes(type) ? "2x2" : "2x1";
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
    <div className="h-full flex flex-col animate-fade-in overflow-hidden">

      {/* ── Top: Date strip + toolbar (full width) ── */}
      <div className="px-5 pt-5 shrink-0 flex">
        
        <GlassDateStrip />
        <WorkspaceDynamicToolbar
          editing={editing}
          onToggleEdit={() => setEditing((e) => !e)}
          onAddWidget={handleAddWidget}
          widgetRegistry={WIDGET_REGISTRY}
        />
      </div>

      {/* ── Three-column body ── */}
      <div className="flex-1 flex gap-4 px-5 pb-4 min-h-0 overflow-hidden">

        {/* Left panel */}
        <div className="w-[220px] shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
          <BentoLeftPanel />
        </div>

        {/* Center — bento grid */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
          {widgets.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-4 gap-4 auto-rows-[180px]">
                  {widgets.map((w) => (
                    <SortableBentoWidget
                      key={w.id}
                      id={w.id}
                      className={SIZE_CLS[w.size] ?? "col-span-1 row-span-1"}
                      editing={editing}
                      onRemove={() => handleRemove(w.id)}
                    >
                      <WidgetRenderer type={w.type} />
                    </SortableBentoWidget>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              <LayoutGrid className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Workspace is empty</p>
              <p className="text-xs mt-1">Open the toolbar to add widgets</p>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-[220px] shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-thin">
          <BentoRightPanel />
        </div>

      </div>
    </div>
  );
}
