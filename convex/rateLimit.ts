import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Convex-side rate limiter using the database for persistence.
// Checks if a user has exceeded the allowed number of actions in a time window.
// Returns { allowed: boolean, remaining: number }.

export const check = query({
  args: {
    key: v.string(), // e.g. "send:userId" or "ai:userId"
    windowMs: v.number(),
    maxRequests: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = now - args.windowMs;

    const records = await ctx.db
      .query("rate_limits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();

    // Count requests within the window
    const recentCount = records.filter((r) => r.timestamp >= windowStart).length;

    return {
      allowed: recentCount < args.maxRequests,
      remaining: Math.max(0, args.maxRequests - recentCount),
      count: recentCount,
    };
  },
});

export const record = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("rate_limits", {
      key: args.key,
      timestamp: Date.now(),
    });
  },
});

// Cleanup old rate limit records (run periodically via cron)
export const cleanup = mutation({
  args: {},
  handler: async (ctx) => {
    // Remove records older than 5 minutes
    const cutoff = Date.now() - 5 * 60 * 1000;
    const old = await ctx.db
      .query("rate_limits")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .take(200);

    await Promise.all(old.map((r) => ctx.db.delete(r._id)));
    return { cleaned: old.length };
  },
});
