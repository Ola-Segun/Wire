import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// ============================================
// IDEMPOTENCY — prevent duplicate webhook processing
// ============================================

// Check if a webhook event has already been processed
export const isProcessed = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processed_webhooks")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    return !!existing;
  },
});

// Mark a webhook event as processed
export const markProcessed = mutation({
  args: {
    eventId: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    // Double-check idempotency within mutation
    const existing = await ctx.db
      .query("processed_webhooks")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("processed_webhooks", {
      eventId: args.eventId,
      source: args.source,
      processedAt: Date.now(),
      // TTL: 7 days
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  },
});

// Cleanup expired idempotency records (run periodically via cron)
export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("processed_webhooks")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(100);

    await Promise.all(expired.map((record) => ctx.db.delete(record._id)));
    return { cleaned: expired.length };
  },
});

// ============================================
// DEAD LETTER QUEUE — capture failed processing
// ============================================

// Add a failed event to the DLQ
export const addToDeadLetter = mutation({
  args: {
    source: v.string(),
    eventType: v.string(),
    payload: v.any(),
    error: v.string(),
    attempts: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("dead_letter_queue", {
      source: args.source,
      eventType: args.eventType,
      payload: args.payload,
      error: args.error,
      attempts: args.attempts,
      createdAt: Date.now(),
      lastAttemptAt: Date.now(),
      resolved: false,
    });
  },
});

// Get unresolved DLQ entries (for admin dashboard)
export const getUnresolved = query({
  args: {
    source: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.source) {
      return await ctx.db
        .query("dead_letter_queue")
        .withIndex("by_source", (q) =>
          q.eq("source", args.source!).eq("resolved", false)
        )
        .order("desc")
        .take(limit);
    }

    const items = await ctx.db
      .query("dead_letter_queue")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    return items.filter((item) => !item.resolved);
  },
});

// Mark a DLQ entry as resolved
export const resolveDeadLetter = mutation({
  args: { id: v.id("dead_letter_queue") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      resolved: true,
      resolvedAt: Date.now(),
    });
  },
});
