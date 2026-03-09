import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

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
      return existing._id;
    }

    return await ctx.db.insert("conversation_summaries", {
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
