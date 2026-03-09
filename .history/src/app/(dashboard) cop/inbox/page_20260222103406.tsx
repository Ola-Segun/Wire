"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { messages as mockMessages } from "@/data/mockData";
import ClientSidebar from "@/components/dashboard/client-sidebar";
import MessageList from "@/components/dashboard/message-list";
import type { MessageItem } from "@/components/dashboard/message-list";
import ThreadView from "@/components/dashboard/thread-view";
import type { ThreadMessage } from "@/components/dashboard/thread-view";
import DailyDigestView from "@/components/dashboard/daily-digest";
import RelationshipTimeline from "@/components/dashboard/relationship-timeline";
import InboxFilters from "@/components/dashboard/inbox-filters";
import type { FilterType, ChannelFilter } from "@/components/dashboard/inbox-filters";
import { ArrowLeft } from "lucide-react";
import { formatRelativeTime } from "@/lib/date-utils";

type View = "inbox" | "digest" | "timeline";

export default function InboxPage() {
  const { user } = useCurrentUser();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [currentView, setCurrentView] = useState<View>("inbox");
  const [showSidebar, setShowSidebar] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  // Convex data
  const allConvexMessages = useQuery(api.messages.getAll, { limit: 200 });
  const unreadConvexMessages = useQuery(api.messages.getUnread);
  const urgentConvexMessages = useQuery(api.messages.getUrgent);
  const convexClients = useQuery(api.clients.getByUser, { sortBy: "recent" });

  const hasConvexData =
    allConvexMessages !== undefined && allConvexMessages.length > 0;

  // Normalize messages from Convex or mock data into a unified shape
  const normalizedMessages: (MessageItem & {
    fullContent: string;
    actionItems?: string[];
  })[] = useMemo(() => {
    if (hasConvexData) {
      return (allConvexMessages ?? []).map((m: Record<string, any>) => ({
        id: m._id as string,
        clientId: m.clientId as string,
        clientName: (m.clientName ?? "Unknown") as string,
        clientAvatar: ((m.clientName ?? "U") as string)
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .slice(0, 2),
        subject: (m.text ?? "").slice(0, 60),
        preview: (m.text ?? "").slice(0, 120),
        fullContent: (m.text ?? "") as string,
        channel: (m.platform ?? "email") as string,
        priority: mapPriorityScore(m.aiMetadata?.priorityScore),
        sentiment: (m.aiMetadata?.sentiment ?? "neutral") as string,
        timestamp: formatRelativeTime(m.timestamp),
        isRead: m.isRead as boolean,
        hasActionItems: (m.aiMetadata?.extractedActions?.length ?? 0) > 0,
        suggestedReply: m.aiMetadata?.suggestedReply as string | undefined,
        actionItems: m.aiMetadata?.extractedActions as string[] | undefined,
      }));
    }
    return mockMessages.map((m) => ({
      id: m.id,
      clientId: m.clientId,
      clientName: m.clientName,
      clientAvatar: m.clientAvatar,
      subject: m.subject,
      preview: m.preview,
      fullContent: m.fullContent,
      channel: m.channel,
      priority: m.priority,
      sentiment: m.sentiment,
      timestamp: m.timestamp,
      isRead: m.isRead,
      hasActionItems: m.hasActionItems,
      suggestedReply: m.suggestedReply,
      actionItems: m.actionItems,
    }));
  }, [hasConvexData, allConvexMessages]);

  // Apply filters
  const filteredMessages = useMemo(() => {
    let filtered = [...normalizedMessages];

    // Client filter
    if (selectedClientId) {
      filtered = filtered.filter((m) => m.clientId === selectedClientId);
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.preview.toLowerCase().includes(q) ||
          m.clientName.toLowerCase().includes(q) ||
          m.fullContent.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filter === "unread") {
      filtered = filtered.filter((m) => !m.isRead);
    } else if (filter === "urgent") {
      filtered = filtered.filter(
        (m) => m.priority === "critical" || m.priority === "high"
      );
    }

    // Channel filter
    if (channelFilter !== "all") {
      filtered = filtered.filter((m) => m.channel === channelFilter);
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    filtered.sort(
      (a, b) =>
        (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
    );

    return filtered;
  }, [normalizedMessages, selectedClientId, searchQuery, filter, channelFilter]);

  const selectedMessage = selectedMessageId
    ? normalizedMessages.find((m) => m.id === selectedMessageId)
    : null;

  const unreadCount = normalizedMessages.filter((m) => !m.isRead).length;
  const urgentCount = normalizedMessages.filter(
    (m) => m.priority === "critical" || m.priority === "high"
  ).length;

  const handleSelectMessage = (id: string) => {
    setSelectedMessageId(id);
    setShowThread(true);
  };

  const handleCloseThread = () => {
    setSelectedMessageId(null);
    setShowThread(false);
  };

  const handleSelectClient = (id: string | null) => {
    setSelectedClientId(id);
    setShowSidebar(false);
  };

  // Build thread message for ThreadView
  const threadMessage: ThreadMessage | null = selectedMessage
    ? {
        id: selectedMessage.id,
        clientName: selectedMessage.clientName,
        clientAvatar: selectedMessage.clientAvatar,
        subject: selectedMessage.subject,
        fullContent: selectedMessage.fullContent,
        channel: selectedMessage.channel,
        priority: selectedMessage.priority,
        sentiment: selectedMessage.sentiment,
        timestamp: selectedMessage.timestamp,
        actionItems: selectedMessage.actionItems,
        suggestedReply: selectedMessage.suggestedReply,
      }
    : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Client Sidebar */}
      <div
        className={`${
          showSidebar ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:relative z-50 md:z-auto h-full transition-transform duration-200`}
      >
        <ClientSidebar
          selectedClientId={selectedClientId}
          onSelectClient={handleSelectClient}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Content Area */}
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
                {/* Message List Panel */}
                <div
                  className={`${
                    selectedMessage && showThread
                      ? "hidden md:flex"
                      : "flex"
                  } ${
                    selectedMessage ? "md:w-2/5" : "w-full"
                  } border-r border-border flex-col transition-all duration-200`}
                >
                  {/* Responsive inbox filter */}
                  <div className="px-4 py-3 border-b border-border/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
                        {filteredMessages.length} messages · sorted by priority
                      </span>
                    </div>
                    <InboxFilters
                      filter={filter}
                      channelFilter={channelFilter}
                      onFilterChange={setFilter}
                      onChannelFilterChange={setChannelFilter}
                      unreadCount={unreadCount}
                      urgentCount={urgentCount}
                    />
                  </div>
                  <MessageList
                    messages={filteredMessages}
                    selectedId={selectedMessageId}
                    onSelect={handleSelectMessage}
                  />
                </div>

                {/* Thread Detail Panel */}
                {threadMessage && showThread && (
                  <div className="flex-1 min-w-0 flex flex-col">
                    <button
                      onClick={handleCloseThread}
                      className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground md:hidden border-b border-border/50 font-medium"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to inbox
                    </button>
                    <div className="flex-1 min-h-0">
                      <ThreadView
                        message={threadMessage}
                        onClose={handleCloseThread}
                      />
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
                <DailyDigestView onBack={() => setCurrentView("inbox")} />
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

function mapPriorityScore(score: number | undefined): string {
  if (!score) return "low";
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}
