"use client";

import { useState, useMemo, useCallback, useRef, memo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AnimatePresence, motion } from "framer-motion";
import { ReplyComposer } from "@/components/dashboard/reply-composer";
import type { PendingMessage } from "@/components/dashboard/reply-composer";
import { healthColor, healthBg } from "@/lib/helpers";
import { getPlatformIconComponent, PlatformBadge } from "@/lib/platform-icons";
import { formatRelativeTime, formatMessageTime } from "@/lib/date-utils";
import Link from "next/link";
import { PLATFORMS, PLATFORM_LABELS, type PlatformType } from "@/lib/constants";
import { toast } from "sonner";
import {
  Inbox, Brain, CheckSquare, Search, X, Star, AlertTriangle, Clock,
  Zap, CheckCircle2, Sparkles, ArrowLeft, RefreshCw, Send, Copy,
  Loader2, CheckCheck, Check, Eye, ExternalLink, DollarSign,
  AlertCircle, Info, ArrowRight, TrendingDown, TrendingUp, Users,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type MessageFilter = "all" | "unread" | "urgent" | "starred";
type PlatformFilter = "all" | PlatformType;
type TabView = "inbox" | "insights" | "commitments";
type HealthStatus = "healthy" | "attention" | "at-risk";

// ─── Helpers ────────────────────────────────────────────────────────────────
function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function getHealthStatus(score: number): HealthStatus {
  if (score >= 70) return "healthy";
  if (score >= 40) return "attention";
  return "at-risk";
}

function getPriorityMeta(score: number | undefined) {
  if (!score)      return { label: "low",      cls: "bg-border/50 text-muted-foreground", bar: "bg-border" };
  if (score >= 80) return { label: "critical",  cls: "bg-urgent/10 text-urgent",           bar: "bg-urgent" };
  if (score >= 60) return { label: "high",      cls: "bg-primary/10 text-primary",         bar: "bg-primary" };
  if (score >= 40) return { label: "medium",    cls: "bg-warning/10 text-warning",          bar: "bg-warning" };
  return             { label: "low",      cls: "bg-border/50 text-muted-foreground", bar: "bg-border" };
}

function getSentimentMeta(sentiment: string | undefined) {
  switch (sentiment?.toLowerCase()) {
    case "positive": case "satisfied":
      return { text: "Positive",   cls: "bg-success/10 text-success" };
    case "negative": case "frustrated": case "angry":
      return { text: "Frustrated", cls: "bg-urgent/10 text-urgent" };
    default:
      return { text: "Neutral",    cls: "bg-muted text-muted-foreground" };
  }
}

const SEVERITY: Record<string, { icon: React.ReactNode; border: string; text: string; bg: string }> = {
  critical: { icon: <AlertCircle className="h-3.5 w-3.5" />, border: "border-urgent/30",  text: "text-urgent",           bg: "bg-urgent/5" },
  warning:  { icon: <AlertTriangle className="h-3.5 w-3.5"/>, border: "border-warning/30", text: "text-warning",          bg: "bg-warning/5" },
  info:     { icon: <Info className="h-3.5 w-3.5" />,         border: "border-primary/20", text: "text-primary",          bg: "bg-primary/5" },
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PulsePage() {
  const { user } = useCurrentUser();

  // ── View / filter state ──────────────────────────────────────────────────
  const [tab, setTab]                         = useState<TabView>("inbox");
  const [msgFilter, setMsgFilter]             = useState<MessageFilter>("unread");
  const [platformFilter, setPlatformFilter]   = useState<PlatformFilter>("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]         = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDetail, setShowDetail]           = useState(false);
  const prevTabRef                            = useRef<TabView>("inbox");
  const [tabDir, setTabDir]                   = useState(1); // 1 = forward, -1 = back

  // ── UI state ─────────────────────────────────────────────────────────────
  const [isSyncing, setIsSyncing]           = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [completingId, setCompletingId]     = useState<string | null>(null);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [showDraft, setShowDraft]           = useState(false);
  const [pendingMsgs, setPendingMsgs]       = useState<PendingMessage[]>([]);
  const searchTimerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const clients        = useQuery(api.clients.getByUser, { sortBy: "health" });
  const allResult      = useQuery(api.messages.getAll,    { limit: 200 });
  const unreadMsgs     = useQuery(api.messages.getUnread);
  const urgentMsgs     = useQuery(api.messages.getUrgent);
  const isSearching    = debouncedSearch.length >= 2;
  const searchResults  = useQuery(
    api.messages.search,
    isSearching ? { query: debouncedSearch, platform: platformFilter !== "all" ? platformFilter : undefined } : "skip"
  );
  const skillOutputs = useQuery(
    api.skills.getOutputs,
    tab === "insights" ? { limit: 50 } : "skip"
  );
  const [commitmentSubTab, setCommitmentSubTab] = useState<"pending" | "completed">("pending");

  const pendingCommitments = useQuery(
    api.commitments.getPendingWithClients,
    tab === "commitments" ? {} : "skip"
  );
  const completedCommitments = useQuery(
    api.commitments.getCompletedWithClients,
    tab === "commitments" && commitmentSubTab === "completed" ? {} : "skip"
  );

  // Derive the currently-selected message object early (needed for the commitments query key)
  const allMessages = allResult?.messages ?? [];

  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return null;
    const pool = isSearching ? (searchResults ?? []) : allMessages;
    return (pool as any[]).find((m: any) => m._id === selectedMessageId) ?? null;
  }, [selectedMessageId, isSearching, searchResults, allMessages]);

  const selectedClient = useMemo(
    () => (selectedMessage && clients ? clients.find((c: any) => c._id === selectedMessage.clientId) : null),
    [selectedMessage, clients]
  );

  const clientCommitments = useQuery(
    api.commitments.getByClient,
    selectedMessage?.clientId ? { clientId: selectedMessage.clientId as Id<"clients"> } : "skip"
  );

  const messageCommitments = useMemo(() => {
    if (!selectedMessage || !clientCommitments) return [];
    return (clientCommitments as any[]).filter((c: any) => c.sourceMessageId === selectedMessage._id);
  }, [selectedMessage, clientCommitments]);

  // ── Mutations / actions ───────────────────────────────────────────────────
  const markAsRead     = useMutation(api.messages.markAsRead);
  const markAllAsRead  = useMutation(api.messages.markAllAsRead);
  const toggleStar     = useMutation(api.messages.toggleStar);
  const completeCommit = useMutation(api.commitments.complete);
  const dismissOutput  = useMutation(api.skills.dismissOutput);
  const syncNow        = useAction(api.sync.orchestrator.syncCurrentUser);

  // ── Derived message list ──────────────────────────────────────────────────
  const filteredMessages = useMemo(() => {
    let base: any[] = [];
    if (isSearching)                  base = searchResults ?? [];
    else if (msgFilter === "unread")  base = unreadMsgs ?? [];
    else if (msgFilter === "urgent")  base = urgentMsgs ?? [];
    else                              base = allMessages;

    let msgs = [...base];

    if (selectedClientId)
      msgs = msgs.filter((m: any) => m.clientId === selectedClientId);
    if (platformFilter !== "all")
      msgs = msgs.filter((m: any) => m.platform === platformFilter);
    if (msgFilter === "starred" && !isSearching)
      msgs = msgs.filter((m: any) => m.isStarred);

    // For 'all' messages, sort strictly by time (newest first). Otherwise, priority first.
    if (msgFilter === "all") {
      msgs.sort((a: any, b: any) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    } else {
      msgs.sort((a: any, b: any) => {
        const diff = (b.aiMetadata?.priorityScore ?? 0) - (a.aiMetadata?.priorityScore ?? 0);
        return diff !== 0 ? diff : (b.timestamp ?? 0) - (a.timestamp ?? 0);
      });
    }

    return msgs;
  }, [isSearching, searchResults, msgFilter, unreadMsgs, urgentMsgs, allMessages, selectedClientId, platformFilter]);

  const unreadCount = unreadMsgs?.length ?? 0;
  const urgentCount = urgentMsgs?.length ?? 0;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value.trim()), 300);
  }, []);

  const handleSelectMessage = useCallback(async (id: string) => {
    setSelectedMessageId(id);
    setShowDetail(true);
    setShowReplyComposer(false);
    setShowDraft(false);
    const pool = isSearching ? (searchResults ?? []) : allMessages;
    const msg = (pool as any[]).find((m: any) => m._id === id);
    if (msg && !msg.isRead) {
      try { await markAsRead({ id: msg._id }); } catch { /* ignore */ }
    }
  }, [isSearching, searchResults, allMessages, markAsRead]);

  const handleCloseDetail = useCallback(() => {
    setSelectedMessageId(null);
    setShowDetail(false);
    setShowReplyComposer(false);
  }, []);

  const handleToggleStar = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try { await toggleStar({ id: id as any }); } catch { /* ignore */ }
  }, [toggleStar]);

  const handleCompleteCommitment = useCallback(async (id: string) => {
    if (completingId === id) return;
    setCompletingId(id);
    try { await completeCommit({ id: id as Id<"commitments"> }); }
    catch { toast.error("Failed to complete"); }
    finally { setCompletingId(null); }
  }, [completeCommit, completingId]);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAllRead(true);
    try { await markAllAsRead({}); toast.success("All marked as read"); }
    catch { toast.error("Failed"); }
    finally { setMarkingAllRead(false); }
  }, [markAllAsRead]);

  const handleSyncNow = useCallback(async () => {
    if (!user?._id || isSyncing) return;
    setIsSyncing(true);
    try { await syncNow({ userId: user._id }); toast.success("Sync complete"); }
    catch { toast.error("Sync failed"); }
    finally { setIsSyncing(false); }
  }, [user, isSyncing, syncNow]);

  const handleOptimisticSend = useCallback((p: PendingMessage) => setPendingMsgs((prev) => [...prev, p]), []);
  const handleSendComplete   = useCallback((id: string) => setPendingMsgs((prev) => prev.filter((m) => m._id !== id)), []);
  const handleSendFailed     = useCallback((id: string) => {
    setPendingMsgs((prev) => prev.map((m) => m._id === id ? { ...m, isFailed: true } : m));
    setTimeout(() => setPendingMsgs((prev) => prev.filter((m) => m._id !== id)), 5000);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex overflow-hidden bg-background">

      {/* ══ Client Sidebar ══ */}
      <aside className="w-52 xl:w-56 shrink-0 hidden md:flex flex-col border-r border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary" />
            </div>
            <span className="text-xs font-display font-semibold text-gradient">Wire Pulse</span>
          </div>
        </div>

        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1 shrink-0">
          Clients
        </p>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3 space-y-0.5">
          {/* All */}
          <button
            onClick={() => { setSelectedClientId(null); setSelectedMessageId(null); setShowDetail(false); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between ${
              !selectedClientId
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            All Messages
            {unreadCount > 0 && (
              <span className="text-[9px] font-mono font-bold bg-urgent text-urgent-foreground px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>

          {clients?.map((client: any) => {
            const health = client.relationshipHealth ?? 50;
            const status = getHealthStatus(health);
            return (
              <button
                key={client._id}
                onClick={() => { setSelectedClientId(client._id); setSelectedMessageId(null); setShowDetail(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all group ${
                  selectedClientId === client._id ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${healthBg(status)} ${healthColor(status)}`}>
                    {getInitials(client.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-medium text-foreground truncate">{client.name}</span>
                      {status === "at-risk" && <AlertTriangle className="w-2.5 h-2.5 text-urgent shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="h-0.5 flex-1 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full ${health >= 70 ? "bg-success" : health >= 40 ? "bg-warning" : "bg-urgent"}`}
                          style={{ width: `${health}%` }}
                        />
                      </div>
                      <span className={`text-[9px] font-mono font-bold ${healthColor(status)}`}>{health}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ══ Main Area ══ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* ── Top bar: tabs + search + actions ── */}
        <div className="shrink-0 px-4 py-2 border-b border-border/50 flex items-center gap-3 bg-card/20 backdrop-blur-sm">
          {/* Tabs */}
          <div className="flex items-center gap-0.5 bg-secondary/50 rounded-xl p-0.5 shrink-0">
            {([
              { id: "inbox",        label: "Inbox",        icon: Inbox,       badge: unreadCount },
              { id: "insights",     label: "AI Insights",  icon: Brain,       badge: 0 },
              { id: "commitments",  label: "Commitments",  icon: CheckSquare, badge: 0 },
            ] as const).map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => {
                  const ORDER = ["inbox","insights","commitments"] as const;
                  const dir = ORDER.indexOf(id) - ORDER.indexOf(tab);
                  setTabDir(dir >= 0 ? 1 : -1);
                  prevTabRef.current = tab;
                  setTab(id);
                  setSelectedMessageId(null);
                  setShowDetail(false);
                }}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium transition-colors whitespace-nowrap outline-none ${
                  tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === id && (
                  <motion.div
                    layoutId="pulse-tab-pill"
                    className="absolute inset-0 bg-background rounded-[10px] shadow-sm"
                    transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{label}</span>
                {badge > 0 && (
                  <span className="relative z-10 bg-urgent text-urgent-foreground text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search — inbox only */}
          {tab === "inbox" && (
            <div className="flex-1 max-w-xs relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search messages…"
                className="w-full pl-7 pr-7 py-1.5 text-xs bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:border-primary/40 focus:bg-background text-foreground placeholder:text-muted-foreground/50 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setDebouncedSearch(""); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {tab === "inbox" && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAllRead}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-border/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {markingAllRead ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                <span className="hidden sm:inline">Mark read</span>
              </button>
            )}
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-border/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Sync"}</span>
            </button>
          </div>
        </div>

        {/* ── Filter bar (inbox only) ── */}
        {tab === "inbox" && (
          <div className="shrink-0 px-4 py-1.5 border-b border-border/30 flex items-center gap-2 flex-wrap bg-background/10">
            {/* Status */}
            <div className="flex items-center gap-0.5 bg-secondary/40 rounded-lg p-0.5">
              {([
                { key: "all",     label: "All",       count: undefined as number | undefined },
                { key: "unread",  label: "Unread",    count: unreadCount as number | undefined },
                { key: "urgent",  label: "Urgent",    count: urgentCount as number | undefined },
                { key: "starred", label: "★ Starred", count: undefined as number | undefined },
              ] satisfies { key: MessageFilter; label: string; count: number | undefined }[]).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setMsgFilter(key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap ${
                    msgFilter === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="ml-1 text-[9px] font-mono opacity-60">{count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Platform */}
            <div className="flex items-center gap-0.5 bg-secondary/40 rounded-lg p-0.5">
              <button
                onClick={() => setPlatformFilter("all")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  platformFilter === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {PLATFORMS.map((p) => {
                const Icon = getPlatformIconComponent(p);
                return (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    title={PLATFORM_LABELS[p]}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                      platformFilter === p
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden lg:inline">{PLATFORM_LABELS[p]}</span>
                  </button>
                );
              })}
            </div>

            <span className="text-[10px] font-mono text-muted-foreground/40 ml-auto hidden sm:block">
              {isSearching
                ? `${filteredMessages.length} results`
                : `${filteredMessages.length} msgs · ${msgFilter === "all" ? "time" : "priority"} sorted`}
            </span>
          </div>
        )}

        {/* ══ Tab Content ══ */}
        <div className="flex-1 min-h-0">
          <AnimatePresence mode="wait">

            {/* ──────── INBOX TAB ──────── */}
            {tab === "inbox" && (
              <motion.div
                key="inbox"
                initial={{ opacity: 0, x: tabDir * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tabDir * -24 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="h-full flex"
              >
                {/* Message list */}
                <div
                  className={`${showDetail ? "hidden lg:flex" : "flex"} ${
                    selectedMessage ? "lg:w-[42%] xl:w-[40%]" : "w-full"
                  } flex-col border-r border-border/40 transition-all duration-200`}
                >
                  <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {filteredMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Inbox className="w-12 h-12 mb-3 opacity-20" />
                        <p className="text-sm font-medium">
                          {isSearching
                            ? `No results for "${debouncedSearch}"`
                            : msgFilter === "unread" ? "You're all caught up!"
                            : msgFilter === "urgent" ? "No urgent messages"
                            : msgFilter === "starred" ? "No starred messages"
                            : "No messages yet"}
                        </p>
                        <p className="text-xs mt-1 opacity-50">
                          {msgFilter === "unread" ? "No unread messages right now" : ""}
                        </p>
                      </div>
                    ) : (
                      <>
                        {filteredMessages.map((msg: any) => (
                          <MessageRow
                            key={msg._id}
                            msg={msg}
                            isSelected={selectedMessageId === msg._id}
                            onSelect={handleSelectMessage}
                            onToggleStar={handleToggleStar}
                          />
                        ))}
                        {!isSearching && !selectedClientId && msgFilter === "all" && allResult?.hasMore && (
                          <div className="flex justify-center py-4 border-t border-border/30">
                            <p className="text-[11px] text-muted-foreground/50 font-mono">
                              Showing 200 most recent messages
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Detail panel */}
                {selectedMessage && showDetail && (
                  <DetailPanel
                    msg={selectedMessage}
                    client={selectedClient}
                    messageCommitments={messageCommitments}
                    completingId={completingId}
                    showReplyComposer={showReplyComposer}
                    showDraft={showDraft}
                    pendingMsgs={pendingMsgs}
                    onClose={handleCloseDetail}
                    onToggleStar={handleToggleStar}
                    onCompleteCommitment={handleCompleteCommitment}
                    onShowReplyComposer={() => setShowReplyComposer(true)}
                    onShowDraft={() => setShowDraft(true)}
                    onOptimisticSend={handleOptimisticSend}
                    onSendComplete={handleSendComplete}
                    onSendFailed={handleSendFailed}
                    onCloseReply={() => setShowReplyComposer(false)}
                  />
                )}
              </motion.div>
            )}

            {/* ──────── AI INSIGHTS TAB ──────── */}
            {tab === "insights" && (
              <motion.div
                key="insights"
                initial={{ opacity: 0, x: tabDir * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tabDir * -24 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="h-full overflow-y-auto scrollbar-thin p-5"
              >
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="mb-2">
                    <h2 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      AI Intelligence Feed
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Proactive alerts from your AI skills across all clients
                    </p>
                  </div>

                  {!skillOutputs ? (
                    <div className="flex justify-center py-20">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : skillOutputs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Brain className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm">No AI alerts right now</p>
                      <p className="text-xs mt-1 opacity-50">Skills are monitoring your clients continuously</p>
                    </div>
                  ) : (
                    skillOutputs.map((output: any) => {
                      const style = SEVERITY[output.severity] ?? SEVERITY.info;
                      return (
                        <div
                          key={output._id}
                          className={`rounded-xl border p-4 transition-all ${style.border} ${style.bg} ${output.isDismissed ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`shrink-0 mt-0.5 ${style.text}`}>{style.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-[10px] font-mono uppercase tracking-wider ${style.text}`}>
                                  {output.skillId?.replace(/_/g, " ")}
                                </span>
                                {output.clientName && (
                                  <Link
                                    href={`/clients/${output.clientId}`}
                                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    {output.clientName}
                                    <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                                  </Link>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-foreground">{output.title}</p>
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{output.message}</p>
                              {output.data?.suggestedTemplate && (
                                <div className="mt-3 p-3 bg-background/60 rounded-lg border border-border/40">
                                  <p className="text-[10px] font-mono text-muted-foreground mb-1.5 uppercase tracking-wider">Suggested Response</p>
                                  <p className="text-xs text-foreground/85 leading-relaxed">{output.data.suggestedTemplate}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-3 mt-3 pt-2 border-t border-current/10">
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {formatRelativeTime(output._creationTime)}
                                </span>
                                {output.actionTaken && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-mono text-success">
                                    <Check className="w-2.5 h-2.5" /> Action taken
                                  </span>
                                )}
                              </div>
                            </div>
                            {!output.isDismissed && (
                              <button
                                onClick={() => dismissOutput({ id: output._id })}
                                className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md hover:bg-background/60 transition-colors"
                              >
                                <X className="w-3 h-3 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}

            {/* ──────── COMMITMENTS TAB ──────── */}
            {tab === "commitments" && (
              <motion.div
                key="commitments"
                initial={{ opacity: 0, x: tabDir * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tabDir * -24 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="h-full flex flex-col overflow-hidden"
              >
                {/* Sub-tab bar */}
                <div className="shrink-0 px-5 pt-4 pb-0">
                  <div className="max-w-2xl mx-auto">
                    <div className="flex items-center gap-1 bg-secondary/40 rounded-xl p-1 w-fit">
                      {([
                        { id: "pending" as const,   label: "Pending",   count: pendingCommitments?.length },
                        { id: "completed" as const, label: "Completed", count: undefined },
                      ]).map(({ id, label, count }) => (
                        <button
                          key={id}
                          onClick={() => setCommitmentSubTab(id)}
                          className={`relative flex items-center gap-1.5 px-4 py-1.5 rounded-[10px] text-xs font-medium transition-colors whitespace-nowrap ${
                            commitmentSubTab === id
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {commitmentSubTab === id && (
                            <motion.div
                              layoutId="commit-subtab-pill"
                              className="absolute inset-0 bg-background rounded-[10px] shadow-sm"
                              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                            />
                          )}
                          <span className="relative z-10">{label}</span>
                          {count !== undefined && count > 0 && (
                            <span className={`relative z-10 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                              commitmentSubTab === id ? "bg-primary/10 text-primary" : "bg-border/50 text-muted-foreground"
                            }`}>
                              {count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sub-tab content */}
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  <AnimatePresence mode="wait">
                    {commitmentSubTab === "pending" ? (
                      <motion.div
                        key="pending"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="p-5"
                      >
                        <div className="max-w-2xl mx-auto space-y-3">
                          {!pendingCommitments ? (
                            <div className="flex justify-center py-20">
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : pendingCommitments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                              <CheckCircle2 className="w-12 h-12 mb-3 opacity-20" />
                              <p className="text-sm font-medium">All caught up!</p>
                              <p className="text-xs mt-1 opacity-50">No pending commitments right now</p>
                            </div>
                          ) : (
                            pendingCommitments.map((c: any) => {
                              const isOverdue    = c.dueDate && c.dueDate < Date.now();
                              const isCompleting = completingId === c._id;
                              return (
                                <motion.div
                                  key={c._id}
                                  layout
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.97 }}
                                  transition={{ duration: 0.15 }}
                                  onClick={() => handleCompleteCommitment(c._id)}
                                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all group ${
                                    isOverdue
                                      ? "border-urgent/20 bg-urgent/[0.03] hover:bg-urgent/[0.06]"
                                      : "border-border/40 bg-card/40 hover:bg-accent/40"
                                  }`}
                                >
                                  <div className={`w-4.5 h-4.5 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                                    isCompleting
                                      ? "bg-success/20 border-success/40"
                                      : "border-border group-hover:border-primary/40"
                                  }`}>
                                    {isCompleting && <Check className="w-2.5 h-2.5 text-success animate-pulse" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-sm font-medium text-foreground">{c.text}</span>
                                      {isOverdue && (
                                        <span className="text-[10px] font-mono text-urgent bg-urgent/10 px-2 py-0.5 rounded-full shrink-0 leading-4">
                                          Overdue
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                      {c.clientName && (
                                        <Link
                                          href={`/clients/${c.clientId}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                                        >
                                          <Users className="w-2.5 h-2.5" /> {c.clientName}
                                        </Link>
                                      )}
                                      {c.dueDate && (
                                        <span className={`flex items-center gap-1 text-[11px] font-mono ${isOverdue ? "text-urgent" : "text-muted-foreground"}`}>
                                          <Clock className="w-2.5 h-2.5" />
                                          {new Date(c.dueDate).toLocaleDateString()}
                                        </span>
                                      )}
                                      {c.type && (
                                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded capitalize">
                                          {c.type}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="completed"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="p-5"
                      >
                        <div className="max-w-2xl mx-auto space-y-3">
                          {!completedCommitments ? (
                            <div className="flex justify-center py-20">
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : completedCommitments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                              <Eye className="w-12 h-12 mb-3 opacity-20" />
                              <p className="text-sm font-medium">No completed commitments yet</p>
                              <p className="text-xs mt-1 opacity-50">Completed items will appear here</p>
                            </div>
                          ) : (
                            completedCommitments.map((c: any) => (
                              <motion.div
                                key={c._id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.15 }}
                                className="flex items-start gap-3 p-4 rounded-xl border border-border/30 bg-card/20 opacity-70"
                              >
                                <div className="w-4.5 h-4.5 rounded border border-success/40 bg-success/10 mt-0.5 shrink-0 flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-success" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-foreground/60 line-through">{c.text}</span>
                                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                    {c.clientName && (
                                      <Link
                                        href={`/clients/${c.clientId}`}
                                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                                      >
                                        <Users className="w-2.5 h-2.5" /> {c.clientName}
                                      </Link>
                                    )}
                                    {c.dueDate && (
                                      <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                                        <Clock className="w-2.5 h-2.5" />
                                        {new Date(c.dueDate).toLocaleDateString()}
                                      </span>
                                    )}
                                    {c.type && (
                                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded capitalize">
                                        {c.type}
                                      </span>
                                    )}
                                    <span className="text-[10px] font-mono text-success bg-success/10 px-1.5 py-0.5 rounded-full ml-auto">
                                      Done
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── MessageRow ──────────────────────────────────────────────────────────────
const MessageRow = memo(function MessageRow({
  msg,
  isSelected,
  onSelect,
  onToggleStar,
}: {
  msg: any;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleStar: (e: React.MouseEvent, id: string) => void;
}) {
  const PIcon = getPlatformIconComponent(msg.platform);
  const { bar }      = getPriorityMeta(msg.aiMetadata?.priorityScore);
  const sentiment    = getSentimentMeta(msg.aiMetadata?.sentiment);
  const subject      = msg.aiMetadata?.topics?.[0] || msg.text?.slice(0, 55) || "No subject";
  const isCritical   = (msg.aiMetadata?.priorityScore ?? 0) >= 80;
  const isHighPlus   = (msg.aiMetadata?.priorityScore ?? 0) >= 60;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(msg._id)}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(msg._id); }}
      className={`relative px-4 py-3 border-b border-border/30 cursor-pointer transition-all group ${
        isSelected
          ? "bg-accent/80"
          : !msg.isRead
            ? "bg-primary/[0.03] hover:bg-secondary/30"
            : "hover:bg-secondary/20"
      }`}
    >
      {/* Priority side-bar */}
      {isHighPlus && (
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${bar}`} />
      )}

      <div className="flex items-start gap-2.5 pl-1.5">
        {/* Unread dot */}
        <div className="shrink-0 mt-[5px]">
          {!msg.isRead
            ? <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            : <div className="w-1.5 h-1.5" />}
        </div>

        {/* Avatar */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
          !msg.isRead ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
        }`}>
          {msg.clientName ? getInitials(msg.clientName) : "??"}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-xs font-semibold truncate ${!msg.isRead ? "text-foreground" : "text-foreground/80"}`}>
                {msg.clientName ?? "Unknown"}
              </span>
              <PIcon className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
              {isCritical && (
                <span className="flex items-center gap-0.5 text-[9px] font-mono font-bold text-urgent bg-urgent/10 px-1.5 py-0.5 rounded-full">
                  <Zap className="w-2 h-2" /> Urgent
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => onToggleStar(e, msg._id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Star className={`w-3 h-3 ${msg.isStarred ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
              </button>
              <span className="text-[10px] font-mono text-muted-foreground/60">
                {formatRelativeTime(msg.timestamp)}
              </span>
            </div>
          </div>

          {/* Subject */}
          <p className={`text-[11px] mt-0.5 truncate ${!msg.isRead ? "font-semibold text-foreground" : "text-foreground/75"}`}>
            {subject}
          </p>

          {/* Preview */}
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 leading-relaxed">
            {msg.text?.slice(0, 90)}{(msg.text?.length ?? 0) > 90 ? "…" : ""}
          </p>

          {/* Signal chips */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${sentiment.cls}`}>
              <span className="w-1 h-1 rounded-full bg-current" />
              {sentiment.text}
            </span>
            {(msg.aiMetadata?.extractedActions?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-primary bg-primary/8 px-1.5 py-0.5 rounded-full font-medium">
                <CheckCircle2 className="w-2 h-2" />
                {msg.aiMetadata.extractedActions.length}
              </span>
            )}
            {msg.aiMetadata?.dealSignal && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-success bg-success/10 px-1.5 py-0.5 rounded-full font-medium">
                <DollarSign className="w-2 h-2" /> Deal
              </span>
            )}
            {(msg.aiMetadata?.churnRisk === "high" || msg.aiMetadata?.churnRisk === "critical") && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-urgent bg-urgent/10 px-1.5 py-0.5 rounded-full font-medium">
                <TrendingDown className="w-2 h-2" /> Churn
              </span>
            )}
            {msg.aiMetadata?.suggestedReply && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-primary/60 font-mono">
                <Sparkles className="w-2 h-2" /> AI draft
              </span>
            )}
            {msg.aiMetadata?.scopeCreepDetected && (
              <span className="text-[9px] font-mono font-bold text-urgent bg-urgent/10 px-1.5 py-0.5 rounded-full">
                Scope creep
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── DetailPanel ─────────────────────────────────────────────────────────────
const DetailPanel = memo(function DetailPanel({
  msg,
  client,
  messageCommitments,
  completingId,
  showReplyComposer,
  showDraft,
  pendingMsgs,
  onClose,
  onToggleStar,
  onCompleteCommitment,
  onShowReplyComposer,
  onShowDraft,
  onOptimisticSend,
  onSendComplete,
  onSendFailed,
  onCloseReply,
}: {
  msg: any;
  client: any;
  messageCommitments: any[];
  completingId: string | null;
  showReplyComposer: boolean;
  showDraft: boolean;
  pendingMsgs: PendingMessage[];
  onClose: () => void;
  onToggleStar: (e: React.MouseEvent, id: string) => void;
  onCompleteCommitment: (id: string) => void;
  onShowReplyComposer: () => void;
  onShowDraft: () => void;
  onOptimisticSend: (p: PendingMessage) => void;
  onSendComplete: (id: string) => void;
  onSendFailed: (id: string) => void;
  onCloseReply: () => void;
}) {
  const { label: prioLabel, cls: prioCls, bar: prioBar } = getPriorityMeta(msg.aiMetadata?.priorityScore);
  const sentiment = getSentimentMeta(msg.aiMetadata?.sentiment);
  const healthStatus = client ? getHealthStatus(client.relationshipHealth ?? 50) : null;

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden animate-fade-in">
      {/* Mobile back */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground lg:hidden border-b border-border/40 shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to inbox
      </button>

      {/* Header */}
      <div className="shrink-0 px-5 py-3 border-b border-border/40 flex items-center justify-between gap-3 bg-card/30">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
            client && healthStatus
              ? `${healthBg(healthStatus)} ${healthColor(healthStatus)}`
              : "bg-primary/10 text-primary"
          }`}>
            {msg.clientName ? getInitials(msg.clientName) : "??"}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-display font-semibold text-foreground truncate">
              {msg.aiMetadata?.topics?.[0] || msg.text?.slice(0, 50) || "Message"}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground">{msg.clientName ?? "Unknown"}</span>
              <PlatformBadge platform={msg.platform} />
              <span className="text-[10px] font-mono text-muted-foreground/60">{formatRelativeTime(msg.timestamp)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {client && (
            <Link
              href={`/clients/${msg.clientId}`}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              title="View client"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            </Link>
          )}
          <button
            onClick={(e) => onToggleStar(e, msg._id)}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <Star className={`w-3.5 h-3.5 ${msg.isStarred ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Signal strip */}
      <div className="shrink-0 px-5 py-2 border-b border-border/30 flex items-center gap-2 flex-wrap bg-background/10">
        <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-md ${prioCls}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${prioBar}`} />
          {prioLabel}
        </span>
        <span className={`text-[10px] font-mono px-2.5 py-1 rounded-md ${sentiment.cls}`}>
          {sentiment.text}
        </span>
        {msg.aiMetadata?.dealSignal && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-md bg-success/10 text-success">
            <DollarSign className="w-3 h-3" /> Deal Signal
          </span>
        )}
        {msg.aiMetadata?.scopeCreepDetected && (
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-md bg-urgent/10 text-urgent">
            Scope Creep
          </span>
        )}
        {(msg.aiMetadata?.churnRisk === "high" || msg.aiMetadata?.churnRisk === "critical") && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-md bg-urgent/10 text-urgent">
            <TrendingDown className="w-3 h-3" /> Churn {msg.aiMetadata.churnRisk}
          </span>
        )}
        {(msg.aiMetadata?.hiddenRequests?.length ?? 0) > 0 && (
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-warning/10 text-warning">
            {msg.aiMetadata.hiddenRequests.length} hidden concern{msg.aiMetadata.hiddenRequests.length > 1 ? "s" : ""}
          </span>
        )}
        {msg.aiMetadata?.valueSignal && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-md bg-primary/8 text-primary">
            <TrendingUp className="w-3 h-3" /> Value signal
          </span>
        )}
        {msg.isStarred && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-md bg-warning/10 text-warning">
            <Star className="w-2.5 h-2.5 fill-current" /> Starred
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        {/* Message body */}
        <div className="surface-raised rounded-xl p-4">
          <p className="text-sm text-foreground/90 leading-[1.8] whitespace-pre-wrap">{msg.text}</p>
        </div>

        {/* Hidden requests */}
        {(msg.aiMetadata?.hiddenRequests?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-warning/20 bg-warning/[0.03] p-4">
            <p className="text-xs font-display font-semibold text-warning mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Hidden Concerns Detected
            </p>
            <ul className="space-y-1">
              {msg.aiMetadata.hiddenRequests.map((r: string, i: number) => (
                <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                  <span className="text-warning mt-0.5">·</span> {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action items */}
        {(messageCommitments.length > 0 || (msg.aiMetadata?.extractedActions?.length ?? 0) > 0) && (
          <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-3 h-3 text-primary" />
              </div>
              <span className="text-xs font-display font-semibold text-primary">Action Items</span>
              {messageCommitments.length > 0 && (
                <span className="text-[10px] font-mono text-primary/50 ml-auto">
                  {messageCommitments.filter((c: any) => c.status === "completed").length}/{messageCommitments.length} done
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {messageCommitments.length > 0
                ? messageCommitments.map((c: any) => {
                    const done = c.status === "completed";
                    const working = completingId === c._id;
                    return (
                      <li
                        key={c._id}
                        onClick={() => !done && onCompleteCommitment(c._id)}
                        className={`flex items-start gap-2.5 ${done ? "cursor-default" : "cursor-pointer group"}`}
                      >
                        <div className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                          done ? "bg-success/20 border-success/40 text-success" : working ? "bg-primary/10 border-primary/40" : "border-border group-hover:border-primary/40"
                        }`}>
                          {working ? <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> : done ? <Check className="w-2.5 h-2.5" /> : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs transition-all ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {c.text}
                          </span>
                          {c.dueDate && !done && (
                            <p className={`text-[10px] font-mono mt-0.5 ${c.dueDate < Date.now() ? "text-urgent" : "text-muted-foreground"}`}>
                              Due {new Date(c.dueDate).toLocaleDateString()}
                              {c.dueDate < Date.now() ? " · Overdue" : ""}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })
                : (msg.aiMetadata?.extractedActions ?? []).map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <div className="w-4 h-4 rounded border border-border mt-0.5 shrink-0" />
                      <span className="text-xs text-muted-foreground">{item}</span>
                    </li>
                  ))}
            </ul>
          </div>
        )}

        {/* Reply section */}
        {showReplyComposer && client ? (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 animate-slide-in">
            <ReplyComposer
              message={msg}
              client={client}
              onClose={onCloseReply}
              onOptimisticSend={onOptimisticSend}
              onSendComplete={onSendComplete}
              onSendFailed={onSendFailed}
            />
          </div>
        ) : msg.aiMetadata?.suggestedReply ? (
          !showDraft ? (
            <button
              onClick={onShowDraft}
              className="flex items-center gap-2.5 group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:glow-primary transition-all">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-primary group-hover:text-primary/80 transition-colors">
                View AI-drafted response
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 animate-slide-in">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-xs font-display font-semibold text-primary">AI-Drafted Reply</span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(msg.aiMetadata?.suggestedReply ?? "")}
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                >
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
              <p className="text-sm text-foreground/85 leading-[1.8]">{msg.aiMetadata.suggestedReply}</p>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
                <button
                  onClick={onShowReplyComposer}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all glow-primary"
                >
                  <Send className="w-3.5 h-3.5" /> Send Reply
                </button>
                <button
                  onClick={onShowReplyComposer}
                  className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all"
                >
                  Edit first
                </button>
              </div>
            </div>
          )
        ) : msg.direction === "inbound" ? (
          <button onClick={onShowReplyComposer} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:glow-primary transition-all">
              <Send className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-primary group-hover:text-primary/80 transition-colors">
              Compose Reply
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : null}
      </div>
    </div>
  );
});
