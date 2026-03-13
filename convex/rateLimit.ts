import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// RATE LIMITER
// ============================================
//
// Sliding-window rate limiter backed by the `rate_limits` table.
//
// Two usage patterns:
//
//  1. Per-minute burst guard (used for AI analysis, send):
//       windowMs: 60_000, maxRequests: 30
//       Key format: "ai:{userId}", "send:{userId}"
//
//  2. Per-day on-demand budget (used for smart_replies, thread_summarizer):
//       windowMs: 86_400_000 (24h), maxRequests: 20
//       Key format: "smart_replies:{userId}", "thread_summarizer:{userId}"
//
// IMPORTANT: The `cleanup` mutation must retain records for at least as long
// as the longest window used (currently 24 hours). It deletes records older
// than CLEANUP_MAX_AGE_MS (25 hours) so daily counters survive the cleanup cron.

// ─── Cleanup TTL ─────────────────────────────────────────────────────────────
// 25 hours: one hour longer than the longest rate-limit window (24h daily).
// Per-minute records (1 min) are also safe — they just live slightly longer
// than necessary, but the table stays small at the scale Wire operates at.
const CLEANUP_MAX_AGE_MS = 25 * 60 * 60 * 1000;

// ─── API ─────────────────────────────────────────────────────────────────────

export const check = query({
  args: {
    key: v.string(),        // e.g. "ai:userId", "smart_replies:userId"
    windowMs: v.number(),   // e.g. 60_000 (1 min) or 86_400_000 (24h)
    maxRequests: v.number(), // e.g. 30 or 20
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - args.windowMs;

    const records = await ctx.db
      .query("rate_limits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();

    // Count requests within the sliding window
    const recentCount = records.filter((r) => r.timestamp >= windowStart).length;

    return {
      allowed:   recentCount < args.maxRequests,
      remaining: Math.max(0, args.maxRequests - recentCount),
      count:     recentCount,
      limit:     args.maxRequests,
      windowMs:  args.windowMs,
    };
  },
});

export const record = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("rate_limits", {
      key:       args.key,
      timestamp: Date.now(),
    });
  },
});

// Cleanup old rate limit records — called by the 10-minute cron.
// Retains records up to CLEANUP_MAX_AGE_MS (25h) to support daily rate limits.
export const cleanup = mutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - CLEANUP_MAX_AGE_MS;
    const old = await ctx.db
      .query("rate_limits")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .take(500);

    await Promise.all(old.map((r) => ctx.db.delete(r._id)));
    return { cleaned: old.length };
  },
});
