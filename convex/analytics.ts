import { v } from "convex/values";
import { query } from "./_generated/server";

// Get daily stats for the dashboard
export const getDailyStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return null;

    // ── Active clients (small set per freelancer: 10-200) ────────────────────
    // Collect is safe here — this set is bounded by definition.
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", user._id).eq("isArchived", false)
      )
      .collect();

    // ── Recent messages (last 30 days via by_user_timestamp index) ───────────
    // Uses the new composite index so we read ONLY messages within the window,
    // not a full-table scan capped at an arbitrary number.
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const todayStart    = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Cap at 500 messages — enough for stats on any active user, prevents
    // runaway reads for users who imported thousands of historical messages.
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_user_timestamp", (q) =>
        q.eq("userId", user._id).gte("timestamp", thirtyDaysAgo)
      )
      .order("desc")
      .take(500);

    // ── Unread count ─────────────────────────────────────────────────────────
    // Separate index query — capped at 999 for badge display.
    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .take(999);

    // ── Pending commitments ──────────────────────────────────────────────────
    const pendingCommitments = await ctx.db
      .query("commitments")
      .withIndex("by_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .take(999);

    // ── Stats derived from clients (accurate totals, no scan needed) ─────────
    // client.totalMessages is kept in sync on every message.create, so summing
    // is far cheaper and more accurate than counting from the messages table.
    const totalMessages = clients.reduce((sum, c) => sum + (c.totalMessages ?? 0), 0);

    // ── Stats derived from recent messages (windowed) ────────────────────────
    const urgentCount   = recentMessages.filter(
      (m) => m.aiMetadata?.priorityScore && m.aiMetadata.priorityScore >= 70
    ).length;

    const messagesToday = recentMessages.filter(
      (m) => m.timestamp >= todayStart.getTime()
    ).length;

    // Sentiment breakdown over the 30-day window
    const sentiments = recentMessages.reduce(
      (acc, m) => {
        const sentiment = m.aiMetadata?.sentiment;
        if (sentiment) acc[sentiment] = (acc[sentiment] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Clients needing attention — derived from pre-computed health score
    const needsAttention = clients.filter(
      (c) => c.relationshipHealth !== undefined && c.relationshipHealth < 50
    );

    return {
      totalMessages,
      messagesToday,
      unreadCount:       unreadMessages.length,
      urgentCount,
      actionItemCount:   pendingCommitments.length,
      activeClientCount: clients.length,
      sentiments,
      needsAttention:    needsAttention.length,
    };
  },
});
