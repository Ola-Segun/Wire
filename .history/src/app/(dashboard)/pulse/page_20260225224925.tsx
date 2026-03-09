"use client";

import { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AnimatePresence, motion } from "framer-motion";
import SmartSearch from "@/components/dashboard/smart-search";
import ThemeToggle from "@/components/dashboard/theme-toggle";
import DailyDigestView from "@/components/dashboard/daily-digest";
import RelationshipTimeline from "@/components/dashboard/relationship-timeline";
import { ReplyComposer } from "@/components/dashboard/reply-composer";
import { healthColor, healthBg } from "@/lib/helpers";
import { formatRelativeTime } from "@/lib/date-utils";
import {
  Inbox,
  Newspaper,
  Activity,
  Menu,
  ArrowLeft,
  Zap,
  Mail,
  Hash,
  MessageSquare,
  Phone,
  CheckCircle2,
  Sparkles,
  X,
  Star,
  AlertTriangle,
  Clock,
  Send,
  Copy,
  ArrowRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────
type View = "inbox" | "digest" | "timeline";
type HealthStatus = "healthy" | "attention" | "at-risk";

// ─── Helpers ──────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2);
}

function getHealthStatus(score: number): HealthStatus {
  if (score >= 70) return "healthy";
  if (score >= 40) return "attention";
  return "at-risk";
}

function getPlatformIcon(platform: string) {
  switch (platform) {
    case "gmail":
    case "email":
      return Mail;
    case "slack":
      return Hash;
    case "teams":
      return MessageSquare;
    case "whatsapp":
      return Phone;
    default:
      return Mail;
  }
}

function getPriorityOrder(score: number | undefined): number {
  if (!score) return 3;
  if (score >= 80) return 0; // critical
  if (score >= 60) return 1; // high
  if (score >= 40) return 2; // medium
  return 3; // low
}

function getPriorityLabel(score: number | undefined): string {
  if (!score) return "low";
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function getPriorityBarColor(score: number | undefined): string {
  if (!score) return "bg-border";
  if (score >= 80) return "bg-urgent";
  if (score >= 60) return "bg-primary";
  if (score >= 40) return "bg-muted-foreground";
  return "bg-border";
}

function getSentimentLabel(sentiment: string | undefined) {
  switch (sentiment?.toLowerCase()) {
    case "positive":
    case "satisfied":
      return { text: "Positive", className: "bg-success/10 text-success" };
    case "negative":
    case "frustrated":
    case "angry":
      return { text: "Frustrated", className: "bg-urgent/10 text-urgent" };
    default:
      return { text: "Neutral", className: "bg-muted text-muted-foreground" };
  }
}

// ─── Main Component ───────────────────────────────────────────────────
export default function PulsePage() {
  const { user } = useCurrentUser();
  const clients = useQuery(api.clients.getByUser, { sortBy: "recent" });
  const allMessages = useQuery(api.messages.getAll, { limit: 100 });

  const markAsRead = useMutation(api.messages.markAsRead);
  const toggleStar = useMutation(api.messages.toggleStar);

  // ─── State ──────────────────────────────────────────────────────────
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentView, setCurrentView] = useState<View>("inbox");
  const [showSidebar, setShowSidebar] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [showDraft, setShowDraft] = useState(false);
  const [showReplyComposer, setShowReplyComposer] = useState(false);

  // ─── Derived data ───────────────────────────────────────────────────
  const filteredMessages = useMemo(() => {
    if (!allMessages) return [];
    let filtered = [...(allMessages?.messages ?? [])];

    // Filter by selected client
    if (selectedClientId) {
      filtered = filtered.filter((m: any) => m.clientId === selectedClientId);
    }

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m: any) =>
          m.text?.toLowerCase().includes(q) ||
          m.clientName?.toLowerCase().includes(q) ||
          m.aiMetadata?.topics?.some((t: string) => t.toLowerCase().includes(q))
      );
    }

    // Sort by priority (high first)
    filtered.sort(
      (a: any, b: any) =>
        getPriorityOrder(b.aiMetadata?.priorityScore) -
        getPriorityOrder(a.aiMetadata?.priorityScore)
    );

    return filtered;
  }, [allMessages, selectedClientId, searchQuery]);

  const selectedMessage = useMemo(
    () => (selectedMessageId ? filteredMessages.find((m: any) => m._id === selectedMessageId) : null),
    [selectedMessageId, filteredMessages]
  );

  const selectedClient = useMemo(
    () => (selectedMessage && clients ? clients.find((c: any) => c._id === selectedMessage.clientId) : null),
    [selectedMessage, clients]
  );

  const unreadCount = (allMessages?.messages ?? []).filter((m: any) => !m.isRead).length ?? 0;

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleSelectMessage = useCallback(
    async (id: string) => {
      setSelectedMessageId(id);
      setShowThread(true);
      setCheckedItems(new Set());
      setShowDraft(false);
      setShowReplyComposer(false);

      // Mark as read
      const msg = (allMessages?.messages ?? []).find((m: any) => m._id === id);
      if (msg && !msg.isRead) {
        try {
          await markAsRead({ id: msg._id });
        } catch {
          // ignore
        }
      }
    },
    [allMessages, markAsRead]
  );

  const handleCloseThread = useCallback(() => {
    setSelectedMessageId(null);
    setShowThread(false);
    setShowReplyComposer(false);
  }, []);

  const handleSelectClient = useCallback((id: string | null) => {
    setSelectedClientId(id);
    setShowSidebar(false);
    setSelectedMessageId(null);
    setShowThread(false);
  }, []);

  const handleToggleStar = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      try {
        await toggleStar({ id: id as any });
      } catch {
        // ignore
      }
    },
    [toggleStar]
  );

  const toggleActionItem = useCallback((i: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }, []);

  // ─── Nav items ──────────────────────────────────────────────────────
  const navItems: { view: View; icon: typeof Inbox; label: string; badge?: number }[] = [
    { view: "inbox", icon: Inbox, label: "Inbox", badge: unreadCount || undefined },
    { view: "digest", icon: Newspaper, label: "Digest" },
    { view: "timeline", icon: Activity, label: "Timeline" },
  ];

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-background overflow-hidden">
      {/* ═══ Mobile sidebar overlay ═══ */}
      {showSidebar &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setShowSidebar(false)}
          />,
          document.body
        )}

      {/* ═══ Client Sidebar ═══ */}
      <div
        className={`${showSidebar ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:relative z-50 md:z-auto h-full transition-transform duration-200`}
      >
        <div className="w-64 border-r border-border bg-sidebar h-full flex flex-col shrink-0">
          {/* Sidebar header */}
          <div className="p-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <h1 className="text-sm font-display font-semibold text-gradient">
                Wire Pulse
              </h1>
            </div>
          </div>

          <div className="px-3 pb-2">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-2">
              Clients
            </p>
          </div>

          {/* Client list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-0.5">
            {/* All Messages */}
            <button
              onClick={() => handleSelectClient(null)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                !selectedClientId
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              All Messages
            </button>

            {/* Each client */}
            {clients?.map((client: any) => {
              const health = client.relationshipHealth ?? 0;
              const status = getHealthStatus(health);
              const initials = getInitials(client.name);

              return (
                <button
                  key={client._id}
                  onClick={() => handleSelectClient(client._id)}
                  className={`w-full text-left px-3 py-3 rounded-lg transition-all duration-150 group ${
                    selectedClientId === client._id
                      ? "bg-accent shadow-sm"
                      : "hover:bg-sidebar-accent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${healthBg(status)} ${healthColor(status)} ring-1 ring-inset ring-current/10`}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[13px] font-medium text-foreground truncate">
                          {client.name}
                        </span>
                        {status === "at-risk" && (
                          <AlertTriangle className="w-3 h-3 text-urgent shrink-0 animate-pulse-glow" />
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate block">
                        {client.company || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pl-[46px]">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-2.5 h-2.5" />
                      <span className="text-[10px]">
                        {client.lastContactDate
                          ? formatRelativeTime(client.lastContactDate)
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-12 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            health >= 75
                              ? "bg-success"
                              : health >= 50
                                ? "bg-warning"
                                : "bg-urgent"
                          }`}
                          style={{ width: `${health}%` }}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-mono font-bold ${healthColor(status)}`}
                      >
                        {health}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="border-b border-border px-3 sm:px-5 py-2.5 flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setShowSidebar(true)}
            className="p-2 rounded-lg hover:bg-accent transition-colors md:hidden shrink-0"
          >
            <Menu className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Tab navigation */}
          <div className="flex items-center gap-0.5 shrink-0 bg-secondary/50 rounded-xl p-1">
            {navItems.map(({ view, icon: Icon, label, badge }) => (
              <button
                key={view}
                onClick={() => {
                  setCurrentView(view);
                  setSelectedMessageId(null);
                  setShowThread(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                  currentView === view
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">{label}</span>
                {badge && badge > 0 && (
                  <span className="bg-urgent text-urgent-foreground text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-lg hidden sm:block">
            <SmartSearch onSearch={setSearchQuery} />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <ThemeToggle />
            <div className="flex items-center gap-2 text-primary">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-display font-semibold text-gradient hidden sm:inline">
                Wire AI
              </span>
            </div>
          </div>
        </div>

        {/* Mobile search */}
        <div className="px-3 py-2 border-b border-border/50 sm:hidden">
          <SmartSearch onSearch={setSearchQuery} />
        </div>

        {/* ═══ Content Area ═══ */}
        <div className="flex-1 flex min-h-0">
          <AnimatePresence mode="wait">
            {currentView === "inbox" ? (
              <motion.div
                key="inbox"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex flex-1 min-h-0"
              >
                {/* ─── Message list panel ─── */}
                <div
                  className={`${selectedMessage && showThread ? "hidden md:flex" : "flex"} ${selectedMessage ? "md:w-2/5" : "w-full"} border-r border-border flex-col transition-all duration-200`}
                >
                  <div className="px-4 py-2.5 border-b border-border/30">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                      {filteredMessages.length} messages · sorted by priority
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {filteredMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Inbox className="w-12 h-12 mb-3 text-muted-foreground/20" />
                        <p className="text-sm">No messages found</p>
                      </div>
                    ) : (
                      filteredMessages.map((msg: any, index: number) => {
                        const PlatformIcon = getPlatformIcon(msg.platform);
                        const sentiment = getSentimentLabel(msg.aiMetadata?.sentiment);
                        const priorityScore = msg.aiMetadata?.priorityScore;
                        const isSelected = selectedMessageId === msg._id;
                        const subject =
                          msg.aiMetadata?.topics?.[0] ||
                          msg.text?.slice(0, 60) ||
                          "No subject";

                        return (
                          <div
                            key={msg._id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectMessage(msg._id)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleSelectMessage(msg._id); }}
                            className={`w-full text-left px-4 py-4 border-b border-border/40 transition-all duration-150 relative group animate-slide-in cursor-pointer ${
                              isSelected
                                ? "bg-accent/80"
                                : "hover:bg-secondary/40"
                            } ${!msg.isRead ? "bg-secondary/20" : ""}`}
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            {/* Priority bar */}
                            <div
                              className={`priority-bar ${getPriorityBarColor(priorityScore)}`}
                            />

                            <div className="flex items-start gap-3 pl-2">
                              {/* Avatar */}
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                                  !msg.isRead
                                    ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                                    : "bg-secondary text-secondary-foreground"
                                }`}
                              >
                                {msg.clientName
                                  ? getInitials(msg.clientName)
                                  : "??"}
                              </div>

                              <div className="flex-1 min-w-0">
                                {/* Row 1: name + channel + urgency + time */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={`text-[13px] font-medium truncate ${!msg.isRead ? "text-foreground" : "text-secondary-foreground"}`}
                                    >
                                      {msg.clientName ?? "Unknown"}
                                    </span>
                                    <PlatformIcon className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                                    {priorityScore && priorityScore >= 80 && (
                                      <span className="flex items-center gap-0.5 text-[9px] font-mono font-bold text-urgent bg-urgent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                        <Zap className="w-2.5 h-2.5" />
                                        Urgent
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={(e) => handleToggleStar(e, msg._id)}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Star
                                        className={`w-3 h-3 ${msg.isStarred ? "fill-warning text-warning" : "text-muted-foreground"}`}
                                      />
                                    </button>
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      {msg.timestamp
                                        ? formatRelativeTime(msg.timestamp)
                                        : "—"}
                                    </span>
                                  </div>
                                </div>

                                {/* Row 2: subject */}
                                <p
                                  className={`text-sm mt-1 truncate ${!msg.isRead ? "text-foreground font-medium" : "text-secondary-foreground"}`}
                                >
                                  {subject}
                                </p>

                                {/* Row 3: preview */}
                                <p className="text-xs text-muted-foreground mt-1 truncate leading-relaxed">
                                  {msg.text?.slice(0, 120)}
                                  {(msg.text?.length ?? 0) > 120 ? "…" : ""}
                                </p>

                                {/* Row 4: badges */}
                                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${sentiment.className}`}
                                  >
                                    <span className="w-1 h-1 rounded-full bg-current" />
                                    {sentiment.text}
                                  </span>
                                  {msg.aiMetadata?.extractedActions &&
                                    msg.aiMetadata.extractedActions.length > 0 && (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/8 px-2 py-0.5 rounded-full font-medium">
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                        Action items
                                      </span>
                                    )}
                                  {msg.aiMetadata?.suggestedReply && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-primary/60 font-mono">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      AI draft
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* ─── Thread detail panel ─── */}
                {selectedMessage && showThread && (
                  <div className="flex-1 min-w-0 flex flex-col">
                    {/* Mobile back button */}
                    <button
                      onClick={handleCloseThread}
                      className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground md:hidden border-b border-border/50 font-medium"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to inbox
                    </button>

                    <div className="flex-1 min-h-0 flex flex-col animate-fade-in">
                      {/* Thread header */}
                      <div className="p-5 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary ring-1 ring-primary/20">
                            {selectedMessage.clientName
                              ? getInitials(selectedMessage.clientName)
                              : "??"}
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-[15px] font-display font-semibold text-foreground truncate">
                              {selectedMessage.aiMetadata?.topics?.[0] ||
                                selectedMessage.text?.slice(0, 60) ||
                                "Message"}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground font-medium">
                                {selectedMessage.clientName ?? "Unknown"}
                              </span>
                              <span className="w-1 h-1 rounded-full bg-border" />
                              {(() => {
                                const Icon = getPlatformIcon(selectedMessage.platform);
                                return <Icon className="w-3 h-3 text-muted-foreground/60" />;
                              })()}
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {selectedMessage.timestamp
                                  ? formatRelativeTime(selectedMessage.timestamp)
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={handleCloseThread}
                          className="p-2 rounded-lg hover:bg-accent transition-colors"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>

                      {/* Meta badges */}
                      <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2.5 flex-wrap">
                        {(() => {
                          const label = getPriorityLabel(
                            selectedMessage.aiMetadata?.priorityScore
                          );
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-md ${
                                label === "critical"
                                  ? "bg-urgent/10 text-urgent"
                                  : label === "high"
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full ${getPriorityBarColor(selectedMessage.aiMetadata?.priorityScore)}`}
                              />
                              {label}
                            </span>
                          );
                        })()}
                        {(() => {
                          const s = getSentimentLabel(
                            selectedMessage.aiMetadata?.sentiment
                          );
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-md ${s.className}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              {s.text}
                            </span>
                          );
                        })()}
                        {selectedMessage.aiMetadata?.sentiment?.toLowerCase() ===
                          "negative" && (
                          <span className="text-[10px] bg-urgent/10 text-urgent px-2.5 py-1 rounded-md font-medium">
                            ⚠ Client may be frustrated
                          </span>
                        )}
                        {selectedMessage.isStarred && (
                          <span className="text-[10px] bg-warning/10 text-warning px-2.5 py-1 rounded-md font-medium flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            Starred
                          </span>
                        )}
                      </div>

                      {/* Scrollable content */}
                      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
                        {/* Message body */}
                        <div className="surface-raised rounded-xl p-5">
                          <p className="text-sm text-foreground/90 leading-[1.8] whitespace-pre-wrap">
                            {selectedMessage.text}
                          </p>
                        </div>

                        {/* Action items */}
                        {selectedMessage.aiMetadata?.extractedActions &&
                          selectedMessage.aiMetadata.extractedActions.length > 0 && (
                            <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-5">
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <span className="text-xs font-display font-semibold text-primary">
                                  Action Items
                                </span>
                                <span className="text-[10px] font-mono text-primary/50 ml-auto">
                                  {checkedItems.size}/
                                  {selectedMessage.aiMetadata.extractedActions.length}
                                </span>
                              </div>
                              <ul className="space-y-2.5">
                                {selectedMessage.aiMetadata.extractedActions.map(
                                  (item: string, i: number) => (
                                    <li
                                      key={i}
                                      className="flex items-start gap-3 group cursor-pointer"
                                      onClick={() => toggleActionItem(i)}
                                    >
                                      <div
                                        className={`w-[18px] h-[18px] rounded-md border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                                          checkedItems.has(i)
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-border hover:border-primary/40"
                                        }`}
                                      >
                                        {checkedItems.has(i) && (
                                          <CheckCircle2 className="w-3 h-3" />
                                        )}
                                      </div>
                                      <span
                                        className={`text-sm transition-all ${
                                          checkedItems.has(i)
                                            ? "text-muted-foreground line-through"
                                            : "text-foreground"
                                        }`}
                                      >
                                        {item}
                                      </span>
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}

                        {/* AI Draft / Reply composer */}
                        {showReplyComposer && selectedClient ? (
                          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 animate-slide-in">
                            <ReplyComposer
                              message={selectedMessage}
                              client={selectedClient}
                              onClose={() => setShowReplyComposer(false)}
                            />
                          </div>
                        ) : selectedMessage.aiMetadata?.suggestedReply ? (
                          <div>
                            {!showDraft ? (
                              <button
                                onClick={() => setShowDraft(true)}
                                className="flex items-center gap-2.5 text-sm text-primary hover:text-primary/80 transition-all group"
                              >
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:glow-primary transition-all">
                                  <Sparkles className="w-4 h-4" />
                                </div>
                                <span className="font-medium">
                                  View AI-drafted response
                                </span>
                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                            ) : (
                              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 animate-slide-in">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                                    </div>
                                    <span className="text-xs font-display font-semibold text-primary">
                                      AI-Drafted Reply
                                    </span>
                                  </div>
                                  <button
                                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                                    title="Copy"
                                    onClick={() =>
                                      navigator.clipboard.writeText(
                                        selectedMessage.aiMetadata?.suggestedReply ?? ""
                                      )
                                    }
                                  >
                                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </div>
                                <p className="text-sm text-foreground/85 leading-[1.8]">
                                  {selectedMessage.aiMetadata.suggestedReply}
                                </p>
                                <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-border/50">
                                  <button
                                    onClick={() => setShowReplyComposer(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all glow-primary"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    Send Reply
                                  </button>
                                  <button
                                    onClick={() => setShowReplyComposer(true)}
                                    className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all font-medium"
                                  >
                                    Edit first
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* No AI draft — show reply button */
                          <button
                            onClick={() => setShowReplyComposer(true)}
                            className="flex items-center gap-2.5 text-sm text-primary hover:text-primary/80 transition-all group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:glow-primary transition-all">
                              <Send className="w-4 h-4" />
                            </div>
                            <span className="font-medium">Compose reply</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : currentView === "digest" ? (
              <motion.div
                key="digest"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-full max-w-2xl mx-auto"
              >
                <DailyDigestView />
              </motion.div>
            ) : (
              <motion.div
                key="timeline"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-full max-w-3xl mx-auto"
              >
                <RelationshipTimeline
                  clientId={selectedClientId}
                  onBack={() => setCurrentView("inbox")}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
