import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ============================================
// SKILL DISPATCHER — Event-driven skill execution engine
// ============================================
//
// Cost architecture:
//   - Reactive skills (scope_guardian, churn_predictor, revenue_radar)
//     trigger on message analysis completion. They read EXISTING aiMetadata
//     fields — ZERO additional Claude API calls.
//   - Cron skills (commitment_watchdog, ghosting_detector, payment_sentinel)
//     run on schedule, querying Convex DB only — ZERO Claude calls.
//   - AI skills (smart_replies, thread_summarizer) are on-demand ONLY,
//     triggered by user action, using Haiku for cheapest inference.
//
// Deduplication: Before creating an output, we check if an identical
// output already exists (same skill + client + type within 24 hours).
// This prevents duplicate alerts from repeated cron runs.

// ============================================
// REACTIVE DISPATCHER — Called after unified AI analysis completes
// ============================================

// Run reactive skills for a newly analyzed message.
// Called from unified.ts after metadata is persisted.
// Cost: 0 Claude calls — all data comes from existing aiMetadata.
export const onMessageAnalyzed = internalAction({
  args: {
    userId: v.id("users"),
    messageId: v.id("messages"),
    clientId: v.id("clients"),
    aiMetadata: v.any(),
  },
  handler: async (ctx, args) => {
    const { userId, messageId, clientId, aiMetadata } = args;
    if (!aiMetadata) return;

    // Run each reactive skill in parallel (they're all DB reads, very fast)
    await Promise.allSettled([
      runScopeGuardian(ctx, userId, messageId, clientId, aiMetadata),
      runChurnPredictor(ctx, userId, messageId, clientId, aiMetadata),
      runRevenueRadar(ctx, userId, messageId, clientId, aiMetadata),
    ]);
  },
});

// ============================================
// CRON DISPATCHER — Called by cron for scheduled skills
// ============================================

// Run all cron-triggered skills for all users.
// Cost: 0 Claude calls — pure DB queries.
export const runCronSkills = internalAction({
  args: {},
  handler: async (ctx) => {
    const users: Array<Record<string, any>> = await ctx.runQuery(
      api.users.getAllForSync,
      {}
    );

    for (const user of users) {
      await Promise.allSettled([
        runCommitmentWatchdog(ctx, user._id),
        runGhostingDetector(ctx, user._id),
        runPaymentSentinel(ctx, user._id),
      ]);
    }
  },
});

// Run daily briefings for all users.
// Called by cron at 7am UTC every day.
// Cost: 1 Haiku call per user per day (~$0.0001/user).
export const runDailyBriefings = internalAction({
  args: {},
  handler: async (ctx) => {
    const users: Array<Record<string, any>> = await ctx.runQuery(
      api.users.getAllForSync,
      {}
    );

    // Serial execution — briefings are not time-critical and we want to
    // avoid parallel Haiku calls hammering the rate limit for large user sets.
    for (const user of users) {
      try {
        await ctx.runAction(internal.ai.dailyBriefing.generateForUser, {
          userId: user._id,
        });
      } catch (err) {
        console.error(
          `[DailyBriefings] Failed for user ${user._id}:`,
          String(err).split("\n")[0]
        );
      }
    }
  },
});

// ============================================
// REACTIVE SKILL IMPLEMENTATIONS
// ============================================

// --- Scope Guardian ---
// Fires when scopeCreepDetected is true.
// Checks if the client has an active contract and compares.
async function runScopeGuardian(
  ctx: any,
  userId: any,
  messageId: any,
  clientId: any,
  aiMetadata: any
) {
  if (!aiMetadata.scopeCreepDetected) return;

  const skillConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "scope_guardian",
  });
  if (!skillConfig.enabled) return;
  if (skillConfig.clientScope?.length && !skillConfig.clientScope.includes(clientId)) return;

  // Deduplicate: skip if we already alerted about this client in the last 24h
  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "scope_guardian",
    clientId,
    withinMs: 24 * 60 * 60 * 1000,
  });
  if (recent) return;

  // Check for active contracts to enrich the alert
  const contracts: any[] = await ctx.runQuery(
    internal.contracts.getActiveByClient,
    { clientId }
  );

  const deliverables = contracts.flatMap((c: any) => c.deliverables || []);
  const contractContext = deliverables.length > 0
    ? `Active contract deliverables: ${deliverables.join(", ")}`
    : "No active contract found — consider creating one to track scope.";

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug: "scope_guardian",
    clientId,
    messageId,
    type: "alert",
    severity: "warning",
    title: "Scope creep detected",
    content: `A client message appears to request work outside the agreed scope. ${contractContext}`,
    metadata: { deliverables, topics: aiMetadata.topics },
    actionable: true,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 day TTL
  });
}

// --- Churn Predictor ---
// Fires when churnRisk is "medium" or "high".
async function runChurnPredictor(
  ctx: any,
  userId: any,
  messageId: any,
  clientId: any,
  aiMetadata: any
) {
  const risk = aiMetadata.churnRisk;
  if (!risk || risk === "none" || risk === "low") return;

  const churnConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "churn_predictor",
  });
  if (!churnConfig.enabled) return;
  if (churnConfig.clientScope?.length && !churnConfig.clientScope.includes(clientId)) return;

  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "churn_predictor",
    clientId,
    withinMs: 48 * 60 * 60 * 1000, // 48h dedup window
  });
  if (recent) return;

  const severity = risk === "high" ? "critical" : "warning";

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug: "churn_predictor",
    clientId,
    messageId,
    type: "insight",
    severity,
    title: `${risk === "high" ? "High" : "Medium"} churn risk detected`,
    content: `This client shows signs of disengagement. Sentiment: ${aiMetadata.sentiment}. Consider proactive outreach.`,
    metadata: { churnRisk: risk, sentiment: aiMetadata.sentiment },
    actionable: true,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
}

// --- Revenue Radar ---
// Fires on dealSignal or valueSignal changes.
async function runRevenueRadar(
  ctx: any,
  userId: any,
  messageId: any,
  clientId: any,
  aiMetadata: any
) {
  const hasDealSignal = aiMetadata.dealSignal === true;
  const hasValueSignal = aiMetadata.valueSignal === "expansion" || aiMetadata.valueSignal === "contraction";

  if (!hasDealSignal && !hasValueSignal) return;

  const radarConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "revenue_radar",
  });
  if (!radarConfig.enabled) return;
  if (radarConfig.clientScope?.length && !radarConfig.clientScope.includes(clientId)) return;

  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "revenue_radar",
    clientId,
    withinMs: 24 * 60 * 60 * 1000,
  });
  if (recent) return;

  if (hasDealSignal) {
    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug: "revenue_radar",
      clientId,
      messageId,
      type: "insight",
      severity: "info",
      title: "Deal signal detected",
      content: "Client appears ready to proceed. Consider sending an invoice or confirming next steps.",
      metadata: { dealSignal: true, intent: aiMetadata.clientIntent },
      actionable: true,
      expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
    });
  }

  if (aiMetadata.valueSignal === "expansion") {
    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug: "revenue_radar",
      clientId,
      messageId,
      type: "insight",
      severity: "info",
      title: "Upsell opportunity",
      content: "Client is signaling scope expansion or additional work interest.",
      metadata: { valueSignal: "expansion" },
      actionable: true,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  } else if (aiMetadata.valueSignal === "contraction") {
    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug: "revenue_radar",
      clientId,
      messageId,
      type: "alert",
      severity: "warning",
      title: "Budget contraction signal",
      content: "Client mentioned scaling back or budget constraints. Review engagement strategy.",
      metadata: { valueSignal: "contraction" },
      actionable: true,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  }
}

// ============================================
// CRON SKILL IMPLEMENTATIONS
// ============================================

// --- Commitment Watchdog ---
// Scans for overdue and soon-due commitments.
async function runCommitmentWatchdog(ctx: any, userId: any) {
  const enabled = await ctx.runQuery(internal.skills.isSkillEnabled, {
    userId,
    skillSlug: "commitment_watchdog",
  });
  if (!enabled) return;

  const pending: any[] = await ctx.runQuery(
    internal.commitments.getPendingInternal,
    { userId }
  );

  const now = Date.now();
  const overdue = pending.filter((c) => c.dueDate && c.dueDate < now);
  const dueSoon = pending.filter(
    (c) => c.dueDate && c.dueDate >= now && c.dueDate < now + 24 * 60 * 60 * 1000
  );

  if (overdue.length === 0 && dueSoon.length === 0) return;

  // Dedup: only alert once per day
  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "commitment_watchdog",
    withinMs: 24 * 60 * 60 * 1000,
  });
  if (recent) return;

  const parts: string[] = [];
  if (overdue.length > 0) {
    parts.push(`${overdue.length} overdue commitment${overdue.length > 1 ? "s" : ""}`);
  }
  if (dueSoon.length > 0) {
    parts.push(`${dueSoon.length} due within 24 hours`);
  }

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug: "commitment_watchdog",
    type: "alert",
    severity: overdue.length > 0 ? "warning" : "info",
    title: "Commitment update",
    content: parts.join(". ") + ".",
    metadata: {
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      overdueItems: overdue.slice(0, 5).map((c: any) => c.text),
    },
    actionable: true,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // Refresh daily
  });
}

// --- Ghosting Detector ---
// Checks each client's silence duration vs. their baseline response time.
async function runGhostingDetector(ctx: any, userId: any) {
  const enabled = await ctx.runQuery(internal.skills.isSkillEnabled, {
    userId,
    skillSlug: "ghosting_detector",
  });
  if (!enabled) return;

  const config = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "ghosting_detector",
  });
  const multiplier = (config.config as any)?.silenceMultiplier ?? 3;

  const clients: any[] = await ctx.runQuery(
    internal.clients.getActiveByUserInternal,
    { userId }
  );

  const now = Date.now();
  const scopedClientIds: string[] | null = config.clientScope?.length ? config.clientScope : null;

  for (const client of clients) {
    // Skip clients outside the configured scope
    if (scopedClientIds && !scopedClientIds.includes(client._id)) continue;
    // Skip clients with no response time data
    if (!client.responseTimeAvg || client.responseTimeAvg <= 0) continue;

    const silenceMs = now - client.lastContactDate;
    const thresholdMs = client.responseTimeAvg * multiplier;

    if (silenceMs <= thresholdMs) continue;

    // Dedup per client (48h window)
    const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
      userId,
      skillSlug: "ghosting_detector",
      clientId: client._id,
      withinMs: 48 * 60 * 60 * 1000,
    });
    if (recent) continue;

    const silenceHours = Math.round(silenceMs / (60 * 60 * 1000));
    const avgHours = Math.round(client.responseTimeAvg / (60 * 60 * 1000));

    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug: "ghosting_detector",
      clientId: client._id,
      type: "alert",
      severity: silenceHours > avgHours * 5 ? "critical" : "warning",
      title: `${client.name} has gone quiet`,
      content: `No messages in ${silenceHours}h (their average response time: ${avgHours}h). Consider a follow-up.`,
      metadata: { silenceHours, avgResponseHours: avgHours },
      actionable: true,
      expiresAt: Date.now() + 48 * 60 * 60 * 1000,
    });
  }
}

// --- Payment Sentinel ---
// Scans for overdue payment-type commitments.
async function runPaymentSentinel(ctx: any, userId: any) {
  const enabled = await ctx.runQuery(internal.skills.isSkillEnabled, {
    userId,
    skillSlug: "payment_sentinel",
  });
  if (!enabled) return;

  const pending: any[] = await ctx.runQuery(
    internal.commitments.getPendingInternal,
    { userId }
  );

  const paymentCommitments = pending.filter((c) => c.type === "payment");
  const now = Date.now();
  const overdue = paymentCommitments.filter(
    (c) => c.dueDate && c.dueDate < now
  );

  if (overdue.length === 0) return;

  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "payment_sentinel",
    withinMs: 24 * 60 * 60 * 1000,
  });
  if (recent) return;

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug: "payment_sentinel",
    type: "alert",
    severity: "warning",
    title: `${overdue.length} overdue payment${overdue.length > 1 ? "s" : ""}`,
    content: overdue
      .slice(0, 3)
      .map((c: any) => c.text)
      .join("; "),
    metadata: { overdueCount: overdue.length },
    actionable: true,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
}

// ============================================
// DEDUPLICATION HELPER
// ============================================

// Check if a recent output already exists for this skill + client combo.
// Prevents duplicate alerts from rapid message processing or repeated crons.
export const hasRecentOutput = internalQuery({
  args: {
    userId: v.id("users"),
    skillSlug: v.string(),
    clientId: v.optional(v.id("clients")),
    withinMs: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.withinMs;

    const outputs = await ctx.db
      .query("skill_outputs")
      .withIndex("by_user_skill", (q) =>
        q.eq("userId", args.userId).eq("skillSlug", args.skillSlug)
      )
      .order("desc")
      .take(5);

    return outputs.some(
      (o) =>
        o.createdAt >= cutoff &&
        !o.isDismissed &&
        (!args.clientId || o.clientId === args.clientId)
    );
  },
});
