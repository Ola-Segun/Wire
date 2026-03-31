"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowLeft,
  MessageSquare,
  Star,
  Zap,
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
  Edit2,
  Check,
  X,
} from "lucide-react";
import { PlatformIcon, PlatformBadge } from "@/lib/platform-icons";
import { SentimentTrajectoryChart } from "@/components/dashboard/sentiment-trajectory-chart";
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
import { DiscreteTabs } from "@/components/ui/discrete-tabs";

const ReplyComposer = dynamic(
  () => import("@/components/dashboard/reply-composer").then((m) => ({ default: m.ReplyComposer })),
  { loading: () => <div className="animate-pulse h-40 bg-accent/30 rounded-lg" /> }
);

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { user } = useCurrentUser();

  const [selectedMessage, setSelectedMessage] = useState<Record<string, any> | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set());
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [addIdentityOpen, setAddIdentityOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [messageLimit, setMessageLimit] = useState(50);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    company: "",
    primaryEmail: "",
    primaryPhone: "",
    totalRevenue: "",
    tags: "",
    notes: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [activePageTab, setActivePageTab] = useState("overview");

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
  const identities = useQuery(api.identities.getByClient, { clientId: clientId as any });
  const queryArgs = useMemo(
    () => ({ clientId: clientId as any, limit: messageLimit }),
    [clientId, messageLimit]
  );
  const messagesResult = useQuery(api.messages.getByClient, queryArgs);
  const messages = messagesResult?.messages ?? undefined;
  const hasMore = messagesResult?.hasMore ?? false;
  const sentimentData = useQuery(api.messages.getSentimentData, { clientId: clientId as any });
  const updateClient = useMutation(api.clients.update);

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

  const handleEditStart = useCallback(() => {
    if (!client) return;
    setEditForm({
      name: client.name ?? "",
      company: client.company ?? "",
      primaryEmail: client.primaryEmail ?? "",
      primaryPhone: client.primaryPhone ?? "",
      totalRevenue: client.totalRevenue?.toString() ?? "",
      tags: client.tags?.join(", ") ?? "",
      notes: client.notes ?? "",
    });
    setEditMode(true);
  }, [client]);

  const handleEditSave = useCallback(async () => {
    setSavingProfile(true);
    try {
      await updateClient({
        id: clientId as any,
        name: editForm.name || undefined,
        company: editForm.company || undefined,
        primaryEmail: editForm.primaryEmail || undefined,
        primaryPhone: editForm.primaryPhone || undefined,
        totalRevenue: editForm.totalRevenue ? parseFloat(editForm.totalRevenue) : undefined,
        tags: editForm.tags ? editForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        notes: editForm.notes || undefined,
      });
      setEditMode(false);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSavingProfile(false);
    }
  }, [clientId, editForm, updateClient]);

  // Merge real messages with optimistic pending — memoized; must be before early returns
  const filteredMessages = useMemo(() => {
    const merged = [
      ...(messages ?? []),
      ...pendingMessages.filter((p) =>
        platformFilter === "all" || p.platform === platformFilter
      ),
    ];
    return merged.filter((m: Record<string, any>) =>
      platformFilter === "all" || m.platform === platformFilter
    );
  }, [messages, pendingMessages, platformFilter]);

  // Thread grouping — memoized
  const displayItems = useMemo(() => {
    const threadGroups = new Map<string, Record<string, any>[]>();
    for (const msg of filteredMessages) {
      if (msg.threadId) {
        if (!threadGroups.has(msg.threadId)) threadGroups.set(msg.threadId, []);
        threadGroups.get(msg.threadId)!.push(msg);
      }
    }
    const items: Array<{ type: "single" | "thread"; threadId?: string; messages: Record<string, any>[] }> = [];
    const processedThreads = new Set<string>();
    for (const msg of filteredMessages) {
      if (msg.threadId && !processedThreads.has(msg.threadId)) {
        processedThreads.add(msg.threadId);
        const threadMsgs = threadGroups.get(msg.threadId)!;
        items.push(
          threadMsgs.length > 1
            ? { type: "thread", threadId: msg.threadId, messages: threadMsgs }
            : { type: "single", messages: [msg] }
        );
      } else if (!msg.threadId) {
        items.push({ type: "single", messages: [msg] });
      }
    }
    return items;
  }, [filteredMessages]);

  if (!client) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading client…</div>
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

  const platforms = [...new Set(messages?.map((m: Record<string, any>) => m.platform) ?? [])];

  const initials = client.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const health = client.relationshipHealth ?? 50;
  const healthStatus = health >= 70 ? "healthy" : health >= 40 ? "attention" : "at-risk";

  return (
    <div className="h-full w-full flex flex-col bg-background/50 animate-fade-in">

      {/* ─── Header ─── */}
      <div className="shrink-0 px-5 py-3.5 border-b border-border/40 flex items-center justify-between gap-4 bg-card shadow-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/clients")}
            title="Back to Clients"
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-accent/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div
            className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shadow-sm ${
              healthStatus === "healthy"
                ? "bg-success/10 text-success border border-success/20"
                : healthStatus === "attention"
                  ? "bg-warning/10 text-warning border border-warning/20"
                  : "bg-urgent/10 text-urgent border border-urgent/20"
            } ${healthStatus === "at-risk" ? "animate-pulse-glow" : ""}`}
          >
            {initials}
          </div>

          <div className="min-w-0">
            <h1 className="text-base font-display font-bold text-foreground leading-tight truncate">
              {client.name}
            </h1>
            {client.company && (
              <p className="text-[11px] text-muted-foreground truncate">{client.company}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <StatBadge icon={<MessageSquare className="h-3 w-3" />} label={`${client.totalMessages} msgs`} />
          {health > 0 && (
            <StatBadge
              icon={<TrendingUp className="h-3 w-3" />}
              label={`${health}% Health`}
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

          <div className="h-4 w-px bg-border/60 mx-1" />

          <button
            onClick={handleArchiveToggle}
            disabled={archiving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-semibold border transition-all disabled:opacity-50 ${
              client.isArchived
                ? "border-success/30 text-success hover:bg-success/10"
                : "border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {archiving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : client.isArchived ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {client.isArchived ? "Restore" : "Archive"}
          </button>
        </div>
      </div>

      {/* ─── Tab Area ─── */}
      <div className="flex-1 min-h-0 px-4 lg:px-5 pt-3 pb-0 flex flex-col">
        <DiscreteTabs
          activeTab={activePageTab}
          onTabChange={setActivePageTab}
          className="h-full flex-1 min-h-0"
          tabAlignment="end"
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                /* ── 3-Column Overview Layout ── */
                <div className="h-full flex flex-col lg:flex-row gap-3 lg:gap-4 overflow-hidden mt-2">

                  {/* Left: Connections + Alerts */}
                  <div className="w-full lg:w-[256px] xl:w-68 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-thin pb-20 lg:pb-3">

                    {/* Connected Accounts */}
                    <div className="surface-raised rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-display font-semibold text-foreground flex items-center gap-2">
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
                        <div className="space-y-1.5">
                          {identities.map((identity: Record<string, any>) => (
                            <div
                              key={identity._id}
                              className={`flex items-center gap-2 p-2 rounded-lg transition-all ${
                                identity.isSelected ? "bg-accent/30" : "bg-muted/30 opacity-60"
                              }`}
                            >
                              <PlatformIcon platform={identity.platform} />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-foreground truncate">
                                  {identity.displayName}
                                </div>
                                <div className="text-[10px] font-mono text-muted-foreground truncate">
                                  {identity.email ?? identity.username ?? identity.platformUserId}
                                </div>
                                {!identity.isSelected && (
                                  <div className="text-[9px] font-mono text-muted-foreground/60">
                                    Sync paused
                                  </div>
                                )}
                              </div>
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
                        <div className="text-center py-3">
                          <p className="text-xs text-muted-foreground mb-2">No connected accounts</p>
                          <button
                            onClick={() => setAddIdentityOpen(true)}
                            className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                          >
                            + Add connection
                          </button>
                        </div>
                      )}
                    </div>

                    {/* AI Skill Alerts */}
                    <ClientSkillAlertsPanel clientId={clientId} />
                  </div>

                  {/* Center: Conversation Timeline */}
                  <div className="flex-1 min-w-0 flex flex-col bg-card/60 backdrop-blur-xl rounded-2xl border border-border/40 shadow-sm overflow-hidden pb-20 lg:pb-0 h-full">

                    {/* Timeline Header */}
                    <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/40">
                      <h3 className="text-xs font-display font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        Conversation
                      </h3>
                      {platforms.length > 1 && (
                        <div className="flex items-center gap-1 bg-secondary/80 rounded-lg p-0.5">
                          <FilterBtn active={platformFilter === "all"} onClick={() => setPlatformFilter("all")}>
                            All
                          </FilterBtn>
                          {platforms.map((p: string) => (
                            <FilterBtn key={p} active={platformFilter === p} onClick={() => setPlatformFilter(p)}>
                              {p}
                            </FilterBtn>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 flex flex-col">
                      <div className="flex-1">
                        {displayItems.length > 0 ? (
                          <div className="space-y-3">
                            {displayItems.map((item) => {
                              if (item.type === "thread" && item.threadId) {
                                const isCollapsed = collapsedThreads.has(item.threadId);
                                const firstMsg = item.messages[0];
                                return (
                                  <div key={item.threadId} className="border border-border/30 rounded-xl overflow-hidden">
                                    <button
                                      className="w-full flex items-center gap-2 px-4 py-2 bg-accent/40 hover:bg-accent/60 text-left text-xs text-muted-foreground transition-colors"
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
                                        {item.messages.map((msg: Record<string, any>) => (
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
                                        ))}
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
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
                            <MessageSquare className="h-10 w-10 mb-3 text-muted-foreground/30" />
                            <p className="text-sm">No messages yet</p>
                          </div>
                        )}

                        {hasMore && (
                          <div className="flex justify-center pt-4 pb-2">
                            <button
                              onClick={() => setMessageLimit((l) => l + 50)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border/40 hover:border-border hover:bg-accent/50 transition-colors bg-card/50 backdrop-blur-sm shadow-sm"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                              Load older messages
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Reply Composer */}
                      {selectedMessage && selectedMessage.direction === "inbound" && (
                        <div className="shrink-0 mt-4 animate-slide-up bg-card rounded-xl border border-border/50 shadow-lg overflow-hidden">
                          <ReplyComposer
                            message={selectedMessage}
                            client={client}
                            onClose={() => setSelectedMessage(null)}
                            onOptimisticSend={handleOptimisticSend}
                            onSendComplete={handleSendComplete}
                            onSendFailed={handleSendFailed}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Commitments */}
                  <div className="hidden lg:flex w-[256px] xl:w-68 shrink-0 flex-col gap-3 overflow-y-auto scrollbar-thin pb-3">
                    <CommitmentsPanel clientId={clientId} />
                  </div>
                </div>
              ),
            },
            {
              id: "insights",
              label: "Insights & Details",
              content: (
                <div className="h-full overflow-y-auto scrollbar-thin pb-24 mt-2">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">

                    {/* Column 1: AI Intelligence + Sentiment */}
                    <div className="flex flex-col gap-4">
                      <ClientIntelligencePanel intelligence={client.intelligence} />

                      {sentimentData && sentimentData.length >= 3 && (
                        <div className="surface-raised rounded-xl p-4 border border-border/40 shadow-sm bg-card/60 backdrop-blur-md">
                          <h3 className="text-xs font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            Sentiment Trajectory
                          </h3>
                          <SentimentTrajectoryChart
                            data={sentimentData}
                            intelligenceTrend={client.intelligence?.sentimentTrend}
                            height={110}
                            showXAxis={false}
                          />
                        </div>
                      )}
                    </div>

                    {/* Column 2: Thread Summary + Contracts */}
                    <div className="flex flex-col gap-4">
                      <ThreadSummaryPanel clientId={clientId} clientName={client.name} />
                      <ContractsPanel clientId={clientId} />
                    </div>

                    {/* Column 3: Client Details + Edit */}
                    <div className="flex flex-col gap-4">
                      <div className="surface-raised rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-display font-semibold text-foreground flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            Client Details
                          </h3>
                          {!editMode ? (
                            <button
                              onClick={handleEditStart}
                              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 className="h-3 w-3" /> Edit
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleEditSave}
                                disabled={savingProfile}
                                className="flex items-center gap-1 text-[10px] font-medium text-success hover:text-success/80 transition-colors disabled:opacity-50"
                              >
                                {savingProfile ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Save
                              </button>
                              <button
                                onClick={() => setEditMode(false)}
                                disabled={savingProfile}
                                className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              >
                                <X className="h-3 w-3" /> Cancel
                              </button>
                            </div>
                          )}
                        </div>

                        {editMode ? (
                          <div className="space-y-3">
                            <EditField label="Name" value={editForm.name} onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
                            <EditField label="Company" value={editForm.company} onChange={(v) => setEditForm((f) => ({ ...f, company: v }))} placeholder="e.g. Acme Corp" />
                            <EditField label="Email" value={editForm.primaryEmail} onChange={(v) => setEditForm((f) => ({ ...f, primaryEmail: v }))} type="email" />
                            <EditField label="Phone" value={editForm.primaryPhone} onChange={(v) => setEditForm((f) => ({ ...f, primaryPhone: v }))} type="tel" />
                            <EditField label="Revenue ($)" value={editForm.totalRevenue} onChange={(v) => setEditForm((f) => ({ ...f, totalRevenue: v }))} type="number" placeholder="0" />
                            <EditField label="Tags" value={editForm.tags} onChange={(v) => setEditForm((f) => ({ ...f, tags: v }))} placeholder="comma-separated" />
                            <div>
                              <p className="text-[10px] font-mono text-muted-foreground mb-1">Notes</p>
                              <textarea
                                rows={3}
                                value={editForm.notes}
                                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                                className="w-full text-sm bg-accent/30 border border-border/50 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none text-foreground placeholder:text-muted-foreground"
                                placeholder="Internal notes about this client…"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {client.primaryEmail && <DetailRow label="Email" value={client.primaryEmail} />}
                            {client.primaryPhone && <DetailRow label="Phone" value={client.primaryPhone} />}
                            <DetailRow label="First Contact" value={new Date(client.firstContactDate).toLocaleDateString()} />
                            <DetailRow label="Last Contact" value={formatRelativeTime(client.lastContactDate)} />
                            {client.tags && client.tags.length > 0 && (
                              <div>
                                <p className="text-[10px] font-mono text-muted-foreground mb-1">Tags</p>
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
                                <p className="text-[10px] font-mono text-muted-foreground mb-1">Notes</p>
                                <p className="text-sm text-foreground/80">{client.notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>

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

// ── Small sub-components ────────────────────────────────────────────────────

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
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
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium ${colors[color] ?? colors["default"]}`}>
      {icon}
      {label}
    </div>
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
      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
        msg.direction === "outbound"
          ? "bg-primary/5 border-primary/10 ml-6"
          : "bg-card border-border/30 mr-6"
      } ${isSelected ? "ring-1 ring-primary/40 glow-primary" : "hover:bg-accent/30"} ${
        msg.isPending ? "opacity-70" : ""
      } ${msg.isFailed ? "border-urgent/40 bg-urgent/5" : ""}`}
      onClick={msg.isPending ? undefined : onSelect}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <PlatformBadge platform={msg.platform} />
        <span className="text-[10px] text-muted-foreground">
          {msg.direction === "outbound" ? "You" : clientName}
        </span>
        {msg.isPending && !msg.isFailed && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sending…
          </span>
        )}
        {msg.isFailed && (
          <span className="text-[10px] font-medium text-urgent">Failed to send</span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground/60 ml-auto">
          {formatMessageTime(msg.timestamp)}
        </span>
        <button
          className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
          onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
        >
          <Star className={`h-3 w-3 ${msg.isStarred ? "fill-warning text-warning" : "text-muted-foreground/30"}`} />
        </button>
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{msg.text}</p>

      {msg.attachments && msg.attachments.length > 0 && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {msg.attachments.map((att: { type: string; url: string; filename?: string }, i: number) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/50 rounded-lg text-[10px] font-mono text-muted-foreground">
              <Paperclip className="h-2.5 w-2.5" />
              {att.filename ?? "Attachment"}
            </div>
          ))}
        </div>
      )}

      {msg.aiMetadata && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {msg.aiMetadata.priorityScore !== undefined && (
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
              msg.aiMetadata.priorityScore >= 80 ? "bg-urgent/10 text-urgent" : "bg-primary/10 text-primary"
            }`}>
              P{msg.aiMetadata.priorityScore}
            </span>
          )}
          {msg.aiMetadata.sentiment && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-border capitalize text-muted-foreground">
              {msg.aiMetadata.sentiment}
            </span>
          )}
          {msg.aiMetadata.extractedActions?.map((action: string, i: number) => (
            <span key={i} className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-warning/10 text-warning">
              <Zap className="h-2.5 w-2.5" />
              {action}
            </span>
          ))}
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

const EditField = memo(function EditField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-mono text-muted-foreground mb-1">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm bg-accent/30 border border-border/50 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
});
