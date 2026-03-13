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
// Query optimisation:
//   Each reactive skill previously called isSkillEnabled (1 query) followed
//   immediately by getSkillConfig (1 query). Since getSkillConfig returns
//   { enabled, config, clientScope }, the first query is now redundant.
//   All reactive and cron skill runners call getSkillConfig once and check
//   .enabled inline — saving 1 DB read per skill per message analyzed.
//
// Deduplication:
//   hasRecentOutput checks for ANY output (dismissed or not) within the dedup
//   window. Previously it filtered out dismissed outputs, which caused a bug:
//   after a user dismissed an alert, the next cron/message would re-fire
//   immediately because hasRecentOutput returned false.
//
//   The fix: remove the !isDismissed filter from hasRecentOutput.
//   Dismissed outputs still suppress new alerts within the dedup window.
//   Alerts re-fire only once the dedup window expires.
//
//   actionTaken: when a user explicitly acts (e.g. sends outreach), the output
//   is marked actionTaken=true. hasRecentOutput counts actionTaken outputs too,
//   so acted-on alerts get the same dedup treatment as dismissed ones.

// ============================================
// REACTIVE DISPATCHER — Called after unified AI analysis completes
// ============================================

export const onMessageAnalyzed = internalAction({
  args: {
    userId:     v.id("users"),
    messageId:  v.id("messages"),
    clientId:   v.id("clients"),
    aiMetadata: v.any(),
  },
  handler: async (ctx, args) => {
    const { userId, messageId, clientId, aiMetadata } = args;
    if (!aiMetadata) return;

    // Run reactive skills in parallel (all DB reads, very fast)
    await Promise.allSettled([
      runScopeGuardian(ctx,   userId, messageId, clientId, aiMetadata),
      runChurnPredictor(ctx,  userId, messageId, clientId, aiMetadata),
      runRevenueRadar(ctx,    userId, messageId, clientId, aiMetadata),
    ]);
  },
});

// ============================================
// CRON DISPATCHER — Called by cron for scheduled skills
// ============================================

export const runCronSkills = internalAction({
  args: {},
  handler: async (ctx) => {
    const users: Array<Record<string, any>> = await ctx.runQuery(
      api.users.getAllForSync,
      {}
    );

    for (const user of users) {
      await Promise.allSettled([
        runCommitmentWatchdog(ctx,     user._id),
        runGhostingDetector(ctx,       user._id),
        runPaymentSentinel(ctx,        user._id),
        runRevenueLeakageDetector(ctx, user._id),
        runCrisisMode(ctx,             user._id),
      ]);
    }
  },
});

// Run daily briefings for all users at 7am UTC.
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
async function runScopeGuardian(
  ctx: any,
  userId: any,
  messageId: any,
  clientId: any,
  aiMetadata: any
) {
  if (!aiMetadata.scopeCreepDetected) return;

  // Single query returns enabled + config + clientScope (was 2 separate queries)
  const skillConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "scope_guardian",
  });
  if (!skillConfig.enabled) return;
  if (skillConfig.clientScope?.length && !skillConfig.clientScope.includes(clientId)) return;

  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "scope_guardian",
    clientId,
    withinMs: 24 * 60 * 60 * 1000,
  });
  if (recent) return;

  const contracts: any[] = await ctx.runQuery(
    internal.contracts.getActiveByClient,
    { clientId }
  );

  const deliverables    = contracts.flatMap((c: any) => c.deliverables || []);
  const contractContext = deliverables.length > 0
    ? `Active contract deliverables: ${deliverables.join(", ")}`
    : "No active contract found — consider creating one to track scope.";

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug: "scope_guardian",
    clientId,
    messageId,
    type:       "alert",
    severity:   "warning",
    title:      "Scope creep detected",
    content:    `A client message appears to request work outside the agreed scope. ${contractContext}`,
    metadata:   { deliverables, topics: aiMetadata.topics },
    actionable: true,
    expiresAt:  Date.now() + 7 * 24 * 60 * 60 * 1000,
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
    withinMs: 48 * 60 * 60 * 1000,
  });
  if (recent) return;

  const severity = risk === "high" ? "critical" : "warning";

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug: "churn_predictor",
    clientId,
    messageId,
    type:       "insight",
    severity,
    title:      `${risk === "high" ? "High" : "Medium"} churn risk detected`,
    content:    `This client shows signs of disengagement. Sentiment: ${aiMetadata.sentiment}. Consider proactive outreach.`,
    metadata:   { churnRisk: risk, sentiment: aiMetadata.sentiment },
    actionable: true,
    expiresAt:  Date.now() + 7 * 24 * 60 * 60 * 1000,
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
  const hasDealSignal  = aiMetadata.dealSignal === true;
  const hasValueSignal =
    aiMetadata.valueSignal === "expansion" || aiMetadata.valueSignal === "contraction";

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
      type:       "insight",
      severity:   "info",
      title:      "Deal signal detected",
      content:    "Client appears ready to proceed. Consider sending an invoice or confirming next steps.",
      metadata:   { dealSignal: true, intent: aiMetadata.clientIntent },
      actionable: true,
      expiresAt:  Date.now() + 3 * 24 * 60 * 60 * 1000,
    });
  }

  if (aiMetadata.valueSignal === "expansion") {
    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug: "revenue_radar",
      clientId,
      messageId,
      type:       "insight",
      severity:   "info",
      title:      "Upsell opportunity",
      content:    "Client is signaling scope expansion or additional work interest.",
      metadata:   { valueSignal: "expansion" },
      actionable: true,
      expiresAt:  Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  } else if (aiMetadata.valueSignal === "contraction") {
    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug: "revenue_radar",
      clientId,
      messageId,
      type:       "alert",
      severity:   "warning",
      title:      "Budget contraction signal",
      content:    "Client mentioned scaling back or budget constraints. Review engagement strategy.",
      metadata:   { valueSignal: "contraction" },
      actionable: true,
      expiresAt:  Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  }
}

// ============================================
// CRON SKILL IMPLEMENTATIONS
// ============================================

// --- Commitment Watchdog ---
async function runCommitmentWatchdog(ctx: any, userId: any) {
  // getSkillConfig returns { enabled, config, clientScope } — 1 query vs 2
  const skillConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "commitment_watchdog",
  });
  if (!skillConfig.enabled) return;

  const pending: any[] = await ctx.runQuery(
    internal.commitments.getPendingInternal,
    { userId }
  );

  const now      = Date.now();
  const overdue  = pending.filter((c) => c.dueDate && c.dueDate < now);
  const dueSoon  = pending.filter(
    (c) => c.dueDate && c.dueDate >= now && c.dueDate < now + 24 * 60 * 60 * 1000
  );

  if (overdue.length === 0 && dueSoon.length === 0) return;

  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "commitment_watchdog",
    withinMs:  24 * 60 * 60 * 1000,
  });
  if (recent) return;

  const parts: string[] = [];
  if (overdue.length > 0) parts.push(`${overdue.length} overdue commitment${overdue.length > 1 ? "s" : ""}`);
  if (dueSoon.length > 0) parts.push(`${dueSoon.length} due within 24 hours`);

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug:  "commitment_watchdog",
    type:       "alert",
    severity:   overdue.length > 0 ? "warning" : "info",
    title:      "Commitment update",
    content:    parts.join(". ") + ".",
    metadata: {
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      overdueItems: overdue.slice(0, 5).map((c: any) => c.text),
    },
    actionable: true,
    expiresAt:  Date.now() + 24 * 60 * 60 * 1000,
  });
}

// --- Ghosting Detector ---
async function runGhostingDetector(ctx: any, userId: any) {
  const config = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "ghosting_detector",
  });
  if (!config.enabled) return;

  const multiplier       = (config.config as any)?.silenceMultiplier ?? 3;
  const clients: any[]   = await ctx.runQuery(
    internal.clients.getActiveByUserInternal,
    { userId }
  );

  const now            = Date.now();
  const scopedClientIds: string[] | null = config.clientScope?.length
    ? config.clientScope
    : null;

  for (const client of clients) {
    if (scopedClientIds && !scopedClientIds.includes(client._id)) continue;
    if (!client.responseTimeAvg || client.responseTimeAvg <= 0) continue;

    const silenceMs   = now - client.lastContactDate;
    const thresholdMs = client.responseTimeAvg * multiplier;
    if (silenceMs <= thresholdMs) continue;

    const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
      userId,
      skillSlug: "ghosting_detector",
      clientId:  client._id,
      withinMs:  48 * 60 * 60 * 1000,
    });
    if (recent) continue;

    const silenceHours = Math.round(silenceMs / (60 * 60 * 1000));
    const avgHours     = Math.round(client.responseTimeAvg / (60 * 60 * 1000));

    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug:  "ghosting_detector",
      clientId:   client._id,
      type:       "alert",
      severity:   silenceHours > avgHours * 5 ? "critical" : "warning",
      title:      `${client.name} has gone quiet`,
      content:    `No messages in ${silenceHours}h (their average response time: ${avgHours}h). Consider a follow-up.`,
      metadata:   { silenceHours, avgResponseHours: avgHours },
      actionable: true,
      expiresAt:  Date.now() + 48 * 60 * 60 * 1000,
    });
  }
}

// --- Payment Sentinel ---
async function runPaymentSentinel(ctx: any, userId: any) {
  const skillConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "payment_sentinel",
  });
  if (!skillConfig.enabled) return;

  const pending: any[]   = await ctx.runQuery(
    internal.commitments.getPendingInternal,
    { userId }
  );

  const paymentCommitments = pending.filter((c) => c.type === "payment");
  const now                = Date.now();
  const overdue            = paymentCommitments.filter(
    (c) => c.dueDate && c.dueDate < now
  );

  if (overdue.length === 0) return;

  const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
    userId,
    skillSlug: "payment_sentinel",
    withinMs:  24 * 60 * 60 * 1000,
  });
  if (recent) return;

  await ctx.runMutation(internal.skills.createOutput, {
    userId,
    skillSlug:  "payment_sentinel",
    type:       "alert",
    severity:   "warning",
    title:      `${overdue.length} overdue payment${overdue.length > 1 ? "s" : ""}`,
    content:    overdue.slice(0, 3).map((c: any) => c.text).join("; "),
    metadata:   { overdueCount: overdue.length },
    actionable: true,
    expiresAt:  Date.now() + 24 * 60 * 60 * 1000,
  });
}

// --- Revenue Leakage Detector ---
// Extends Payment Sentinel: cross-references overdue payment commitments with
// recent outbound messages. Zero AI calls — pure DB logic.
async function runRevenueLeakageDetector(ctx: any, userId: any) {
  const skillConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "payment_sentinel",
  });
  if (!skillConfig.enabled) return;

  const pending: any[]       = await ctx.runQuery(
    internal.commitments.getPendingInternal,
    { userId }
  );

  const now                  = Date.now();
  const FOLLOW_UP_WINDOW_MS  = 48 * 60 * 60 * 1000;

  const overduePayments = pending.filter(
    (c) => c.type === "payment" && c.dueDate && c.dueDate < now
  );

  for (const commitment of overduePayments) {
    const outboundMessages: any[] = await ctx.runQuery(
      internal.messages.getRecentOutboundAfter,
      {
        clientId: commitment.clientId,
        after:    (commitment.dueDate as number) - FOLLOW_UP_WINDOW_MS,
      }
    );
    if (outboundMessages.length > 0) continue;

    const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
      userId,
      skillSlug: "payment_sentinel",
      clientId:  commitment.clientId,
      withinMs:  72 * 60 * 60 * 1000,
    });
    if (recent) continue;

    const daysOverdue = Math.round(
      (now - (commitment.dueDate as number)) / (24 * 60 * 60 * 1000)
    );

    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug: "payment_sentinel",
      clientId:  commitment.clientId,
      type:      "alert",
      severity:  "critical",
      title:     `Revenue leakage: unacknowledged payment (${daysOverdue}d overdue)`,
      content:   `"${commitment.text}" is overdue with no follow-up message sent. Follow up now to recover this payment.`,
      metadata: {
        type:           "revenue_leakage",
        commitmentText: commitment.text,
        dueDate:        commitment.dueDate,
        daysOverdue,
      },
      actionable: true,
      expiresAt:  Date.now() + 48 * 60 * 60 * 1000,
    });
  }
}

// --- Crisis Mode Detector ---
// High aggregate churn risk + 2+ consecutive negative messages → escalate.
// Zero AI calls — reads existing aiMetadata from DB.
const CRISIS_NEGATIVE_SENTIMENTS = new Set(["negative", "frustrated", "angry"]);

async function runCrisisMode(ctx: any, userId: any) {
  const churnConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
    userId,
    skillSlug: "churn_predictor",
  });
  if (!churnConfig.enabled) return;

  const clients: any[] = await ctx.runQuery(
    internal.clients.getActiveByUserInternal,
    { userId }
  );

  for (const client of clients) {
    if (client.intelligence?.aggregateChurnRisk !== "high") continue;

    const recentInbound: any[] = await ctx.runQuery(
      internal.messages.getRecentInboundByClient,
      { clientId: client._id, limit: 5 }
    );
    if (recentInbound.length < 2) continue;

    const lastTwo    = recentInbound.slice(0, 2);
    const allNegative = lastTwo.every((m: any) =>
      CRISIS_NEGATIVE_SENTIMENTS.has(m.aiMetadata?.sentiment ?? "")
    );
    if (!allNegative) continue;

    const recent = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
      userId,
      skillSlug: "churn_predictor",
      clientId:  client._id,
      withinMs:  72 * 60 * 60 * 1000,
    });
    if (recent) continue;

    // Build personalised recovery template using the client's first name
    const firstName       = client.name.split(" ")[0];
    const recoveryTemplate =
      `Hi ${firstName},\n\nI wanted to personally reach out — I sense our recent conversations may not have fully met your expectations, and I take that seriously.\n\nI'd love to schedule a quick 15-minute call this week to make sure we're aligned and to address any concerns you have. What time works best for you?\n\nBest,`;

    await ctx.runMutation(internal.skills.createOutput, {
      userId,
      skillSlug:  "churn_predictor",
      clientId:   client._id,
      type:       "alert",
      severity:   "critical",
      title:      `Crisis mode: ${client.name} — immediate outreach needed`,
      content:    `High churn risk + 2 consecutive negative messages. A recovery message has been drafted — send it now.`,
      metadata: {
        crisisMode:          true,
        churnRisk:           "high",
        clientName:          client.name,
        recoveryTemplate,
        negativeMessageCount: lastTwo.length,
      },
      actionable: true,
      expiresAt:  Date.now() + 48 * 60 * 60 * 1000,
    });
  }
}

// ============================================
// DEDUPLICATION HELPER
// ============================================
//
// Returns true if a recent output already exists for this skill+client combo,
// preventing duplicate alerts from rapid message processing or repeated crons.
//
// KEY FIX: The previous implementation filtered out isDismissed outputs, which
// caused the dedup window to reset whenever a user dismissed an alert. This
// led to the alert re-firing on the very next cron run.
//
// New behaviour:
//   - ANY output (dismissed, actioned, or active) within the dedup window
//     blocks a new alert from being created.
//   - The alert only re-fires once the dedup window expires, regardless of
//     whether the user dismissed or acted on the previous one.

export const hasRecentOutput = internalQuery({
  args: {
    userId:    v.id("users"),
    skillSlug: v.string(),
    clientId:  v.optional(v.id("clients")),
    withinMs:  v.number(),
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

    // Check for ANY output within the window (dismissed or not).
    // Previously: `!o.isDismissed` was AND-ed in, letting dismissed outputs
    // slip through the dedup guard and trigger duplicate alerts.
    return outputs.some(
      (o) =>
        o.createdAt >= cutoff &&
        (!args.clientId || o.clientId === args.clientId)
    );
  },
});
