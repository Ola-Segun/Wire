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

    // Get all messages for this user
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(500);

    // Get unread count
    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();

    // Get active clients
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", user._id).eq("isArchived", false)
      )
      .collect();

    // Calculate stats
    const urgentCount = allMessages.filter(
      (m) => m.aiMetadata?.priorityScore && m.aiMetadata.priorityScore >= 70
    ).length;

    // Count pending commitments (the source of truth for "action items").
    // Previously this read raw aiMetadata.extractedActions which never reflects
    // completion — commitments table is the correct, up-to-date source.
    const pendingCommitments = await ctx.db
      .query("commitments")
      .withIndex("by_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .collect();

    const totalMessages = allMessages.length;

    // Messages today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const messagesToday = allMessages.filter(
      (m) => m.timestamp >= todayStart.getTime()
    ).length;

    // Sentiment breakdown
    const sentiments = allMessages.reduce(
      (acc, m) => {
        const sentiment = m.aiMetadata?.sentiment;
        if (sentiment) {
          acc[sentiment] = (acc[sentiment] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );

    // Clients needing attention (low health or frustrated sentiment)
    const needsAttention = clients.filter(
      (c) => c.relationshipHealth !== undefined && c.relationshipHealth < 50
    );

    return {
      totalMessages,
      messagesToday,
      unreadCount: unreadMessages.length,
      urgentCount,
      actionItemCount: pendingCommitments.length,
      activeClientCount: clients.length,
      sentiments,
      needsAttention: needsAttention.length,
    };
  },
});
