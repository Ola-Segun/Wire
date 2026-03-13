import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ============================================
// HELPERS
// ============================================

// Resolve current user from auth identity
async function resolveUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
}

// ============================================
// THREAD RESOLUTION — Core of Conversation Continuity
// ============================================
// This is the foundation for wire2.md's "Conversation Continuity Threads":
// When a message arrives, we try to find an existing conversation to attach it to.
// Matching strategy:
//   1. Exact threadId match (e.g., Gmail threadId, Slack thread_ts)
//   2. Same client + recent timeframe = merge into active conversation
//   3. No match = create a new conversation
//
// TODO [AI PHASE]: Add semantic similarity matching — if AI detects the topic
// matches an existing conversation, merge even without a matching threadId.

/**
 * Resolves (find-or-create) a conversation for an incoming message.
 * Called by sync adapters when processing new messages.
 *
 * Strategy:
 *  1. If threadId is provided, look for a conversation with a matching threadRef
 *  2. If no match, find an "active" conversation for this client within 24h
 *  3. If still no match, create a new conversation
 */
export const resolveForMessage = mutation({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
    platform: v.string(),
    threadId: v.optional(v.string()),
    subject: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Single DB fetch covers both strategy 1 and 2.
    // Capped at 200 to bound bandwidth — no client realistically has more.
    // Previously this ran two separate .collect() calls per message (2× bandwidth).
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_client_status", (q) =>
        q.eq("clientId", args.clientId).eq("status", "active")
      )
      .order("desc")
      .take(200);

    // Strategy 1: Exact thread reference match
    if (args.threadId) {
      const threadMatch = conversations.find((c) =>
        c.threadRefs.some(
          (ref) =>
            ref.platform === args.platform && ref.threadId === args.threadId
        )
      );

      if (threadMatch) {
        const platforms = threadMatch.platforms.includes(args.platform)
          ? threadMatch.platforms
          : [...threadMatch.platforms, args.platform];

        await ctx.db.patch(threadMatch._id, {
          messageCount: threadMatch.messageCount + 1,
          lastMessageAt: Math.max(threadMatch.lastMessageAt, args.timestamp),
          platforms,
          status: "active",
          updatedAt: now,
        });

        return threadMatch._id;
      }
    }

    // Strategy 2: Find active conversation for this client within 72 hours.
    // 72h covers normal project gaps (client reviews deliverables over 2 days)
    // without creating a new conversation on every reply after a brief pause.
    const ACTIVE_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours
    const activeConversations = conversations;

    const recentActive = activeConversations.find(
      (c) =>
        c.status === "active" &&
        args.timestamp - c.lastMessageAt < ACTIVE_WINDOW_MS
    );

    if (recentActive) {
      const platforms = recentActive.platforms.includes(args.platform)
        ? recentActive.platforms
        : [...recentActive.platforms, args.platform];

      const threadRefs = args.threadId
        ? [
            ...recentActive.threadRefs.filter(
              (r) =>
                !(
                  r.platform === args.platform &&
                  r.threadId === args.threadId
                )
            ),
            { platform: args.platform, threadId: args.threadId },
          ]
        : recentActive.threadRefs;

      await ctx.db.patch(recentActive._id, {
        messageCount: recentActive.messageCount + 1,
        lastMessageAt: Math.max(recentActive.lastMessageAt, args.timestamp),
        platforms,
        threadRefs,
        updatedAt: now,
      });

      return recentActive._id;
    }

    // Strategy 3: Create a new conversation
    const threadRefs = args.threadId
      ? [{ platform: args.platform, threadId: args.threadId }]
      : [];

    const conversationId = await ctx.db.insert("conversations", {
      userId: args.userId,
      clientId: args.clientId,
      subject: args.subject,
      platforms: [args.platform],
      messageCount: 1,
      lastMessageAt: args.timestamp,
      firstMessageAt: args.timestamp,
      status: "active",
      threadRefs,
      createdAt: now,
      updatedAt: now,
    });

    return conversationId;
  },
});

// ============================================
// INTERNAL — Called by cron to mark dormant conversations
// ============================================

// Mark conversations as dormant if no messages for 7 days.
// OPTIMISED: bounded .take(500) instead of unbounded .collect() to prevent
// catastrophic full-table reads on the daily cron run.
// NOTE: adding .index("by_status_updated", ["status", "lastMessageAt"]) to
// the schema would make this a true O(stale) scan — add in next schema migration.
export const markDormant = internalMutation({
  args: {},
  handler: async (ctx) => {
    const DORMANT_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoff = Date.now() - DORMANT_AFTER_MS;
    const now = Date.now();

    // by_status_updated index: reads ONLY "active" convos with lastMessageAt < cutoff.
    // O(stale records) — no longer scans the entire conversations table.
    const stale = await ctx.db
      .query("conversations")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "active").lt("lastMessageAt", cutoff)
      )
      .take(500); // Safety cap per cron run — daily cadence keeps backlog small

    let count = 0;
    for (const conv of stale) {
      await ctx.db.patch(conv._id, {
        status: "dormant",
        updatedAt: now,
      });
      count++;
    }

    return { markedDormant: count };
  },
});

// ============================================
// QUERIES
// ============================================

// Get a single conversation
export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get conversations for a specific client
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .collect();

    if (args.status) {
      return conversations.filter((c) => c.status === args.status);
    }

    return conversations;
  },
});

// Get the most recent conversation for a client (used by ThreadSummaryPanel to pass
// a conversationId so summaries are persisted and appear in the workspace widget).
export const getLatestByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("conversations")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .first();
  },
});

// Get recent conversations for current user
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const limit = args.limit ?? 20;

    return await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

// Get messages for a conversation (threaded view)
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc") // Chronological for thread view
      .take(limit);
  },
});

// ============================================
// MUTATIONS
// ============================================

// Archive a conversation
export const archive = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const conv = await ctx.db.get(args.id);
    if (!conv) throw new Error("Conversation not found");
    if (conv.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    });
  },
});

// Unarchive a conversation
export const unarchive = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const conv = await ctx.db.get(args.id);
    if (!conv) throw new Error("Conversation not found");
    if (conv.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// INTERNAL QUERIES — cron + auto-summarize use
// ============================================

// Returns the single most-recent active conversation for a client.
// Used by autoSummarizeForClient to target the freshest thread.
export const getMostRecentActiveByClientInternal = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_client_status", (q) =>
        q.eq("clientId", args.clientId).eq("status", "active")
      )
      .order("desc")
      .first();
  },
});
