import { v } from "convex/values";
import { internalAction, internalMutation, action } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ============================================
// TYPES — strongly typed interfaces for health calculation
// ============================================

// Message shape needed for health calculations (subset of Doc<"messages">)
interface HealthMessage {
  timestamp: number;
  direction: string;
  platform: string;
  aiMetadata?: {
    priorityScore?: number;
    sentiment?: string;
    urgency?: string;
    extractedActions?: string[];
    topics?: string[];
    entities?: string[];
    scopeCreepDetected?: boolean;
    suggestedReply?: string;
    dealSignal?: boolean;
    churnRisk?: string;
    projectPhase?: string;
    hiddenRequests?: string[];
    valueSignal?: string | null;
    clientIntent?: string;
  };
}

// Client shape needed for health calculations (subset of Doc<"clients">)
interface HealthClient {
  _id: any;
  firstContactDate: number;
  lastContactDate: number;
  totalMessages: number;
}

// ============================================
// PURE HELPER FUNCTIONS — no Node.js APIs needed
// ============================================

function calculateResponseTimeScore(messages: HealthMessage[]): number {
  const sortedByTime = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const responseTimes: number[] = [];

  for (let i = 1; i < sortedByTime.length; i++) {
    const prev = sortedByTime[i - 1];
    const curr = sortedByTime[i];

    // Find inbound → outbound pairs (client message followed by user reply)
    if (prev.direction === "inbound" && curr.direction === "outbound") {
      const responseTime = curr.timestamp - prev.timestamp;
      if (responseTime > 0 && responseTime < 7 * 24 * 3600000) {
        responseTimes.push(responseTime);
      }
    }
  }

  if (responseTimes.length === 0) return 60; // No data → neutral

  const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const hours = avgMs / 3600000;

  // Score: < 1h = 100, 4h = 80, 12h = 65, 24h = 50, 48h = 30, > 72h = 10
  if (hours < 1) return 100;
  if (hours < 4) return 80;
  if (hours < 12) return 65;
  if (hours < 24) return 50;
  if (hours < 48) return 30;
  return 10;
}

function calculateSentimentScore(messages: HealthMessage[]): number {
  const inboundWithSentiment = messages.filter(
    (m) => m.direction === "inbound" && m.aiMetadata?.sentiment
  );

  if (inboundWithSentiment.length === 0) return 60; // No data → neutral

  const sentimentMap: Record<string, number> = {
    positive: 90,
    satisfied: 85,
    neutral: 60,
    concerned: 40,
    frustrated: 20,
    negative: 15,
    angry: 5,
  };

  let totalScore = 0;
  for (const msg of inboundWithSentiment) {
    const sentiment = msg.aiMetadata!.sentiment!.toLowerCase();
    totalScore += sentimentMap[sentiment] ?? 50;
  }

  return Math.round(totalScore / inboundWithSentiment.length);
}

function calculateFrequencyScore(
  messages: HealthMessage[],
  client: HealthClient
): number {
  if (messages.length < 2) return 50;

  const firstDate = client.firstContactDate;
  const lastDate = client.lastContactDate;
  const weeksSpan = Math.max(1, (lastDate - firstDate) / (7 * 24 * 3600000));
  const messagesPerWeek = messages.length / weeksSpan;

  // Score: >5/week = 100, 2-5 = 80, 1-2 = 65, <1 = 40, <0.25 = 20
  if (messagesPerWeek >= 5) return 100;
  if (messagesPerWeek >= 2) return 80;
  if (messagesPerWeek >= 1) return 65;
  if (messagesPerWeek >= 0.25) return 40;
  return 20;
}

function calculateRecencyScore(lastContactDate: number): number {
  const daysSinceContact = (Date.now() - lastContactDate) / (24 * 3600000);

  // Score: < 1 day = 100, 3 days = 85, 7 days = 70, 14 days = 50, 30 days = 30, > 60 = 10
  if (daysSinceContact < 1) return 100;
  if (daysSinceContact < 3) return 85;
  if (daysSinceContact < 7) return 70;
  if (daysSinceContact < 14) return 50;
  if (daysSinceContact < 30) return 30;
  return 10;
}

function calculateAvgResponseTime(messages: HealthMessage[]): number {
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const times: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].direction === "inbound" && sorted[i].direction === "outbound") {
      const diff = sorted[i].timestamp - sorted[i - 1].timestamp;
      if (diff > 0 && diff < 7 * 24 * 3600000) times.push(diff);
    }
  }

  if (times.length === 0) return 0;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

// ============================================
// INTERNAL MUTATION — updates client health in the DB
// Uses internalMutation so it can only be called by other Convex functions
// ============================================

export const updateClientHealth = internalMutation({
  args: {
    clientId: v.id("clients"),
    health: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.clientId, {
      relationshipHealth: args.health,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// ACTIONS — fetch data via queries, compute, then persist via mutation
// NOTE: "use node" removed — these are pure Convex actions using the V8 isolate.
// The helper functions above are pure math with no Node.js dependencies.
// ============================================

// Calculate relationship health for a single client
export const calculateForClient = action({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args): Promise<{ health: number }> => {
    // Use internal query so this works from both UI and cron context.
    const client = await ctx.runQuery(internal.clients.getInternal, { id: args.clientId });
    if (!client) throw new Error("Client not found");

    // Use internal query so this works from cron context (no auth required).
    const messages: HealthMessage[] = await ctx.runQuery(
      internal.messages.getByClientInternal,
      { clientId: args.clientId, limit: 100 }
    );

    if (messages.length === 0) {
      // Persist neutral score for new clients so UI shows 50 not undefined
      await ctx.runMutation(internal.health.updateClientHealth, {
        clientId: args.clientId,
        health: 50,
      });
      return { health: 50 };
    }

    // 1. Response Time Score (30% weight)
    const responseTimeScore = calculateResponseTimeScore(messages);

    // 2. Sentiment Score (25% weight)
    const sentimentScore = calculateSentimentScore(messages);

    // 3. Communication Frequency Score (25% weight)
    const frequencyScore = calculateFrequencyScore(messages, client as HealthClient);

    // 4. Recency Score (20% weight)
    const recencyScore = calculateRecencyScore(client.lastContactDate);

    // Weighted average
    const health = Math.round(
      responseTimeScore * 0.3 +
      sentimentScore * 0.25 +
      frequencyScore * 0.25 +
      recencyScore * 0.2
    );

    // Clamp to 0-100
    const clampedHealth = Math.max(0, Math.min(100, health));

    // Persist the health score
    await ctx.runMutation(internal.health.updateClientHealth, {
      clientId: args.clientId,
      health: clampedHealth,
    });

    return { health: clampedHealth };
  },
});

// Calculate health for all clients of a user (public — called from UI with auth)
export const calculateForAllClients = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ calculated: number }> => {
    const clients = await ctx.runQuery(internal.clients.getActiveByUserInternal, {
      userId: args.userId,
    });

    let calculated = 0;
    for (const client of clients) {
      try {
        await ctx.runAction(api.health.calculateForClient, {
          clientId: client._id,
        });
        calculated++;
      } catch {
        // Skip clients that fail
        continue;
      }
    }

    return { calculated };
  },
});

// Recalculate health for all clients across all users — called by cron.
// Uses internal queries only so it works without auth context.
export const recalculateAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ calculated: number; errors: number }> => {
    const users: Array<Record<string, any>> = await ctx.runQuery(
      api.users.getAllForSync,
      {}
    );

    let calculated = 0;
    let errors = 0;

    for (const user of users) {
      const clients: Array<Record<string, any>> = await ctx.runQuery(
        internal.clients.getActiveByUserInternal,
        { userId: user._id }
      );

      for (const client of clients) {
        try {
          await ctx.runAction(api.health.calculateForClient, {
            clientId: client._id,
          });
          // Compute client intelligence alongside health (zero AI calls)
          await ctx.runAction(internal.ai.clientIntelligence.computeForClient, {
            clientId: client._id,
          });
          calculated++;
        } catch {
          errors++;
        }
      }
    }

    console.log(`Health recalculation: ${calculated} updated, ${errors} errors`);
    return { calculated, errors };
  },
});
