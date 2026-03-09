"use client";

import { useState, useCallback, useRef, useMemo, memo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Badge } from "@/components/ui/badge";
import {
  Inbox,
  Star,
  Check,
  CheckCheck,
  Filter,
  Zap,
  Mail,
  MessageSquare,
  Eye,
  X,
  ExternalLink,
  RefreshCw,
  Loader2,
  ArrowRight,
  ChevronRight,
  Search,
} from "lucide-react";
import { formatRelativeTime, formatMessageTime } from "@/lib/date-utils";
import Link from "next/link";

type FilterType = "all" | "unread" | "urgent" | "starred";
type PlatformFilter = "all" | "gmail" | "slack";

export default function InboxPage() {
  const { user } = useCurrentUser();
  const [filter, setFilter] = useState<FilterType>("unread");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [readConfirmId, setReadConfirmId] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[0] = setTimeout(
      () => setDebouncedSearch(value.trim()),
      300
    );
  };

  const searchResults = useQuery(
    api.messages.search,
    debouncedSearch.length >= 2
      ? {
          query: debouncedSearch,
          platform: platformFilter !== "all" ? platformFilter : undefined,
        }
      : "skip"
  );
  const isSearching = debouncedSearch.length >= 2;

  const allMessagesResult = useQuery(api.messages.getAll, { limit: 200 });
  const allMessages = allMessagesResult?.messages ?? undefined;
  const unreadMessages = useQuery(api.messages.getUnread);
  const urgentMessages = useQuery(api.messages.getUrgent);
  const markAsRead = useMutation(api.messages.markAsRead).withOptimisticUpdate(
    (localStore, args) => {
      // Optimistically mark message as read in all cached queries
      const allResult = localStore.getQuery(api.messages.getAll, { limit: 200 });
      if (allResult?.messages) {
        localStore.setQuery(api.messages.getAll, { limit: 200 }, {
          ...allResult,
          messages: allResult.messages.map((m: any) =>
            m._id === args.id ? { ...m, isRead: true } : m
          ),
        });
      }
      const unread = localStore.getQuery(api.messages.getUnread, {});
      if (unread) {
        localStore.setQuery(api.messages.getUnread, {}, unread.filter((m: any) => m._id !== args.id));
      }
    }
  );
  const markAllAsRead = useMutation(api.messages.markAllAsRead).withOptimisticUpdate(
    (localStore) => {
      const allResult = localStore.getQuery(api.messages.getAll, { limit: 200 });
      if (allResult?.messages) {
        localStore.setQuery(api.messages.getAll, { limit: 200 }, {
          ...allResult,
          messages: allResult.messages.map((m: any) => ({ ...m, isRead: true })),
        });
      }
      localStore.setQuery(api.messages.getUnread, {}, []);
    }
  );
  const toggleStar = useMutation(api.messages.toggleStar).withOptimisticUpdate(
    (localStore, args) => {
      const allResult = localStore.getQuery(api.messages.getAll, { limit: 200 });
      if (allResult?.messages) {
        localStore.setQuery(api.messages.getAll, { limit: 200 }, {
          ...allResult,
          messages: allResult.messages.map((m: any) =>
            m._id === args.id ? { ...m, isStarred: !m.isStarred } : m
          ),
        });
      }
    }
  );
  const syncNow = useAction(api.sync.orchestrator.syncCurrentUser);

  // Select messages based on filter or search — memoized
  const baseMessages = isSearching
    ? searchResults
    : filter === "urgent"
      ? urgentMessages
      : filter === "unread"
        ? unreadMessages
        : allMessages;

  const filteredMessages = useMemo(() => {
    return baseMessages?.filter((msg: Record<string, any>) => {
      if (
        !isSearching &&
        platformFilter !== "all" &&
        msg.platform !== platformFilter
      )
        return false;
      if (!isSearching && filter === "starred" && !msg.isStarred) return false;
      return true;
    });
  }, [baseMessages, isSearching, platformFilter, filter]);

  const selectedMessage = useMemo(
    () => filteredMessages?.find((msg: Record<string, any>) => msg._id === selectedId),
    [filteredMessages, selectedId]
  );

  const handleSelectMessage = (msg: Record<string, any>) => {
    setSelectedId(msg._id);
  };

  const handleToggleStar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await toggleStar({ id: id as any });
  };

  const handleMarkRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await markAsRead({ id: id as any });
    setReadConfirmId(id);
    setTimeout(() => setReadConfirmId(null), 1500);
  };

  const handleMarkReadFromDetail = async (id: string) => {
    await markAsRead({ id: id as any });
    setReadConfirmId(id);
    setTimeout(() => setReadConfirmId(null), 1500);
  };

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await markAllAsRead({});
    } catch (err) {
      console.error("Mark all read failed:", err);
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleSyncNow = async () => {
    if (!user?._id || isSyncing) return;
    setIsSyncing(true);
    try {
      await syncNow({ userId: user._id });
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const unreadCount = unreadMessages?.length ?? 0;
  const urgentCount = urgentMessages?.length ?? 0;

  // Virtual scrolling for message list
  const listParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredMessages?.length ?? 0,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 82, // estimated row height in px
    overscan: 10,
  });

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">
              Inbox
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {isSearching
                ? `${filteredMessages?.length ?? 0} results for "${debouncedSearch}"`
                : `${filteredMessages?.length ?? 0} messages${unreadCount > 0 ? ` · ${unreadCount} unread` : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {markingAllRead ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                Mark All Read
              </button>
            )}
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50"
            >
              {isSyncing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {isSyncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl bg-card text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40 focus:glow-primary transition-all"
          />
          {isSearching && (
            <button
              onClick={() => {
                setSearchQuery("");
                setDebouncedSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary/60 rounded-lg p-1">
            {(
              [
                { key: "all", label: "All" },
                {
                  key: "unread",
                  label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`,
                },
                {
                  key: "urgent",
                  label: `Urgent${urgentCount > 0 ? ` (${urgentCount})` : ""}`,
                },
                { key: "starred", label: "Starred" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filter === f.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-secondary/60 rounded-lg p-1">
            {(
              [
                { key: "all", label: "All", icon: Filter },
                { key: "gmail", label: "Gmail", icon: Mail },
                { key: "slack", label: "Slack", icon: MessageSquare },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setPlatformFilter(f.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  platformFilter === f.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <f.icon className="h-3 w-3" />
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Split view: List + Detail */}
      <div className="flex-1 flex min-h-0 px-5 pb-5 gap-4">
        {/* Message List */}
        <div className="flex-1 min-w-0 flex flex-col surface-raised rounded-xl overflow-hidden">
          <div ref={listParentRef} className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredMessages && filteredMessages.length > 0 ? (
              <div
                style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const msg = filteredMessages[virtualRow.index] as Record<string, any>;
                  return (
                    <div
                      key={msg._id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className={`flex items-start gap-3 p-4 transition-all cursor-pointer relative border-b border-border/30 ${
                          !msg.isRead ? "bg-primary/5" : ""
                        } ${
                          selectedId === msg._id
                            ? "bg-accent"
                            : "hover:bg-accent/50"
                        }`}
                        onClick={() => handleSelectMessage(msg)}
                      >
                        {/* Priority bar */}
                        {msg.aiMetadata?.priorityScore >= 60 && (
                          <div
                            className={`priority-bar ${
                              msg.aiMetadata.priorityScore >= 80
                                ? "bg-urgent"
                                : "bg-primary"
                            }`}
                          />
                        )}

                        {/* Unread dot */}
                        <div className="pt-1.5 shrink-0 pl-1">
                          {!msg.isRead ? (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          ) : (
                            <div className="w-2 h-2" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-sm font-medium text-foreground truncate">
                              {msg.clientName ?? "Unknown"}
                            </span>
                            <PlatformBadge platform={msg.platform} />
                            {msg.aiMetadata?.priorityScore !== undefined &&
                              msg.aiMetadata.priorityScore >= 60 && (
                                <PriorityIndicator
                                  score={msg.aiMetadata.priorityScore}
                                />
                              )}
                          </div>
                          <p className="text-sm text-foreground/70 line-clamp-1 mb-0.5">
                            {msg.text}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {formatRelativeTime(msg.timestamp)}
                            </span>
                            {msg.aiMetadata?.sentiment && (
                              <SentimentDot
                                sentiment={msg.aiMetadata.sentiment}
                              />
                            )}
                            {msg.aiMetadata?.extractedActions?.length > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
                                <Zap className="h-2.5 w-2.5" />
                                {msg.aiMetadata.extractedActions.length}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick actions */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                            onClick={(e) => handleToggleStar(e, msg._id)}
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${
                                msg.isStarred
                                  ? "fill-warning text-warning"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          </button>
                          {!msg.isRead ? (
                            <button
                              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                              onClick={(e) => handleMarkRead(e, msg._id)}
                              title="Mark as read"
                            >
                              <Check className="h-3.5 w-3.5 text-muted-foreground/40" />
                            </button>
                          ) : readConfirmId === msg._id ? (
                            <CheckCheck className="h-3.5 w-3.5 text-success" />
                          ) : null}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                {isSearching ? (
                  <>
                    <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p>No results for &quot;{debouncedSearch}&quot;</p>
                    <p className="text-xs mt-1 text-muted-foreground/60">
                      Try a different search term
                    </p>
                  </>
                ) : (
                  <>
                    <Inbox className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p>
                      {filter === "urgent"
                        ? "No urgent messages"
                        : filter === "starred"
                          ? "No starred messages"
                          : filter === "unread"
                            ? "No unread messages"
                            : "No messages yet"}
                    </p>
                    <p className="text-xs mt-1 text-muted-foreground/60">
                      {filter === "all"
                        ? "Connect a platform and sync to get started"
                        : "You're all caught up!"}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Message Detail Panel */}
        <div className="w-120 shrink-0 flex flex-col max-lg:hidden surface-raised rounded-xl overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {selectedMessage ? (
              <div className="p-5 animate-fade-in">
                {/* Detail Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <PlatformBadge platform={selectedMessage.platform} />
                      <span className="text-xs text-muted-foreground">
                        {selectedMessage.direction === "inbound"
                          ? "From"
                          : "To"}{" "}
                        {selectedMessage.clientName}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {formatMessageTime(selectedMessage.timestamp)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                      onClick={(e) =>
                        handleToggleStar(e, selectedMessage._id)
                      }
                    >
                      <Star
                        className={`h-4 w-4 ${
                          selectedMessage.isStarred
                            ? "fill-warning text-warning"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                      onClick={() => setSelectedId(null)}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Read status */}
                {!selectedMessage.isRead ? (
                  <div className="flex items-center justify-between mb-4 p-3 bg-primary/10 border border-primary/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-sm font-medium text-primary">
                        Unread
                      </span>
                    </div>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
                      onClick={() =>
                        handleMarkReadFromDetail(selectedMessage._id)
                      }
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Mark as Read
                    </button>
                  </div>
                ) : readConfirmId === selectedMessage._id ? (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-success/10 border border-success/20 rounded-xl text-success text-sm">
                    <CheckCheck className="h-4 w-4" />
                    Marked as read
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-4 text-[10px] text-muted-foreground">
                    <Check className="h-3.5 w-3.5" />
                    Read
                  </div>
                )}

                {/* AI Metadata */}
                {selectedMessage.aiMetadata && (
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {selectedMessage.aiMetadata.priorityScore !== undefined && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full ${
                          selectedMessage.aiMetadata.priorityScore >= 80
                            ? "bg-urgent/10 text-urgent"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        Priority: {selectedMessage.aiMetadata.priorityScore}
                      </span>
                    )}
                    {selectedMessage.aiMetadata.sentiment && (
                      <span className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-border capitalize text-muted-foreground">
                        {selectedMessage.aiMetadata.sentiment}
                      </span>
                    )}
                    {selectedMessage.aiMetadata.scopeCreepDetected && (
                      <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-urgent/10 text-urgent">
                        Scope Creep
                      </span>
                    )}
                  </div>
                )}

                {/* Full message text */}
                <div className="mb-6">
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {selectedMessage.text}
                  </p>
                </div>

                {/* Action items */}
                {(selectedMessage.aiMetadata?.extractedActions?.length ?? 0) >
                  0 && (
                  <div className="mb-6 p-4 bg-warning/5 border border-warning/20 rounded-xl">
                    <p className="text-xs font-display font-semibold text-warning mb-2.5 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      Action Items
                    </p>
                    <div className="space-y-1.5">
                      {selectedMessage.aiMetadata!.extractedActions!.map(
                        (action: string, i: number) => (
                          <div
                            key={i}
                            className="flex items-start gap-2.5 text-sm text-foreground/80"
                          >
                            <div className="w-[18px] h-[18px] rounded-md border border-border mt-0.5 shrink-0" />
                            {action}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Suggested reply */}
                {selectedMessage.aiMetadata?.suggestedReply && (
                  <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <p className="text-xs font-display font-semibold text-primary mb-1.5">
                      Suggested Reply
                    </p>
                    <p className="text-sm text-foreground/70 leading-relaxed">
                      {selectedMessage.aiMetadata.suggestedReply}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link href={`/clients/${selectedMessage.clientId}`}>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                      <ArrowRight className="h-3.5 w-3.5" />
                      View Client & Reply
                    </button>
                  </Link>
                  <Link href={`/clients/${selectedMessage.clientId}`}>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-accent transition-colors">
                      <ExternalLink className="h-3 w-3" />
                      Full Thread
                    </button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm">Select a message to view</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PlatformBadge = memo(function PlatformBadge({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    gmail: "bg-urgent/10 text-urgent",
    slack: "bg-chart-4/10 text-chart-4",
    whatsapp: "bg-success/10 text-success",
    discord: "bg-primary/10 text-primary",
  };

  return (
    <Badge
      variant="secondary"
      className={`text-[10px] font-mono ${colors[platform] ?? "bg-muted text-muted-foreground"}`}
    >
      {platform}
    </Badge>
  );
});

const PriorityIndicator = memo(function PriorityIndicator({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-urgent/10 text-urgent">
        P{score}
      </span>
    );
  }
  if (score >= 60) {
    return (
      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning">
        P{score}
      </span>
    );
  }
  return null;
});

const SentimentDot = memo(function SentimentDot({ sentiment }: { sentiment: string }) {
  const colors: Record<string, string> = {
    positive: "bg-success",
    neutral: "bg-muted-foreground/40",
    negative: "bg-urgent",
    frustrated: "bg-urgent",
  };

  return (
    <div
      className={`w-1.5 h-1.5 rounded-full ${colors[sentiment] ?? "bg-muted-foreground/40"}`}
      title={sentiment}
    />
  );
});
