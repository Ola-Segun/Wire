import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================
// CROSS-PLATFORM CONFLICT DETECTOR
// Zero AI cost — reads existing aiMetadata across platforms.
//
// Detects:
//   1. Sentiment conflicts: positive on one platform, negative on another
//      (within 48h window)
//   2. Intent conflicts: approving on one platform, rejecting on another
//      (within 24h window)
//
// Fires:
//   - Reactively after each message analysis (via skillDispatcher.onMessageAnalyzed)
//   - As a cron skill (via skillDispatcher.runCronSkills every 4h)
// ============================================

const POSITIVE_SENTIMENTS = new Set(["positive", "excited", "satisfied"]);
const NEGATIVE_SENTIMENTS = new Set(["negative", "frustrated", "angry", "disappointed"]);

const APPROVING_INTENTS = new Set(["approving"]);
const REJECTING_INTENTS = new Set(["rejecting"]);

// Called reactively after a message is analyzed
export const detectForClient = internalAction({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const { userId, clientId } = args;

    // Check skill is enabled
    const skillConfig: any = await ctx.runQuery(internal.skills.getSkillConfig, {
      userId,
      skillSlug: "conflict_detector",
    });
    if (!skillConfig.enabled) return;
    if (skillConfig.clientScope?.length && !skillConfig.clientScope.includes(clientId)) return;

    // Dedup: don't fire again within 24h
    const recent: boolean = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
      userId,
      skillSlug: "conflict_detector",
      clientId,
      withinMs: 24 * 60 * 60 * 1000,
    });
    if (recent) return;

    // Fetch recent messages for this client (across platforms)
    const messages: any[] = await ctx.runQuery(internal.messages.getByClientInternal, {
      clientId,
      limit: 30,
    });

    const windowMs = (skillConfig.config as any)?.sentimentWindow ?? 48 * 60 * 60 * 1000;
    const now = Date.now();

    // Only look at analyzed inbound messages within the window
    const windowMessages = messages.filter(
      (m) => m.direction === "inbound" && m.aiMetadata && now - m.timestamp <= windowMs
    );

    if (windowMessages.length < 2) return;

    // Group by platform
    const byPlatform: Record<string, any[]> = {};
    for (const msg of windowMessages) {
      if (!byPlatform[msg.platform]) byPlatform[msg.platform] = [];
      byPlatform[msg.platform].push(msg);
    }

    const platforms = Object.keys(byPlatform);
    if (platforms.length < 2) return; // Need 2+ platforms to detect cross-platform conflict

    // Check sentiment conflict across platforms
    for (let i = 0; i < platforms.length; i++) {
      for (let j = i + 1; j < platforms.length; j++) {
        const pA = platforms[i];
        const pB = platforms[j];

        const sentA = getMajoritySentiment(byPlatform[pA]);
        const sentB = getMajoritySentiment(byPlatform[pB]);

        if (!sentA || !sentB) continue;

        const aIsPos = POSITIVE_SENTIMENTS.has(sentA);
        const aIsNeg = NEGATIVE_SENTIMENTS.has(sentA);
        const bIsPos = POSITIVE_SENTIMENTS.has(sentB);
        const bIsNeg = NEGATIVE_SENTIMENTS.has(sentB);

        if ((aIsPos && bIsNeg) || (aIsNeg && bIsPos)) {
          await ctx.runMutation(internal.skills.createOutput, {
            userId,
            skillSlug: "conflict_detector",
            clientId,
            type: "alert",
            severity: "warning",
            title: "Cross-platform sentiment conflict",
            content: `This client appears ${sentA} on ${pA} but ${sentB} on ${pB} in the last ${Math.round(windowMs / 3600000)}h. Their actual satisfaction level may be unclear.`,
            metadata: {
              platformA: pA,
              sentimentA: sentA,
              platformB: pB,
              sentimentB: sentB,
              conflictType: "sentiment",
            },
            actionable: true,
            expiresAt: Date.now() + 48 * 60 * 60 * 1000,
          });
          return; // One alert per client per window
        }

        // Check intent conflict
        const intentA = getMajorityIntent(byPlatform[pA]);
        const intentB = getMajorityIntent(byPlatform[pB]);

        if (!intentA || !intentB) continue;

        const aIsApproving = APPROVING_INTENTS.has(intentA);
        const aIsRejecting = REJECTING_INTENTS.has(intentA);
        const bIsApproving = APPROVING_INTENTS.has(intentB);
        const bIsRejecting = REJECTING_INTENTS.has(intentB);

        if ((aIsApproving && bIsRejecting) || (aIsRejecting && bIsApproving)) {
          await ctx.runMutation(internal.skills.createOutput, {
            userId,
            skillSlug: "conflict_detector",
            clientId,
            type: "alert",
            severity: "warning",
            title: "Cross-platform intent conflict",
            content: `This client appears to be ${intentA} on ${pA} but ${intentB} on ${pB}. Clarify their actual position before proceeding.`,
            metadata: {
              platformA: pA,
              intentA,
              platformB: pB,
              intentB,
              conflictType: "intent",
            },
            actionable: true,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          });
          return;
        }
      }
    }
  },
});

// Called during cron — runs for all active clients of a user
export const detectForUser = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const clients: any[] = await ctx.runQuery(internal.clients.getActiveByUserInternal, {
      userId: args.userId,
    });

    for (const client of clients) {
      try {
        await ctx.runAction(internal.ai.conflictDetector.detectForClient, {
          userId: args.userId,
          clientId: client._id,
        });
      } catch (err) {
        console.error(`[ConflictDetector] Failed for client ${client._id}:`, String(err).split("\n")[0]);
      }
    }
  },
});

// ---- Helpers ----

function getMajoritySentiment(messages: any[]): string | null {
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    const s = msg.aiMetadata?.sentiment;
    if (s) counts[s] = (counts[s] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : null;
}

function getMajorityIntent(messages: any[]): string | null {
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    const i = msg.aiMetadata?.clientIntent;
    if (i) counts[i] = (counts[i] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : null;
}
