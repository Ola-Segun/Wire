"use client";

import { memo, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import {
  Inbox,
  AlertTriangle,
  Users,
  Zap,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/date-utils";

export default function DashboardPage() {
  const user = useQuery(api.users.getCurrentUser);
  const stats = useQuery(api.analytics.getDailyStats);
  const clients = useQuery(api.clients.getByUser, { sortBy: "recent" });
  const urgentMessages = useQuery(api.messages.getUrgent);
  const pendingCommitments = useQuery(api.commitments.getPendingWithClients);

  const completeCommitment = useMutation(api.commitments.complete).withOptimisticUpdate(
    (localStore, args) => {
      // Optimistically remove the item from the pending list on checkbox click
      const current = localStore.getQuery(api.commitments.getPendingWithClients, {});
      if (current) {
        localStore.setQuery(
          api.commitments.getPendingWithClients,
          {},
          current.filter((c: any) => c._id !== args.id)
        );
      }
    }
  );

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin pb-28">
    <div className="max-w-7xl mx-auto p-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your clients today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Inbox className="h-5 w-5" />}
          value={stats?.unreadCount ?? 0}
          label="Unread Messages"
          sublabel={
            stats?.messagesToday
              ? `${stats.messagesToday} today`
              : undefined
          }
          color="primary"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          value={stats?.urgentCount ?? 0}
          label="Urgent"
          sublabel={
            stats?.needsAttention
              ? `${stats.needsAttention} clients need attention`
              : undefined
          }
          color="urgent"
        />
        <StatCard
          icon={<Zap className="h-5 w-5" />}
          value={stats?.actionItemCount ?? 0}
          label="Action Items"
          color="warning"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          value={stats?.activeClientCount ?? 0}
          label="Active Clients"
          color="success"
        />
      </div>

      {/* Key Insights */}
      {stats && (stats.urgentCount > 0 || stats.needsAttention > 0) && (
        <div className="surface-raised rounded-xl p-5 mb-8 animate-slide-in">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-warning" />
            </div>
            <span className="text-sm font-display font-semibold text-foreground">
              Key Insights
            </span>
          </div>
          <div className="space-y-2.5">
            {stats.urgentCount > 0 && (
              <div className="flex items-center gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-urgent" />
                <span className="text-foreground/80">
                  {stats.urgentCount} urgent message
                  {stats.urgentCount !== 1 ? "s" : ""} requiring attention
                </span>
              </div>
            )}
            {stats.needsAttention > 0 && (
              <div className="flex items-center gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                <span className="text-foreground/80">
                  {stats.needsAttention} client
                  {stats.needsAttention !== 1 ? "s" : ""} with low
                  relationship health
                </span>
              </div>
            )}
            {stats.sentiments?.frustrated && (
              <div className="flex items-center gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-urgent" />
                <span className="text-foreground/80">
                  {stats.sentiments.frustrated} frustrated message
                  {stats.sentiments.frustrated !== 1 ? "s" : ""} detected
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Priority Inbox */}
      <div className="surface-raised rounded-xl p-5 mb-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-display font-semibold text-foreground">
              Priority Inbox
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Messages sorted by AI priority score
            </p>
          </div>
          <Link
            href="/inbox"
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {urgentMessages && urgentMessages.length > 0 ? (
          <div className="space-y-2">
            {urgentMessages
              .slice(0, 5)
              .map((msg: Record<string, any>, index: number) => (
                <Link
                  key={msg._id}
                  href={`/clients/${msg.clientId}`}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border/30 hover:bg-accent/50 transition-all cursor-pointer relative group animate-slide-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Priority bar */}
                  <div
                    className={`priority-bar ${
                      (msg.aiMetadata?.priorityScore ?? 0) >= 80
                        ? "bg-urgent"
                        : (msg.aiMetadata?.priorityScore ?? 0) >= 50
                          ? "bg-primary"
                          : "bg-muted-foreground"
                    }`}
                  />

                  <div className="flex-1 min-w-0 pl-2">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {msg.clientName ?? "Unknown"}
                      </span>
                      <PlatformBadge platform={msg.platform} />
                      {msg.aiMetadata?.priorityScore && (
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
                      {msg.aiMetadata?.sentiment && (
                        <SentimentIndicator
                          sentiment={msg.aiMetadata.sentiment}
                        />
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">
                      {msg.text}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatRelativeTime(msg.timestamp)}
                      </span>
                      {msg.aiMetadata?.extractedActions?.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-primary bg-primary/8 px-2 py-0.5 rounded-full font-medium">
                          <Zap className="h-2.5 w-2.5" />
                          {msg.aiMetadata.extractedActions.length} action
                          {msg.aiMetadata.extractedActions.length !== 1
                            ? "s"
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 mt-1 shrink-0 group-hover:text-primary transition-colors" />
                </Link>
              ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p>No urgent messages. You&apos;re all caught up!</p>
          </div>
        )}
      </div>

      {/* Action Items — live from commitments table, interactive checkboxes */}
      {pendingCommitments && pendingCommitments.length > 0 && (
        <div className="surface-raised rounded-xl p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-warning" />
              </div>
              <span className="text-sm font-display font-semibold text-foreground">
                Action Items
              </span>
              <span className="text-[11px] font-mono bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">
                {pendingCommitments.length}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            {pendingCommitments.map((c: Record<string, any>, i: number) => (
              <div
                key={c._id}
                className="group flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors animate-slide-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {/* Checkbox — marks commitment complete immediately */}
                <button
                  onClick={() => completeCommitment({ id: c._id })}
                  className="mt-0.5 w-[18px] h-[18px] rounded-md border-2 border-border hover:border-success hover:bg-success/10 transition-all shrink-0 flex items-center justify-center group-hover:border-success/60"
                  title="Mark as done"
                >
                  <CheckCircle2 className="h-3 w-3 text-success opacity-0 group-hover:opacity-60 transition-opacity" />
                </button>

                {/* Text + attribution */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/80 leading-snug">{c.text}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {/* Client name */}
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {c.clientName}
                    </span>
                    {c.type && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">
                        {c.type}
                      </span>
                    )}
                    {/* Live due-date countdown — only shown when AI extracted a date */}
                    {c.dueDate && <DueCountdown dueDate={c.dueDate} confidence={c.dueDateConfidence} />}
                  </div>
                  {/* Source message snippet — the short message that triggered this commitment */}
                  {c.sourceMessageText && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-snug line-clamp-2 border-l border-border/40 pl-2 italic">
                      <MessageSquare className="h-2.5 w-2.5 inline mr-1 opacity-60" />
                      &ldquo;{c.sourceMessageText}&rdquo;
                    </p>
                  )}
                </div>

                {/* Link to client page */}
                <Link
                  href={`/clients/${c.clientId}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title={`Go to ${c.clientName}`}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client Overview */}
      <div className="surface-raised rounded-xl p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-display font-semibold text-foreground">
            Clients
          </h2>
          <Link
            href="/clients"
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {clients && clients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {clients
              .slice(0, 6)
              .map((client: Record<string, any>, index: number) => {
                const health = client.relationshipHealth ?? 50;
                const status =
                  health >= 70
                    ? "healthy"
                    : health >= 40
                      ? "attention"
                      : "at-risk";
                return (
                  <Link
                    key={client._id}
                    href={`/clients/${client._id}`}
                    className="glass-hover p-4 rounded-xl cursor-pointer block animate-slide-in"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${
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
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {client.name}
                        </div>
                        {client.company && (
                          <div className="text-[11px] text-muted-foreground">
                            {client.company}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        {client.totalMessages} msgs
                      </span>
                      {health > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 rounded-full bg-border/30">
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
                            className={`font-mono font-bold ${
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
                      )}
                    </div>
                  </Link>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p>No clients yet. Connect a platform to get started!</p>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

const StatCard = memo(function StatCard({
  icon,
  value,
  label,
  sublabel,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  sublabel?: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    urgent: "bg-urgent/10 text-urgent",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
  };

  return (
    <div className="surface-raised rounded-xl p-5">
      <div className="flex items-center gap-4">
        <div
          className={`w-11 h-11 rounded-lg flex items-center justify-center ${colorClasses[color]}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-2xl font-mono font-bold text-foreground">
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sublabel && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              {sublabel}
            </p>
          )}
        </div>
      </div>
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

// ─── DueCountdown ─────────────────────────────────────────────────────────────
// Live-updating countdown chip for AI-extracted due dates.
// Updates every minute via setInterval — no server round-trip needed.
// Color: red = overdue, amber = ≤2h, yellow = ≤24h, muted = further out.
// Shows confidence indicator when date is inferred (not explicitly stated).

function formatCountdown(msUntilDue: number): { label: string; color: string } {
  const abs = Math.abs(msUntilDue);
  const mins = Math.floor(abs / 60_000);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);

  if (msUntilDue < 0) {
    // Overdue
    if (days > 0) return { label: `overdue ${days}d`, color: "text-urgent bg-urgent/10" };
    if (hours > 0) return { label: `overdue ${hours}h`, color: "text-urgent bg-urgent/10" };
    return { label: `overdue ${mins}m`, color: "text-urgent bg-urgent/10" };
  }

  if (hours < 2) return { label: `due in ${mins}m`, color: "text-urgent bg-urgent/10" };
  if (hours < 24) return { label: `due in ${hours}h`, color: "text-warning bg-warning/10" };
  if (days < 3) return { label: `due in ${days}d`, color: "text-warning bg-warning/10" };
  return { label: `due in ${days}d`, color: "text-muted-foreground bg-secondary" };
}

const DueCountdown = memo(function DueCountdown({
  dueDate,
  confidence,
}: {
  dueDate: number;
  confidence?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { label, color } = formatCountdown(dueDate - now);

  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${color}`}>
      <Clock className="h-2.5 w-2.5 shrink-0" />
      {label}
      {confidence === "inferred" && (
        <span className="opacity-50 ml-0.5" title="AI-inferred date">~</span>
      )}
    </span>
  );
});

const SentimentIndicator = memo(function SentimentIndicator({ sentiment }: { sentiment: string }) {
  const config: Record<string, { label: string; color: string }> = {
    positive: { label: "Positive", color: "text-success" },
    neutral: { label: "Neutral", color: "text-muted-foreground" },
    negative: { label: "Negative", color: "text-urgent" },
    frustrated: { label: "Frustrated", color: "text-urgent" },
  };

  const c = config[sentiment];
  if (!c) return null;

  return (
    <span className="flex items-center gap-1">
      <span
        className={`w-1 h-1 rounded-full ${
          sentiment === "positive"
            ? "bg-success"
            : sentiment === "negative" || sentiment === "frustrated"
              ? "bg-urgent"
              : "bg-muted-foreground"
        }`}
      />
      <span className={`text-[10px] font-medium ${c.color}`}>{c.label}</span>
    </span>
  );
});
