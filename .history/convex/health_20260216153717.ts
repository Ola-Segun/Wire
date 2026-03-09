"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Calculate relationship health for a single client
export const calculateForClient = action({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args): Promise<{ health: number }> => {
    // Fetch client and recent messages
    const client: Record<string, any> | null = await ctx.runQuery(
      api.clients.get,
      { id: args.clientId }
    );
    if (!client) throw new Error("Client not found");

    const messages: Array<Record<string, any>> = await ctx.runQuery(
      api.messages.getByClient,
      { clientId: args.clientId, limit: 100 }
    );

    if (messages.length === 0) {
      return { health: 50 }; // Neutral for new clients with no messages
    }

    // 1. Response Time Score (30% weight)
    // Measures how quickly the user responds to inbound messages
    const responseTimeScore = calculateResponseTimeScore(messages);

    // 2. Sentiment Score (25% weight)
    // Average sentiment from AI metadata
    const sentimentScore = calculateSentimentScore(messages);

    // 3. Communication Frequency Score (25% weight)
    // How regularly do they communicate
    const frequencyScore = calculateFrequencyScore(messages, client);

    // 4. Recency Score (20% weight)
    // How recently was the last contact
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

    // Calculate average response time
    const avgResponseTime = calculateAvgResponseTime(messages);

    // Determine preferred platform
    const platformCounts: Record<string, number> = {};
    for (const msg of messages) {
      platformCounts[msg.platform] = (platformCounts[msg.platform] || 0) + 1;
    }
    const preferredPlatform = Object.entries(platformCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    // Determine response speed category
    let responseSpeed = "average";
    if (avgResponseTime < 3600000) responseSpeed = "fast"; // < 1 hour
    else if (avgResponseTime > 86400000) responseSpeed = "slow"; // > 24 hours

    // Update client
    await ctx.runMutation(api.clients.update, {
      id: args.clientId,
      relationshipHealth: clampedHealth,
    });

    return { health: clampedHealth };
  },
});

// Calculate health for all clients of a user
export const calculateForAllClients = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ calculated: number }> => {
    const clients: Array<Record<string, any>> = await ctx.runQuery(
      api.clients.getByUser,
      {}
    );

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

// --- Helper functions ---

function calculateResponseTimeScore(messages: Array<Record<string, any>>): number {
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

  // Score: < 1h = 100, 4h = 80, 12h = 60, 24h = 40, 48h = 20, > 72h = 10
  if (hours < 1) return 100;
  if (hours < 4) return 80;
  if (hours < 12) return 65;
  if (hours < 24) return 50;
  if (hours < 48) return 30;
  return 10;
}

function calculateSentimentScore(messages: Array<Record<string, any>>): number {
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
    const sentiment = msg.aiMetadata.sentiment.toLowerCase();
    totalScore += sentimentMap[sentiment] ?? 50;
  }

  return Math.round(totalScore / inboundWithSentiment.length);
}

function calculateFrequencyScore(
  messages: Array<Record<string, any>>,
  client: Record<string, any>
): number {
  if (messages.length < 2) return 50;

  const firstDate = client.firstContactDate;
  const lastDate = client.lastContactDate;
  const weeksSpan = Math.max(1, (lastDate - firstDate) / (7 * 24 * 3600000));
  const messagesPerWeek = messages.length / weeksSpan;

  // Score: >5/week = 100, 2-5 = 80, 1-2 = 60, <1 = 40, <0.25 = 20
  if (messagesPerWeek >= 5) return 100;
  if (messagesPerWeek >= 2) return 80;
  if (messagesPerWeek >= 1) return 65;
  if (messagesPerWeek >= 0.25) return 40;
  return 20;
}

function calculateRecencyScore(lastContactDate: number): number {
  const daysSinceContact = (Date.now() - lastContactDate) / (24 * 3600000);

  // Score: < 1 day = 100, 3 days = 80, 7 days = 60, 14 days = 40, 30 days = 20, > 60 = 5
  if (daysSinceContact < 1) return 100;
  if (daysSinceContact < 3) return 85;
  if (daysSinceContact < 7) return 70;
  if (daysSinceContact < 14) return 50;
  if (daysSinceContact < 30) return 30;
  return 10;
}

function calculateAvgResponseTime(messages: Array<Record<string, any>>): number {
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
