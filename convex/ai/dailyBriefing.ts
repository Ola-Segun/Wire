"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { callLLM } from "./llm";

// ============================================
// DAILY BRIEFING — Portfolio-level AI synthesis
// ============================================
//
// Architecture: Zero-duplication, minimal tokens.
//
// Step 1 (free):  Fetch clients + intelligence + commitments from DB.
// Step 2 (free):  Deterministically classify each client into
//                 topPriorities / riskFlags / opportunities using existing
//                 intelligence fields — no Claude call needed for structure.
// Step 3 (Haiku): Send a concise portfolio summary (~150 tokens) to Haiku.
//                 Haiku writes ONLY 3 narrative strings:
//                   headline / workloadSummary / suggestedFocus
//                 (~150 tokens output).  Total cost: ~$0.0001 per user/day.
// Step 4 (free):  Persist as a skill_output (skillSlug: "daily_briefing")
//                 that expires in 25h, auto-cleaned by the existing cron.
//
// Deduplication: hasRecentOutput check ensures at most one briefing per 20h.

// Cap clients sent to prompt to avoid runaway token spend on large portfolios.
const MAX_CLIENTS_IN_PROMPT = 12;

// ─── Haiku prompt ────────────────────────────────────────────────────────────

const BRIEFING_SYSTEM = `You are a business intelligence assistant for a freelancer.
Given a structured portfolio snapshot, produce three concise narrative fields.
Be direct and specific — no filler phrases.

Respond ONLY with valid JSON matching this schema exactly:
{
  "headline": "one sentence (≤20 words) summarising the single most important thing today",
  "workloadSummary": "one sentence describing overall workload and message volume",
  "suggestedFocus": "one specific, actionable recommendation (name the client or action)"
}`;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    let text = raw.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface ClientClassification {
  isPriority: boolean;
  isAtRisk: boolean;
  hasOpportunity: boolean;
  priorityReason?: string;
  riskReason?: string;
  opportunityReason?: string;
  riskSeverity: "critical" | "high" | "medium";
}

function classifyClient(
  client: Record<string, any>,
  alertClientIds: Set<string>
): ClientClassification {
  const intel = client.intelligence as Record<string, any> | undefined | null;
  const result: ClientClassification = {
    isPriority: false,
    isAtRisk: false,
    hasOpportunity: false,
    riskSeverity: "medium",
  };

  // ── Risk ──────────────────────────────────────────────────────────────────
  if (intel?.aggregateChurnRisk === "critical") {
    result.isAtRisk = true;
    result.riskReason = "Critical churn risk";
    result.riskSeverity = "critical";
  } else if (intel?.aggregateChurnRisk === "high") {
    result.isAtRisk = true;
    result.riskReason = "High churn risk";
    result.riskSeverity = "high";
  } else if (intel?.sentimentTrend === "declining") {
    result.isAtRisk = true;
    result.riskReason = "Sentiment declining";
    result.riskSeverity = "high";
  } else if (intel?.contractionSignals > 0) {
    result.isAtRisk = true;
    result.riskReason = "Budget contraction signals";
    result.riskSeverity = "medium";
  }

  // ── Opportunity ───────────────────────────────────────────────────────────
  if (intel && intel.dealSignalCount > 0) {
    result.hasOpportunity = true;
    result.opportunityReason = `${intel.dealSignalCount} deal signal${intel.dealSignalCount > 1 ? "s" : ""}`;
  } else if (intel && intel.expansionSignals > 0) {
    result.hasOpportunity = true;
    result.opportunityReason = "Expansion opportunity detected";
  }

  // ── Priority: phase + alert + risk ────────────────────────────────────────
  if (intel?.dominantPhase === "closing") {
    result.isPriority = true;
    result.priorityReason = "Project in closing phase";
  } else if (intel?.dominantPhase === "negotiation") {
    result.isPriority = true;
    result.priorityReason = "Active negotiation";
  } else if (alertClientIds.has(client._id)) {
    result.isPriority = true;
    result.priorityReason = "Recent skill alert";
  } else if (result.isAtRisk) {
    result.isPriority = true;
    result.priorityReason = result.riskReason!;
  } else if (result.hasOpportunity) {
    result.isPriority = true;
    result.priorityReason = result.opportunityReason!;
  }

  return result;
}

// ─── Core: generate briefing for one user ─────────────────────────────────────

export const generateForUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<void> => {
    // Dedup: one briefing per 20h (allows some cron drift)
    const alreadyDone = await ctx.runQuery(
      internal.skillDispatcher.hasRecentOutput,
      {
        userId: args.userId,
        skillSlug: "daily_briefing",
        withinMs: 20 * 60 * 60 * 1000,
      }
    );
    if (alreadyDone) return;

    // Skill gate
    const skillConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
      userId: args.userId,
      skillSlug: "daily_briefing",
    });
    if (!skillConfig.enabled) return;

    // ── 1. Fetch portfolio data ─────────────────────────────────────────────
    const clients: Array<Record<string, any>> = await ctx.runQuery(
      internal.clients.getActiveByUserInternal,
      { userId: args.userId }
    );
    if (clients.length === 0) return;

    const [recentOutputs, pendingCommitments] = await Promise.all([
      ctx.runQuery(internal.skills.getRecentByUserInternal, {
        userId: args.userId,
        withinMs: 24 * 60 * 60 * 1000,
      }),
      ctx.runQuery(internal.commitments.getPendingInternal, {
        userId: args.userId,
      }),
    ]);

    const alertClientIds = new Set<string>(
      (recentOutputs as Array<Record<string, any>>)
        .filter((o) => o.clientId && o.severity !== "info")
        .map((o) => o.clientId as string)
    );

    const overdueCommitments = (pendingCommitments as Array<Record<string, any>>).filter(
      (c) => c.dueDate && c.dueDate < Date.now()
    );

    // ── 2. Classify clients deterministically ──────────────────────────────
    type Priority = { clientId: string; clientName: string; reason: string; urgency: "high" | "medium" };
    type RiskFlag = { clientId: string; clientName: string; risk: string; severity: "critical" | "high" | "medium" };
    type Opportunity = { clientId: string; clientName: string; opportunity: string };

    const topPriorities: Priority[] = [];
    const riskFlags: RiskFlag[] = [];
    const opportunities: Opportunity[] = [];

    for (const client of clients.slice(0, MAX_CLIENTS_IN_PROMPT)) {
      const cls = classifyClient(client, alertClientIds);

      if (cls.isAtRisk) {
        riskFlags.push({
          clientId: client._id,
          clientName: client.name,
          risk: cls.riskReason!,
          severity: cls.riskSeverity,
        });
      }

      if (cls.hasOpportunity) {
        opportunities.push({
          clientId: client._id,
          clientName: client.name,
          opportunity: cls.opportunityReason!,
        });
      }

      if (cls.isPriority) {
        topPriorities.push({
          clientId: client._id,
          clientName: client.name,
          reason: cls.priorityReason!,
          urgency: cls.riskSeverity === "critical" || alertClientIds.has(client._id) ? "high" : "medium",
        });
      }
    }

    // Keep top N per category (most severe first)
    topPriorities.splice(5);
    riskFlags.splice(5);
    opportunities.splice(5);

    const stats = {
      totalClients: clients.length,
      atRiskClients: riskFlags.length,
      opportunityClients: opportunities.length,
      overdueCommitments: overdueCommitments.length,
      activeAlerts: (recentOutputs as any[]).length,
    };

    // ── 3. Haiku: narrative only (~300 combined tokens) ─────────────────────
    // Always include actual client names so the AI can reference them by name
    // rather than inventing generic placeholders when all clients are healthy.
    const allClientNames = clients
      .slice(0, MAX_CLIENTS_IN_PROMPT)
      .map((c) => c.name as string)
      .join(", ");

    const portfolioLines = [
      `Clients (${stats.totalClients}): ${allClientNames}`,
      `Top priorities: ${topPriorities.map((p) => `${p.clientName} (${p.reason})`).join(", ") || "none"}`,
      `At-risk: ${riskFlags.map((r) => `${r.clientName} — ${r.risk}`).join(", ") || "none"}`,
      `Opportunities: ${opportunities.map((o) => `${o.clientName} — ${o.opportunity}`).join(", ") || "none"}`,
      `Overdue commitments: ${stats.overdueCommitments}`,
      `Active alerts: ${stats.activeAlerts}`,
    ];

    // Fallback narrative (used if Haiku fails)
    let headline = topPriorities[0]
      ? `${topPriorities[0].clientName} needs attention — ${topPriorities[0].reason.toLowerCase()}.`
      : `All ${stats.totalClients} clients are on track today.`;
    let workloadSummary = `You have ${stats.totalClients} active clients with ${stats.overdueCommitments} overdue commitment${stats.overdueCommitments !== 1 ? "s" : ""}.`;
    let suggestedFocus = topPriorities[0]
      ? `Focus on ${topPriorities[0].clientName}: ${topPriorities[0].reason.toLowerCase()}.`
      : "Review your client health scores today.";

    try {
      const rawText = await callLLM({
        systemPrompt: BRIEFING_SYSTEM,
        userPrompt: portfolioLines.join("\n"),
        maxTokens: 200,
        preferFast: true,
      });

      const parsed = safeParseJson(rawText);
      if (parsed) {
        if (typeof parsed.headline === "string") headline = parsed.headline;
        if (typeof parsed.workloadSummary === "string") workloadSummary = parsed.workloadSummary;
        if (typeof parsed.suggestedFocus === "string") suggestedFocus = parsed.suggestedFocus;
      }
    } catch (err) {
      // Narrative generation failed — persist with computed fallbacks
      console.warn("[DailyBriefing] Narrative generation failed, using fallbacks:", String(err).split("\n")[0]);
    }

    // ── 4. Persist ──────────────────────────────────────────────────────────
    await ctx.runMutation(internal.skills.createOutput, {
      userId: args.userId,
      skillSlug: "daily_briefing",
      type: "briefing",
      severity: riskFlags.some((r) => r.severity === "critical")
        ? "critical"
        : riskFlags.length > 0
          ? "warning"
          : "info",
      title: `Daily Briefing — ${new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })}`,
      content: headline,
      metadata: {
        topPriorities,
        riskFlags,
        opportunities,
        workloadSummary,
        suggestedFocus,
        stats,
        generatedAt: Date.now(),
      },
      actionable: topPriorities.length > 0,
      expiresAt: Date.now() + 25 * 60 * 60 * 1000, // 25h — covers cron drift
    });
  },
});

// ─── User-facing on-demand trigger ───────────────────────────────────────────
// Called from the workspace widget empty state — respects the 20h dedup guard.
// Only generates if no briefing exists yet today (cron at 7am UTC handles the rest).

export const generateNow = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user: Record<string, any> | null = await ctx.runQuery(
      api.users.getByClerkId,
      { clerkId: identity.subject }
    );
    if (!user) throw new Error("User not found");

    await ctx.runAction(internal.ai.dailyBriefing.generateForUser, {
      userId: user._id,
    });

    return { success: true };
  },
});
