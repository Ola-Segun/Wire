import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

// ============================================
// HELPERS
// ============================================

async function resolveUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
}

// ============================================
// CONVERSATION SUMMARIES — Cached thread summaries
// ============================================
// Persisted by the thread_summarizer skill to avoid re-calling Haiku
// for conversations that haven't changed since the last summary.

// Upsert: create or update a summary for a conversation.
// Internal — called by the thread summarizer action, not by users.
export const upsert = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    clientId: v.id("clients"),
    summary: v.string(),
    arc: v.string(),
    openCommitments: v.number(),
    decisionsMade: v.array(v.string()),
    unresolvedTopics: v.array(v.string()),
    toneShift: v.optional(v.string()),
    messageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_summaries")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .first();

    const now = Date.now();
    const previousArc = existing?.arc;

    let summaryId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        summary: args.summary,
        arc: args.arc,
        openCommitments: args.openCommitments,
        decisionsMade: args.decisionsMade,
        unresolvedTopics: args.unresolvedTopics,
        toneShift: args.toneShift,
        messageCount: args.messageCount,
        updatedAt: now,
      });
      summaryId = existing._id;
    } else {
      summaryId = await ctx.db.insert("conversation_summaries", {
        userId: args.userId,
        conversationId: args.conversationId,
        clientId: args.clientId,
        summary: args.summary,
        arc: args.arc,
        openCommitments: args.openCommitments,
        decisionsMade: args.decisionsMade,
        unresolvedTopics: args.unresolvedTopics,
        toneShift: args.toneShift,
        messageCount: args.messageCount,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ── Offboarding Intelligence ─────────────────────────────────────────────
    // When a conversation transitions into the "closing" arc for the first time,
    // automatically schedule a 30-day and 90-day relationship check-in.
    // Guards: only fire once per client (check for existing pending check-ins).
    if (args.arc === "closing" && previousArc !== "closing") {
      const existingCheckins = await ctx.db
        .query("commitments")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();

      const hasPendingCheckin = existingCheckins.some(
        (c) => c.type === "check_in" && c.status === "pending"
      );

      if (!hasPendingCheckin) {
        const client = await ctx.db.get(args.clientId);
        const clientName = client?.name ?? "the client";
        const thirtyDays  = now + 30 * 24 * 60 * 60 * 1000;
        const ninetyDays  = now + 90 * 24 * 60 * 60 * 1000;

        await ctx.db.insert("commitments", {
          userId: args.userId,
          clientId: args.clientId,
          text: `30-day check-in with ${clientName} — nurture the relationship post-project`,
          type: "check_in",
          status: "pending",
          dueDate: thirtyDays,
          createdAt: now,
        });

        await ctx.db.insert("commitments", {
          userId: args.userId,
          clientId: args.clientId,
          text: `90-day check-in with ${clientName} — portfolio request / referral opportunity`,
          type: "check_in",
          status: "pending",
          dueDate: ninetyDays,
          createdAt: now,
        });
      }
    }

    return summaryId;
  },
});

// Get cached summary for a conversation (user-facing)
export const getByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return null;

    const summary = await ctx.db
      .query("conversation_summaries")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .first();

    if (!summary || summary.userId !== user._id) return null;
    return summary;
  },
});

// Get recent summaries across all clients for the current user (workspace widget)
export const getForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const summaries = await ctx.db
      .query("conversation_summaries")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 10);

    return summaries;
  },
});

// Get all summaries for a client (user-facing)
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const summaries = await ctx.db
      .query("conversation_summaries")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    return summaries.filter((s) => s.userId === user._id);
  },
});

// Internal query: fetch a summary by conversationId without auth.
// Used by autoSummarizeForClient to check if a summary is stale.
export const getByConversationInternal = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversation_summaries")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .first();
  },
});
