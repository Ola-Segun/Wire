import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

// ============================================
// HELPERS — batch client name resolution
// ============================================

// Collect unique clientIds, fetch them in parallel, return a lookup map.
// This replaces the N+1 pattern of fetching clients one-by-one in a loop.
async function buildClientNameMap(
  ctx: { db: any },
  messages: Array<{ clientId: Id<"clients"> }>
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(messages.map((m) => m.clientId as string))];
  const clients = await Promise.all(
    uniqueIds.map((id) => ctx.db.get(id as Id<"clients">))
  );
  const map = new Map<string, string>();
  for (let i = 0; i < uniqueIds.length; i++) {
    map.set(uniqueIds[i], clients[i]?.name ?? "Unknown");
  }
  return map;
}

function enrichWithClientNames<T extends { clientId: Id<"clients"> }>(
  messages: T[],
  clientMap: Map<string, string>
): Array<T & { clientName: string }> {
  return messages.map((msg) => ({
    ...msg,
    clientName: clientMap.get(msg.clientId as string) ?? "Unknown",
  }));
}

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
// MUTATIONS
// ============================================

// Create a new message
// NOTE: This mutation is called by sync adapters (server-side actions), not directly
// by users. Auth is enforced at the adapter level (oauth token ownership).
// Adding auth here would break the sync pipeline since actions use system-level ctx.
export const create = mutation({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
    platformIdentityId: v.id("platform_identities"),
    platform: v.string(),
    platformMessageId: v.string(),
    conversationId: v.optional(v.id("conversations")),
    threadId: v.optional(v.string()),
    text: v.string(),
    timestamp: v.number(),
    direction: v.string(),
    isRead: v.boolean(),
    aiProcessed: v.boolean(),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.string(),
          url: v.string(),
          filename: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // Deduplicate: check if this platform message already exists
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_platform_message", (q) =>
        q.eq("platformMessageId", args.platformMessageId)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    const messageId = await ctx.db.insert("messages", {
      ...args,
      isStarred: false,
    });

    // Update client's lastContactDate and totalMessages
    const client = await ctx.db.get(args.clientId);
    if (client) {
      await ctx.db.patch(args.clientId, {
        lastContactDate: Math.max(client.lastContactDate, args.timestamp),
        totalMessages: client.totalMessages + 1,
      });
    }

    // Schedule immediate AI analysis for new inbound messages.
    // Runs asynchronously after this mutation commits — no latency added to the
    // sync path, and replaces the 15-minute cron wait for active sessions.
    if (args.direction === "inbound" && args.text.length >= 5) {
      await ctx.scheduler.runAfter(0, api.ai.unified.analyzeMessage, {
        messageId,
      });
    }

    return messageId;
  },
});

// Mark message as read
export const markAsRead = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    // Auth guard: verify caller owns the message
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.id);
    if (!message) throw new Error("Message not found");
    if (message.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { isRead: true });
  },
});

// Mark all unread messages as read for current user
export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return 0;

    const unread = await ctx.db
      .query("messages")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();

    await Promise.all(
      unread.map((msg) => ctx.db.patch(msg._id, { isRead: true }))
    );

    return unread.length;
  },
});

// Toggle starred
export const toggleStar = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    // Auth guard: verify caller owns the message
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.id);
    if (!message) throw new Error("Message not found");
    if (message.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { isStarred: !message.isStarred });
  },
});

// Update AI metadata on a message
// NOTE: Called by AI batch processing (server-side action), not by users directly.
export const updateAiMetadata = mutation({
  args: {
    messageId: v.id("messages"),
    metadata: v.object({
      priorityScore: v.optional(v.number()),
      sentiment: v.optional(v.string()),
      urgency: v.optional(v.string()),
      extractedActions: v.optional(v.array(v.string())),
      topics: v.optional(v.array(v.string())),
      entities: v.optional(v.array(v.string())),
      scopeCreepDetected: v.optional(v.boolean()),
      suggestedReply: v.optional(v.string()),
      // Deep extraction fields
      dealSignal: v.optional(v.boolean()),
      churnRisk: v.optional(v.string()),
      projectPhase: v.optional(v.string()),
      hiddenRequests: v.optional(v.array(v.string())),
      valueSignal: v.optional(v.union(v.string(), v.null())),
      clientIntent: v.optional(v.string()),
      // Temporal extraction — AI-resolved due dates for extracted actions
      extractedActionsWithDates: v.optional(v.array(v.object({
        text: v.string(),
        dueDateIso: v.optional(v.string()),
        dueTimeOfDay: v.optional(v.string()),
        confidence: v.string(),
        resolvedTimestamp: v.optional(v.number()),
      }))),
    }),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const existingMetadata = message.aiMetadata ?? {};

    // Strip null values before patch — Convex PatchValue only accepts T | undefined,
    // not null. valueSignal can be null from the AI, so convert to undefined here.
    const cleanMetadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args.metadata)) {
      if (v !== null) cleanMetadata[k] = v;
    }

    await ctx.db.patch(args.messageId, {
      aiMetadata: { ...existingMetadata, ...cleanMetadata },
    });
  },
});

// Mark message as AI-processed
// NOTE: Called by AI batch processing (server-side action), not by users directly.
export const markAsProcessed = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      aiProcessed: true,
      aiProcessedAt: Date.now(),
    });
  },
});

// ============================================
// QUERIES
// ============================================

// Get a single message
export const get = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get the latest synced message for a given identity (used as sync cursor)
// Returns the most recent message so sync adapters can pass its timestamp/id
// as an "oldest"/"after" param to avoid re-fetching already-seen messages.
export const getLatestForIdentity = query({
  args: {
    identityId: v.id("platform_identities"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_identity", (q) =>
        q.eq("platformIdentityId", args.identityId)
      )
      .order("desc")
      .first();
  },
});

// Get messages by client with cursor-based pagination
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { messages: [], nextCursor: null, hasMore: false };

    const limit = args.limit ?? 50;

    const result = await ctx.db
      .query("messages")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .paginate({ numItems: limit, cursor: (args.cursor ?? null) as any });

    return {
      messages: result.page,
      nextCursor: result.isDone ? null : result.continueCursor,
      hasMore: !result.isDone,
    };
  },
});

// Get urgent messages for a user (with client names) — N+1 fixed
export const getUrgent = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(100);

    // Filter for high-priority messages
    const urgent = messages.filter(
      (m) => m.aiMetadata?.priorityScore && m.aiMetadata.priorityScore >= 70
    );

    // Batch fetch all client names at once instead of N+1
    const clientMap = await buildClientNameMap(ctx, urgent);
    return enrichWithClientNames(urgent, clientMap);
  },
});

// Get unread messages for a user (with client names) — N+1 fixed
export const getUnread = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .order("desc")
      .take(100);

    const clientMap = await buildClientNameMap(ctx, messages);
    return enrichWithClientNames(messages, clientMap);
  },
});

// Get unprocessed messages for AI batch processing
export const getUnprocessed = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit * 2);

    return messages.filter((m) => !m.aiProcessed).slice(0, limit);
  },
});

// Get all messages for a user with cursor-based pagination — N+1 fixed
export const getAll = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return { messages: [], nextCursor: null, hasMore: false };

    const limit = args.limit ?? 50;

    const result = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate({ numItems: limit, cursor: (args.cursor ?? null) as any });

    const clientMap = await buildClientNameMap(ctx, result.page);
    const enriched = enrichWithClientNames(result.page, clientMap);

    return {
      messages: enriched,
      nextCursor: result.isDone ? null : result.continueCursor,
      hasMore: !result.isDone,
    };
  },
});

// Internal query: fetch messages for a client without auth context.
// Used by health recalculation cron which runs without a logged-in user.
export const getByClientInternal = internalQuery({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("messages")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .paginate({ numItems: args.limit ?? 100, cursor: null as any });
    return result.page;
  },
});

// Internal query: most recent inbound messages for a client.
// Used by crisis mode detector to check consecutive negative sentiment.
export const getRecentInboundByClient = internalQuery({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(args.limit ?? 5);
    return messages.filter((m) => m.direction === "inbound");
  },
});

// Internal query: recent outbound messages for a client after a timestamp.
// Used by revenue leakage detector to check if a follow-up was sent.
export const getRecentOutboundAfter = internalQuery({
  args: {
    clientId: v.id("clients"),
    after: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(20);
    return messages.filter(
      (m) => m.direction === "outbound" && m.timestamp >= args.after
    );
  },
});

// Search messages by text (uses the search_text index) — N+1 fixed
export const search = query({
  args: {
    query: v.string(),
    platform: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const limit = args.limit ?? 50;

    let searchBuilder = ctx.db
      .query("messages")
      .withSearchIndex("search_text", (q) => {
        const base = q.search("text", args.query).eq("userId", user._id);
        if (args.platform) {
          return base.eq("platform", args.platform);
        }
        return base;
      });

    const messages = await searchBuilder.take(limit);

    const clientMap = await buildClientNameMap(ctx, messages);
    return enrichWithClientNames(messages, clientMap);
  },
});

// ============================================
// SENTIMENT DATA — lightweight chart feed
// ============================================
// Returns per-message sentiment data points for a client, oldest-first.
// Used by the SentimentTrajectoryChart component. Only inbound messages
// with AI-analyzed sentiment are returned — outbound messages are
// excluded because the freelancer's own replies aren't sentiment signals.
//
// Returns a compact shape to minimise bandwidth (no full message text).

export const getSentimentData = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const cap = Math.min(args.limit ?? 40, 100);

    // Fetch most-recent messages, then reverse for chronological order
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(cap);

    return messages
      .reverse()
      .filter(
        (m) =>
          m.direction === "inbound" &&
          m.aiMetadata?.sentiment &&
          m.aiMetadata.sentiment.length > 0
      )
      .map((m) => ({
        timestamp: m.timestamp,
        sentiment: m.aiMetadata!.sentiment as string,
        // Short preview for tooltip — no full text transmitted
        preview: m.text.length > 70 ? m.text.slice(0, 70) + "…" : m.text,
      }));
  },
});
