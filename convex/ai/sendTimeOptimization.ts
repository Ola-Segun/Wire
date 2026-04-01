import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";

// ============================================
// SEND TIME OPTIMIZATION
// Learns from historical message patterns when each client responds fastest.
//
// Algorithm:
//   - For each inbound message, find the prior outbound message
//   - Compute response time and record the hour+dayOfWeek of the outbound
//   - Aggregate into 24×7 heatmap (168 slots)
//   - Best slot = highest (responseRate * speed_bonus) composite
//
// Zero AI cost — pure statistical analysis of DB records
// Runs weekly via cron for all users
// ============================================

// ---- Internal query: get best time for a client ----
export const getBestTimeForClient = internalQuery({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("send_time_optimization")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .first();
  },
});

// ---- Compute send time optimization for a single client ----
export const computeForClient = internalAction({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const { userId, clientId } = args;

    // Fetch all messages for this client (up to 200 for analysis)
    const messages: any[] = await ctx.runQuery(internal.messages.getByClientInternal, {
      clientId,
      limit: 200,
    });

    if (messages.length < 5) return; // Not enough data

    // Sort chronologically
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    // Heatmap: hour (0-23) × day (0-6) → { responseCount, totalResponseMs, sampleCount }
    const heatmap: Record<string, { responseCount: number; totalResponseMs: number; sampleCount: number }> = {};

    for (let i = 0; i < sorted.length - 1; i++) {
      const outbound = sorted[i];
      const next = sorted[i + 1];

      if (outbound.direction !== "outbound") continue;
      if (next.direction !== "inbound") continue;

      const responseMs = next.timestamp - outbound.timestamp;

      // Only count responses within 7 days (longer = not a direct response)
      if (responseMs > 7 * 24 * 60 * 60 * 1000) continue;
      if (responseMs < 0) continue;

      const sent = new Date(outbound.timestamp);
      const hour = sent.getUTCHours();
      const dayOfWeek = sent.getUTCDay();
      const key = `${hour}:${dayOfWeek}`;

      if (!heatmap[key]) {
        heatmap[key] = { responseCount: 0, totalResponseMs: 0, sampleCount: 0 };
      }
      heatmap[key].responseCount++;
      heatmap[key].totalResponseMs += responseMs;
      heatmap[key].sampleCount++;
    }

    const entries = Object.entries(heatmap);
    if (entries.length === 0) return;

    // Build heatmap array
    const totalSent = sorted.filter((m) => m.direction === "outbound").length;
    const heatmapData = entries.map(([key, data]) => {
      const [hour, dayOfWeek] = key.split(":").map(Number);
      const responseRate = data.sampleCount / Math.max(1, totalSent / 24 / 7);
      const avgResponseMs = data.totalResponseMs / data.sampleCount;
      return { hour, dayOfWeek, responseRate: Math.min(1, responseRate), avgResponseMs, sampleCount: data.sampleCount };
    });

    // Find best slot (highest response rate, with speed bonus)
    const MAX_FAST_RESPONSE_MS = 2 * 60 * 60 * 1000; // 2 hours = "fast"
    const best = heatmapData.reduce((a, b) => {
      const scoreA = a.responseRate * (1 + Math.max(0, 1 - a.avgResponseMs / MAX_FAST_RESPONSE_MS) * 0.3);
      const scoreB = b.responseRate * (1 + Math.max(0, 1 - b.avgResponseMs / MAX_FAST_RESPONSE_MS) * 0.3);
      return scoreA >= scoreB ? a : b;
    });

    const totalSamples = heatmapData.reduce((s, h) => s + h.sampleCount, 0);
    const confidence: "low" | "medium" | "high" =
      totalSamples < 10 ? "low" : totalSamples < 50 ? "medium" : "high";

    // Upsert the optimization record
    await ctx.runMutation(internal.ai.sendTimeOptimization.upsertRecord, {
      userId,
      clientId,
      bestHour: best.hour,
      bestDayOfWeek: best.dayOfWeek,
      heatmap: heatmapData,
      confidence,
      sampleCount: totalSamples,
    });
  },
});

// ---- Run for all clients of a user (called by weekly cron) ----
export const computeForUser = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const clients: any[] = await ctx.runQuery(internal.clients.getActiveByUserInternal, {
      userId: args.userId,
    });

    for (const client of clients) {
      try {
        await ctx.runAction(internal.ai.sendTimeOptimization.computeForClient, {
          userId: args.userId,
          clientId: client._id,
        });
      } catch (err) {
        console.error(
          `[SendTimeOptimization] Failed for client ${client._id}:`,
          String(err).split("\n")[0]
        );
      }
    }
  },
});

// ---- Internal mutation: upsert optimization record ----
export const upsertRecord = internalMutation({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
    bestHour: v.number(),
    bestDayOfWeek: v.number(),
    heatmap: v.array(v.object({
      hour: v.number(),
      dayOfWeek: v.number(),
      responseRate: v.number(),
      avgResponseMs: v.number(),
      sampleCount: v.number(),
    })),
    confidence: v.string(),
    sampleCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("send_time_optimization")
      .withIndex("by_user_client", (q) =>
        q.eq("userId", args.userId).eq("clientId", args.clientId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        bestHour: args.bestHour,
        bestDayOfWeek: args.bestDayOfWeek,
        heatmap: args.heatmap,
        confidence: args.confidence,
        sampleCount: args.sampleCount,
        computedAt: now,
      });
    } else {
      await ctx.db.insert("send_time_optimization", {
        userId: args.userId,
        clientId: args.clientId,
        bestHour: args.bestHour,
        bestDayOfWeek: args.bestDayOfWeek,
        heatmap: args.heatmap,
        confidence: args.confidence,
        sampleCount: args.sampleCount,
        computedAt: now,
        createdAt: now,
      });
    }
  },
});

// ---- Run weekly for ALL users (cron entry point) ----
// Called by the weekly send-time-optimization cron in crons.ts.
export const computeForAllUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    const users: any[] = await ctx.runQuery(api.users.getAllForSync, {});
    for (const user of users) {
      try {
        await ctx.runAction(internal.ai.sendTimeOptimization.computeForUser, {
          userId: user._id,
        });
      } catch (err) {
        console.error(`[SendTimeOpt] Failed for user ${user._id}:`, String(err).split("\n")[0]);
      }
    }
  },
});

