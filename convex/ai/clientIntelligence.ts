import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================
// CLIENT INTELLIGENCE — Aggregate per-message AI metadata
// into client-level insights. ZERO Claude calls.
// ============================================
//
// Runs alongside the health cron. Reads existing aiMetadata from messages
// and computes:
//   - Dominant sentiment trend (improving/stable/declining)
//   - Top topics across conversations
//   - Active project phase
//   - Churn risk aggregation
//   - Revenue signals summary
//   - Hidden requests roll-up
//
// All data comes from fields already extracted in unified.ts.

interface MessageMeta {
  timestamp: number;
  direction: string;
  aiMetadata?: {
    sentiment?: string;
    churnRisk?: string;
    projectPhase?: string;
    topics?: string[];
    hiddenRequests?: string[];
    dealSignal?: boolean;
    valueSignal?: string | null;
    clientIntent?: string;
    priorityScore?: number;
  };
}

// ============================================
// COMPUTE — Pure functions, no side effects
// ============================================

function computeSentimentTrend(messages: MessageMeta[]): "improving" | "stable" | "declining" {
  const inbound = messages
    .filter((m) => m.direction === "inbound" && m.aiMetadata?.sentiment)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (inbound.length < 4) return "stable";

  const sentimentScores: Record<string, number> = {
    positive: 3,
    neutral: 2,
    negative: 1,
    frustrated: 0,
  };

  const half = Math.floor(inbound.length / 2);
  const firstHalf = inbound.slice(0, half);
  const secondHalf = inbound.slice(half);

  const avg = (msgs: MessageMeta[]) => {
    const scores = msgs.map(
      (m) => sentimentScores[m.aiMetadata!.sentiment!] ?? 2
    );
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  const diff = avg(secondHalf) - avg(firstHalf);
  if (diff > 0.3) return "improving";
  if (diff < -0.3) return "declining";
  return "stable";
}

function computeTopTopics(messages: MessageMeta[], limit: number = 5): string[] {
  const counts = new Map<string, number>();
  for (const msg of messages) {
    for (const topic of msg.aiMetadata?.topics ?? []) {
      const normalized = topic.toLowerCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}

function computeAggregateChurnRisk(messages: MessageMeta[]): "none" | "low" | "medium" | "high" {
  const recent = messages
    .filter((m) => m.direction === "inbound" && m.aiMetadata?.churnRisk)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  if (recent.length === 0) return "none";

  const riskScores: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
  const avg =
    recent.reduce((sum, m) => sum + (riskScores[m.aiMetadata!.churnRisk!] ?? 0), 0) /
    recent.length;

  if (avg >= 2.5) return "high";
  if (avg >= 1.5) return "medium";
  if (avg >= 0.5) return "low";
  return "none";
}

function computeDominantPhase(messages: MessageMeta[]): string {
  const recent = messages
    .filter((m) => m.aiMetadata?.projectPhase)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  if (recent.length === 0) return "active";

  const counts = new Map<string, number>();
  for (const msg of recent) {
    const phase = msg.aiMetadata!.projectPhase!;
    counts.set(phase, (counts.get(phase) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function computeRevenueSignals(messages: MessageMeta[]): {
  dealSignalCount: number;
  expansionSignals: number;
  contractionSignals: number;
} {
  let dealSignalCount = 0;
  let expansionSignals = 0;
  let contractionSignals = 0;

  for (const msg of messages) {
    if (msg.aiMetadata?.dealSignal) dealSignalCount++;
    if (msg.aiMetadata?.valueSignal === "expansion") expansionSignals++;
    if (msg.aiMetadata?.valueSignal === "contraction") contractionSignals++;
  }

  return { dealSignalCount, expansionSignals, contractionSignals };
}

function collectHiddenRequests(messages: MessageMeta[], limit: number = 10): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // Most recent first
  const sorted = [...messages].sort((a, b) => b.timestamp - a.timestamp);

  for (const msg of sorted) {
    for (const req of msg.aiMetadata?.hiddenRequests ?? []) {
      const normalized = req.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(req);
      }
      if (result.length >= limit) return result;
    }
  }

  return result;
}

// ============================================
// DB — Persist client intelligence
// ============================================

export const upsertClientIntelligence = internalMutation({
  args: {
    clientId: v.id("clients"),
    sentimentTrend: v.string(),
    topTopics: v.array(v.string()),
    aggregateChurnRisk: v.string(),
    dominantPhase: v.string(),
    dealSignalCount: v.number(),
    expansionSignals: v.number(),
    contractionSignals: v.number(),
    hiddenRequests: v.array(v.string()),
    analyzedMessageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const { clientId, ...intelligence } = args;
    await ctx.db.patch(clientId, {
      intelligence: {
        ...intelligence,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// ACTION — Compute intelligence for a single client
// ============================================

export const computeForClient = internalAction({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const messages: MessageMeta[] = await ctx.runQuery(
      internal.messages.getByClientInternal,
      { clientId: args.clientId, limit: 100 }
    );

    if (messages.length < 3) return; // Not enough data

    const inbound = messages.filter((m) => m.direction === "inbound");

    const sentimentTrend = computeSentimentTrend(messages);
    const topTopics = computeTopTopics(inbound);
    const aggregateChurnRisk = computeAggregateChurnRisk(messages);
    const dominantPhase = computeDominantPhase(messages);
    const revenue = computeRevenueSignals(inbound);
    const hiddenRequests = collectHiddenRequests(inbound);

    await ctx.runMutation(internal.ai.clientIntelligence.upsertClientIntelligence, {
      clientId: args.clientId,
      sentimentTrend,
      topTopics,
      aggregateChurnRisk,
      dominantPhase,
      dealSignalCount: revenue.dealSignalCount,
      expansionSignals: revenue.expansionSignals,
      contractionSignals: revenue.contractionSignals,
      hiddenRequests,
      analyzedMessageCount: messages.length,
    });
  },
});
