"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Star,
  Zap,
  Users,
  TrendingUp,
  DollarSign,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Link2Off,
  ToggleLeft,
  ToggleRight,
  Archive,
  ArchiveRestore,
  Phone,
} from "lucide-react";
import { formatRelativeTime, formatMessageTime } from "@/lib/date-utils";
import dynamic from "next/dynamic";
import type { PendingMessage } from "@/components/dashboard/reply-composer";
import { AddIdentityModal } from "@/components/dashboard/add-identity-modal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { CommitmentsPanel } from "@/components/dashboard/commitments-panel";
import { ContractsPanel } from "@/components/dashboard/contracts-panel";
import { ClientIntelligencePanel } from "@/components/dashboard/client-intelligence-panel";
import { ClientSkillAlertsPanel } from "@/components/dashboard/client-skill-alerts-panel";
import { ThreadSummaryPanel } from "@/components/dashboard/thread-summary-panel";

// Lazy load ReplyComposer — it's heavy (AI writing assistant, multiple actions)
const ReplyComposer = dynamic(
  () => import("@/components/dashboard/reply-composer").then((m) => ({ default: m.ReplyComposer })),
  { loading: () => <div className="animate-pulse h-40 bg-accent/30 rounded-lg" /> }
);

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { user } = useCurrentUser();

  const [selectedMessage, setSelectedMessage] = useState<Record<
    string,
    any
  > | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(
    new Set()
  );
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [addIdentityOpen, setAddIdentityOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const handleOptimisticSend = useCallback((pending: PendingMessage) => {
    setPendingMessages((prev) => [...prev, pending]);
  }, []);

  const handleSendComplete = useCallback((pendingId: string) => {
    setPendingMessages((prev) => prev.filter((m) => m._id !== pendingId));
  }, []);

  const handleSendFailed = useCallback((pendingId: string) => {
    setPendingMessages((prev) =>
      prev.map((m) => m._id === pendingId ? { ...m, isFailed: true } : m)
    );
    setTimeout(() => {
      setPendingMessages((prev) => prev.filter((m) => m._id !== pendingId));
    }, 5000);
  }, []);

  const client = useQuery(api.clients.get, { id: clientId as any });
  const identities = useQuery(api.identities.getByClient, {
    clientId: clientId as any,
  });
  const messagesResult = useQuery(api.messages.getByClient, {
    clientId: clientId as any,
    limit: 100,
  });
  const messages = messagesResult?.messages ?? undefined;

  const queryArgs = { clientId: clientId as any, limit: 100 };
  const toggleStar = useMutation(api.messages.toggleStar).withOptimisticUpdate(
    (localStore, args) => {
      const result = localStore.getQuery(api.messages.getByClient, queryArgs);
      if (result?.messages) {
        localStore.setQuery(api.messages.getByClient, queryArgs, {
          ...result,
          messages: result.messages.map((m: any) =>
            m._id === args.id ? { ...m, isStarred: !m.isStarred } : m
          ),
        });
      }
    }
  );
  const markAsRead = useMutation(api.messages.markAsRead).withOptimisticUpdate(
    (localStore, args) => {
      const result = localStore.getQuery(api.messages.getByClient, queryArgs);
      if (result?.messages) {
        localStore.setQuery(api.messages.getByClient, queryArgs, {
          ...result,
          messages: result.messages.map((m: any) =>
            m._id === args.id ? { ...m, isRead: true } : m
          ),
        });
      }
    }
  );
  const unlinkIdentity = useMutation(api.identities.unlinkFromClient);
  const toggleIdentitySync = useMutation(api.identities.toggleSelected);
  const archiveClient = useMutation(api.clients.archive);
  const unarchiveClient = useMutation(api.clients.unarchive);

  const handleUnlink = useCallback(async (identityId: string, displayName: string) => {
    setUnlinkingId(identityId);
    try {
      await unlinkIdentity({ identityId: identityId as any });
      toast.success(`${displayName} unlinked`);
    } catch {
      toast.error("Failed to unlink");
    } finally {
      setUnlinkingId(null);
    }
  }, [unlinkIdentity]);

  const handleToggleSync = useCallback(async (identityId: string, current: boolean) => {
    setTogglingId(identityId);
    try {
      await toggleIdentitySync({ identityId: identityId as any, isSelected: !current });
      toast.success(!current ? "Sync resumed" : "Sync paused");
    } catch {
      toast.error("Failed to update sync");
    } finally {
      setTogglingId(null);
    }
  }, [toggleIdentitySync]);

  const handleArchiveToggle = useCallback(async () => {
    if (!client) return;
    setArchiving(true);
    try {
      if (client.isArchived) {
        await unarchiveClient({ id: clientId as any });
        toast.success("Client restored");
      } else {
        await archiveClient({ id: clientId as any });
        toast.success("Client archived");
      }
    } catch {
      toast.error("Failed to update client");
    } finally {
      setArchiving(false);
    }
  }, [client, clientId, archiveClient, unarchiveClient]);

  // Merge real messages with optimistic pending messages — memoized
  // Must be before any early returns to satisfy Rules of Hooks
  const filteredMessages = useMemo(() => {
    const merged = [
      ...(messages ?? []),
      ...pendingMessages.filter((p) =>
        platformFilter === "all" || p.platform === platformFilter
      ),
    ];
    return merged.filter((m: Record<string, any>) => {
      if (platformFilter !== "all" && m.platform !== platformFilter) return false;
      return true;
    });
  }, [messages, pendingMessages, platformFilter]);

  // Thread grouping — memoized to avoid recomputing on every render
  const displayItems = useMemo(() => {
    const threadGroups = new Map<string, Record<string, any>[]>();
    for (const msg of filteredMessages) {
      if (msg.threadId) {
        if (!threadGroups.has(msg.threadId)) {
          threadGroups.set(msg.threadId, []);
        }
        threadGroups.get(msg.threadId)!.push(msg);
      }
    }

    const items: Array<{
      type: "single" | "thread";
      threadId?: string;
      messages: Record<string, any>[];
    }> = [];
    const processedThreads = new Set<string>();
    for (const msg of filteredMessages) {
      if (msg.threadId && !processedThreads.has(msg.threadId)) {
        processedThreads.add(msg.threadId);
        const threadMsgs = threadGroups.get(msg.threadId)!;
        if (threadMsgs.length > 1) {
          items.push({ type: "thread", threadId: msg.threadId, messages: threadMsgs });
        } else {
          items.push({ type: "single", messages: [msg] });
        }
      } else if (!msg.threadId) {
        items.push({ type: "single", messages: [msg] });
      }
    }
    return items;
  }, [filteredMessages]);

  if (!client) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">
          Loading client...
        </div>
      </div>
    );
  }

  const toggleThread = (threadId: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const platforms = [
    ...new Set(
      messages?.map((m: Record<string, any>) => m.platform) ?? []
    ),
  ];

  const initials = client.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const health = client.relationshipHealth ?? 50;
  const healthStatus =
    health >= 70 ? "healthy" : health >= 40 ? "attention" : "at-risk";

  return (
    <div className="max-w-6xl mx-auto p-6 animate-fade-in">
      {/* Back button */}
      <div className="flex items-center justify-between mb-5">
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
          onClick={() => router.push("/clients")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
        </button>
        <button
          onClick={handleArchiveToggle}
          disabled={archiving}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-colors disabled:opacity-50 ${
            client?.isArchived
              ? "border-success/30 text-success hover:bg-success/5"
              : "border-border text-muted-foreground hover:bg-accent"
          }`}
        >
          {archiving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : client?.isArchived ? (
            <ArchiveRestore className="h-3 w-3" />
          ) : (
            <Archive className="h-3 w-3" />
          )}
          {client?.isArchived ? "Restore client" : "Archive client"}
        </button>
      </div>

      {/* Client Header */}
      <div className="flex items-start gap-5 mb-8">
        <div
          className={`w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold ${
            healthStatus === "healthy"
              ? "bg-success/10 text-success"
              : healthStatus === "attention"
                ? "bg-warning/10 text-warning"
                : "bg-urgent/10 text-urgent"
          } ${healthStatus === "at-risk" ? "animate-pulse-glow" : ""}`}
        >
          {initials}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold text-foreground">
            {client.name}
          </h1>
          {client.company && (
            <p className="text-sm text-muted-foreground">{client.company}</p>
          )}
          <div className="flex items-center gap-2.5 mt-3 flex-wrap">
            <StatBadge
              icon={<MessageSquare className="h-3 w-3" />}
              label={`${client.totalMessages} messages`}
            />
            {health > 0 && (
              <StatBadge
                icon={<TrendingUp className="h-3 w-3" />}
                label={`Health: ${health}%`}
                color={healthStatus}
              />
            )}
            {client.totalRevenue !== undefined && (
              <StatBadge
                icon={<DollarSign className="h-3 w-3" />}
                label={`$${client.totalRevenue.toLocaleString()}`}
                color="healthy"
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Info & Identities */}
        <div className="space-y-4">
          {/* Connected Accounts */}
          <div className="surface-raised rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Connected Accounts
              </h3>
              <button
                onClick={() => setAddIdentityOpen(true)}
                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            {identities && identities.length > 0 ? (
              <div className="space-y-2">
                {identities.map((identity: Record<string, any>) => (
                  <div
                    key={identity._id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg transition-all ${
                      identity.isSelected
                        ? "bg-accent/30"
                        : "bg-muted/30 opacity-60"
                    }`}
                  >
                    <PlatformIcon platform={identity.platform} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {identity.displayName}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {identity.email ?? identity.username ?? identity.platformUserId}
                      </div>
                      {!identity.isSelected && (
                        <div className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
                          Sync paused
                        </div>
                      )}
                    </div>
                    {/* Toggle sync */}
                    <button
                      title={identity.isSelected ? "Pause sync" : "Resume sync"}
                      disabled={togglingId === identity._id}
                      onClick={() => handleToggleSync(identity._id, identity.isSelected)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {togglingId === identity._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : identity.isSelected ? (
                        <ToggleRight className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ToggleLeft className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {/* Unlink */}
                    <button
                      title="Unlink from client"
                      disabled={unlinkingId === identity._id}
                      onClick={() => handleUnlink(identity._id, identity.displayName)}
                      className="shrink-0 text-muted-foreground hover:text-urgent transition-colors disabled:opacity-50"
                    >
                      {unlinkingId === identity._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2Off className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-2">
                  No connected accounts
                </p>
                <button
                  onClick={() => setAddIdentityOpen(true)}
                  className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  + Add connection
                </button>
              </div>
            )}
          </div>

          {/* Client Details */}
          <div className="surface-raised rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-display font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Details
            </h3>
            {client.primaryEmail && (
              <DetailRow label="Email" value={client.primaryEmail} />
            )}
            {client.primaryPhone && (
              <DetailRow label="Phone" value={client.primaryPhone} />
            )}
            <DetailRow
              label="First Contact"
              value={new Date(client.firstContactDate).toLocaleDateString()}
            />
            <DetailRow
              label="Last Contact"
              value={formatRelativeTime(client.lastContactDate)}
            />
            {client.tags && client.tags.length > 0 && (
              <div>
                <p className="text-[10px] font-mono text-muted-foreground mb-1">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1">
                  {client.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-border text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {client.notes && (
              <div>
                <p className="text-[10px] font-mono text-muted-foreground mb-1">
                  Notes
                </p>
                <p className="text-sm text-foreground/80">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Commitments Panel */}
          <CommitmentsPanel clientId={clientId} />

          {/* Contracts Panel */}
          <ContractsPanel clientId={clientId} />

          {/* AI Intelligence Panel */}
          <ClientIntelligencePanel intelligence={client.intelligence} />

          {/* AI Skill Alerts for this client */}
          <ClientSkillAlertsPanel clientId={clientId} />

          {/* Thread Summary */}
          <ThreadSummaryPanel clientId={clientId} clientName={client.name} />
        </div>

        {/* Right: Conversation Timeline */}
        <div className="lg:col-span-2">
          <div className="surface-raised rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-0">
              <h3 className="text-sm font-display font-semibold text-foreground">
                Conversation History
              </h3>
              {platforms.length > 1 && (
                <div className="flex items-center gap-1 bg-secondary/60 rounded-lg p-0.5">
                  <button
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                      platformFilter === "all"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setPlatformFilter("all")}
                  >
                    All
                  </button>
                  {platforms.map((p: string) => (
                    <button
                      key={p}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                        platformFilter === p
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setPlatformFilter(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5">
              {displayItems.length > 0 ? (
                <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin">
                  {displayItems.map((item) => {
                    if (item.type === "thread" && item.threadId) {
                      const isCollapsed = collapsedThreads.has(item.threadId);
                      const firstMsg = item.messages[0];
                      return (
                        <div
                          key={item.threadId}
                          className="border border-border/30 rounded-xl overflow-hidden"
                        >
                          <button
                            className="w-full flex items-center gap-2 px-4 py-2.5 bg-accent/40 hover:bg-accent/60 text-left text-xs text-muted-foreground transition-colors"
                            onClick={() => toggleThread(item.threadId!)}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            <PlatformBadge platform={firstMsg.platform} />
                            <span className="font-mono">
                              Thread ({item.messages.length} messages)
                            </span>
                          </button>
                          {!isCollapsed && (
                            <div className="space-y-2 p-2.5">
                              {item.messages.map(
                                (msg: Record<string, any>) => (
                                  <MessageBubble
                                    key={msg._id}
                                    msg={msg}
                                    clientName={client.name}
                                    isSelected={
                                      selectedMessage?._id === msg._id
                                    }
                                    onSelect={() => {
                                      setSelectedMessage(msg);
                                      if (!msg.isRead)
                                        markAsRead({ id: msg._id });
                                    }}
                                    onToggleStar={() =>
                                      toggleStar({ id: msg._id })
                                    }
                                  />
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                    const msg = item.messages[0];
                    return (
                      <MessageBubble
                        key={msg._id}
                        msg={msg}
                        clientName={client.name}
                        isSelected={selectedMessage?._id === msg._id}
                        onSelect={() => {
                          setSelectedMessage(msg);
                          if (!msg.isRead) markAsRead({ id: msg._id });
                        }}
                        onToggleStar={() => toggleStar({ id: msg._id })}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p>No messages yet</p>
                </div>
              )}

              {/* Reply Composer */}
              {selectedMessage && selectedMessage.direction === "inbound" && (
                <>
                  <div className="divider-glow my-5" />
                  <ReplyComposer
                    message={selectedMessage}
                    client={client}
                    onClose={() => setSelectedMessage(null)}
                    onOptimisticSend={handleOptimisticSend}
                    onSendComplete={handleSendComplete}
                    onSendFailed={handleSendFailed}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add identity modal */}
      {user?._id && (
        <AddIdentityModal
          clientId={clientId}
          userId={user._id}
          open={addIdentityOpen}
          onClose={() => setAddIdentityOpen(false)}
        />
      )}
    </div>
  );
}

const StatBadge = memo(function StatBadge({
  icon,
  label,
  color = "default",
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
}) {
  const colors: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    healthy: "bg-success/10 text-success",
    attention: "bg-warning/10 text-warning",
    "at-risk": "bg-urgent/10 text-urgent",
  };

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium ${colors[color] ?? colors["default"]}`}
    >
      {icon}
      {label}
    </div>
  );
});

const PlatformIcon = memo(function PlatformIcon({ platform }: { platform: string }) {
  const configs: Record<string, { bg: string; icon: React.ReactNode }> = {
    gmail: {
      bg: "bg-urgent/10",
      icon: <Mail className="h-4 w-4 text-urgent" />,
    },
    slack: {
      bg: "bg-chart-4/10",
      icon: <MessageSquare className="h-4 w-4 text-chart-4" />,
    },
    whatsapp: {
      bg: "bg-success/10",
      icon: <Phone className="h-4 w-4 text-success" />,
    },
    discord: {
      bg: "bg-primary/10",
      icon: <MessageSquare className="h-4 w-4 text-primary" />,
    },
  };

  const config = configs[platform] ?? {
    bg: "bg-muted",
    icon: <Users className="h-4 w-4 text-muted-foreground" />,
  };

  return (
    <div
      className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}
    >
      {config.icon}
    </div>
  );
});

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

const MessageBubble = memo(function MessageBubble({
  msg,
  clientName,
  isSelected,
  onSelect,
  onToggleStar,
}: {
  msg: Record<string, any>;
  clientName: string;
  isSelected: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
}) {
  return (
    <div
      className={`p-4 rounded-xl border transition-all cursor-pointer ${
        msg.direction === "outbound"
          ? "bg-primary/5 border-primary/10 ml-8"
          : "bg-card border-border/30 mr-8"
      } ${isSelected ? "ring-1 ring-primary/40 glow-primary" : "hover:bg-accent/30"} ${
        msg.isPending ? "opacity-70" : ""
      } ${msg.isFailed ? "border-urgent/40 bg-urgent/5" : ""}`}
      onClick={msg.isPending ? undefined : onSelect}
    >
      <div className="flex items-center gap-2 mb-2">
        <PlatformBadge platform={msg.platform} />
        <span className="text-[10px] text-muted-foreground">
          {msg.direction === "outbound" ? "You" : clientName}
        </span>
        {msg.isPending && !msg.isFailed && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sending...
          </span>
        )}
        {msg.isFailed && (
          <span className="text-[10px] font-medium text-urgent">Failed to send</span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground/60 ml-auto">
          {formatMessageTime(msg.timestamp)}
        </span>
        <button
          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
        >
          <Star
            className={`h-3 w-3 ${
              msg.isStarred
                ? "fill-warning text-warning"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {msg.text}
      </p>
      {/* Attachments */}
      {msg.attachments && msg.attachments.length > 0 && (
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {msg.attachments.map(
            (
              att: { type: string; url: string; filename?: string },
              i: number
            ) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/50 rounded-lg text-[10px] font-mono text-muted-foreground"
              >
                <Paperclip className="h-2.5 w-2.5" />
                {att.filename ?? "Attachment"}
              </div>
            )
          )}
        </div>
      )}
      {/* AI metadata */}
      {msg.aiMetadata && (
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {msg.aiMetadata.priorityScore !== undefined && (
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                msg.aiMetadata.priorityScore >= 80
                  ? "bg-urgent/10 text-urgent"
                  : "bg-primary/10 text-primary"
              }`}
            >
              P{msg.aiMetadata.priorityScore}
            </span>
          )}
          {msg.aiMetadata.sentiment && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-border capitalize text-muted-foreground">
              {msg.aiMetadata.sentiment}
            </span>
          )}
          {msg.aiMetadata.extractedActions?.map(
            (action: string, i: number) => (
              <span
                key={i}
                className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-warning/10 text-warning"
              >
                <Zap className="h-2.5 w-2.5" />
                {action}
              </span>
            )
          )}
          {msg.aiMetadata.scopeCreepDetected && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-urgent/10 text-urgent">
              Scope Creep
            </span>
          )}
        </div>
      )}
    </div>
  );
});

const DetailRow = memo(function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
});
