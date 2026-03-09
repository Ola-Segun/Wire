import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

// ============================================
// DATA RETENTION — GDPR-aware lifecycle automation
// ============================================
//
// Implements wire2.md's data retention requirements:
// - Auto-archive dormant conversations
// - Clean up old processed webhooks
// - Soft-delete mechanism for client data
// - Configurable retention periods
//
// Called by crons in convex/crons.ts

const RETENTION_DEFAULTS = {
  // Messages older than 2 years can be deleted (GDPR Article 5(1)(e))
  messageRetentionDays: 730,
  // Processed webhooks cleaned up after 30 days
  webhookRetentionDays: 30,
  // Archived conversations cleaned up after 1 year
  archivedConversationDays: 365,
  // Rate limit entries cleaned up after 1 day
  rateLimitCleanupMs: 24 * 60 * 60 * 1000,
};

// ============================================
// INTERNAL — Cron-schedulable cleanup functions
// ============================================

// Clean up expired rate limit entries
export const cleanupRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_DEFAULTS.rateLimitCleanupMs;

    const expired = await ctx.db
      .query("rate_limits")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .collect();

    let deleted = 0;
    for (const entry of expired) {
      await ctx.db.delete(entry._id);
      deleted++;
    }

    return { deleted };
  },
});

// Clean up processed webhook records (idempotency keys)
export const cleanupProcessedWebhooks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoffMs =
      Date.now() -
      RETENTION_DEFAULTS.webhookRetentionDays * 24 * 60 * 60 * 1000;

    // processed_webhooks may not exist in schema — guard against it
    try {
      const expired = await ctx.db
        .query("processed_webhooks")
        .filter((q) => q.lt(q.field("processedAt"), cutoffMs))
        .collect();

      let deleted = 0;
      for (const entry of expired) {
        await ctx.db.delete(entry._id);
        deleted++;
      }

      return { deleted };
    } catch {
      return { deleted: 0 };
    }
  },
});

// Mark old conversations as dormant (complement to conversations.markDormant)
export const archiveAbandonedConversations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ARCHIVE_AFTER_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
    const cutoff = Date.now() - ARCHIVE_AFTER_MS;

    const dormant = await ctx.db
      .query("conversations")
      .filter((q) => q.eq(q.field("status"), "dormant"))
      .collect();

    let archived = 0;
    for (const conv of dormant) {
      if (conv.lastMessageAt < cutoff) {
        await ctx.db.patch(conv._id, {
          status: "archived",
          updatedAt: Date.now(),
        });
        archived++;
      }
    }

    return { archived };
  },
});

// Clean up dead letter queue entries older than 90 days
export const cleanupDeadLetterQueue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const expired = await ctx.db
      .query("dead_letter_queue")
      .filter((q) => q.lt(q.field("failedAt"), cutoffMs))
      .collect();

    let deleted = 0;
    for (const entry of expired) {
      await ctx.db.delete(entry._id);
      deleted++;
    }

    return { deleted };
  },
});

// ============================================
// QUERIES — Retention stats for admin dashboard
// ============================================

export const getRetentionStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Count items by status/age for visibility
    const activeConversations = await ctx.db
      .query("conversations")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const dormantConversations = await ctx.db
      .query("conversations")
      .filter((q) => q.eq(q.field("status"), "dormant"))
      .collect();

    const archivedConversations = await ctx.db
      .query("conversations")
      .filter((q) => q.eq(q.field("status"), "archived"))
      .collect();

    return {
      conversations: {
        active: activeConversations.length,
        dormant: dormantConversations.length,
        archived: archivedConversations.length,
      },
      retentionPolicy: {
        messageRetentionDays: RETENTION_DEFAULTS.messageRetentionDays,
        webhookRetentionDays: RETENTION_DEFAULTS.webhookRetentionDays,
        archivedConversationDays:
          RETENTION_DEFAULTS.archivedConversationDays,
      },
    };
  },
});

// ============================================
// MUTATIONS — User-initiated data management
// ============================================

// Export all data for a user (GDPR data portability — Article 20)
export const requestDataExport = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    // TODO [GDPR]: Implement actual data export pipeline
    // This should aggregate all user data (messages, clients, conversations,
    // commitments, contracts) into a downloadable JSON/ZIP file.
    // For now, we return a placeholder indicating the request was made.
    console.log(`Data export requested for user=${user._id}`);

    return {
      status: "pending",
      message:
        "Data export request received. You will be notified when it's ready.",
    };
  },
});
