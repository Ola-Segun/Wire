"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { callLLM } from "./llm";

// On-demand skills always prefer the fast/cheap model (Haiku on Anthropic,
// NVIDIA fallback uses the configured NVIDIA_MODEL).

// Token guards
const MAX_MESSAGE_CHARS = 2_000;
const MAX_THREAD_CHARS = 8_000;

// Safe JSON parse — strips markdown fences, returns null on failure.
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

// ─── Client intelligence context builder ─────────────────────────────────────
//
// Converts client-level aggregated intelligence into a compact, token-efficient
// context block that steers reply strategy at the relationship level.
//
// Strategy hints injected:
//   dominantPhase=closing    → suggest confirming, forward-moving language
//   dominantPhase=negotiation → suggest clear, precise language
//   sentimentTrend=declining → suggest empathetic, reassuring language
//   aggregateChurnRisk=high  → suggest retention-focused language
//   hiddenRequests           → surface unaddressed concerns in replies

function buildIntelligenceContext(intel: Record<string, any>): string {
  const hints: string[] = [];

  if (intel.dominantPhase === "closing")
    hints.push("project is in closing phase — use confirming, forward-moving language");
  else if (intel.dominantPhase === "negotiation")
    hints.push("in negotiation — be clear and precise");
  else if (intel.dominantPhase === "delivery")
    hints.push("in active delivery — focus on progress and next steps");

  if (intel.sentimentTrend === "declining")
    hints.push("sentiment is declining — be empathetic and reassuring");
  else if (intel.sentimentTrend === "improving")
    hints.push("relationship is warming — a slightly warmer tone is appropriate");

  if (intel.aggregateChurnRisk === "high" || intel.aggregateChurnRisk === "critical")
    hints.push("high churn risk — prioritise retention and clear value communication");

  if (Array.isArray(intel.hiddenRequests) && intel.hiddenRequests.length > 0)
    hints.push(`unaddressed concern detected: "${intel.hiddenRequests[0]}"`);

  if (hints.length === 0) return "";
  return `\nRelationship context: ${hints.join("; ")}.`;
}

// ============================================
// SMART REPLIES — Generate contextual reply suggestions
// ============================================
// Cost: 1 Haiku call per invocation (~$0.001).
// Only fires when user clicks "Suggest Replies" on a message.

const SMART_REPLIES_SYSTEM = `You are a reply assistant for freelancers communicating with clients.
Given a client message and context, generate short, professional reply suggestions.
Each reply should be distinct in approach (e.g., one direct, one empathetic, one action-oriented).
Keep replies concise (1-3 sentences max).

Respond ONLY with valid JSON matching this schema:
{
  "replies": [
    { "label": "short label (2-4 words)", "text": "the reply text" }
  ]
}`;

export const generateSmartReplies = action({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args): Promise<{
    replies: Array<{ label: string; text: string }>;
  }> => {
    const message: Record<string, any> | null = await ctx.runQuery(
      api.messages.get,
      { id: args.messageId }
    );
    if (!message) throw new Error("Message not found");

    // Check skill is enabled for this user
    const enabled = await ctx.runQuery(internal.skills.isSkillEnabled, {
      userId: message.userId,
      skillSlug: "smart_replies",
    });
    if (!enabled) {
      return { replies: [] };
    }

    // Get reply count from config
    const skillConfig = await ctx.runQuery(internal.skills.getSkillConfig, {
      userId: message.userId,
      skillSlug: "smart_replies",
    });
    const replyCount = (skillConfig.config as any)?.replyCount ?? 3;

    // Fetch client context for personalization
    const client: Record<string, any> | null = await ctx.runQuery(
      internal.clients.getInternal,
      { id: message.clientId }
    );

    const safeText =
      message.text.length > MAX_MESSAGE_CHARS
        ? message.text.slice(0, MAX_MESSAGE_CHARS) + "\n[truncated]"
        : message.text;

    // Message-level AI signals (already computed, free)
    const metaContext = message.aiMetadata
      ? `\nMessage signals — Sentiment: ${message.aiMetadata.sentiment ?? "unknown"}, Intent: ${message.aiMetadata.clientIntent ?? "unknown"}, Urgency: ${message.aiMetadata.urgency ?? "normal"}${message.aiMetadata.dealSignal && message.aiMetadata.dealSignal !== "none" ? `, Deal signal: ${message.aiMetadata.dealSignal}` : ""}${message.aiMetadata.churnRisk && message.aiMetadata.churnRisk !== "low" ? `, Churn risk: ${message.aiMetadata.churnRisk}` : ""}${message.aiMetadata.hiddenRequests?.length ? `, Hidden concern: "${message.aiMetadata.hiddenRequests[0]}"` : ""}`
      : "";

    // Client-level intelligence signals (zero extra DB calls — already fetched)
    // These shape reply strategy at a relationship level, not just per message.
    const intel = client?.intelligence as Record<string, any> | undefined | null;
    const intelligenceContext = intel
      ? buildIntelligenceContext(intel)
      : "";

    const userPrompt = `Generate ${replyCount} reply suggestions for this client message.

Client: ${client?.name ?? "Unknown"}${client?.company ? ` (${client.company})` : ""}
Platform: ${message.platform}${metaContext}${intelligenceContext}

Client's message:
"${safeText}"`;

    try {
      const rawText = await callLLM({
        systemPrompt: SMART_REPLIES_SYSTEM,
        userPrompt,
        maxTokens: 400,
        preferFast: true,
      });

      const result = safeParseJson(rawText);
      if (result && Array.isArray(result.replies)) {
        return {
          replies: (result.replies as Array<Record<string, unknown>>)
            .filter(
              (r) => typeof r.label === "string" && typeof r.text === "string"
            )
            .slice(0, replyCount)
            .map((r) => ({ label: r.label as string, text: r.text as string })),
        };
      }

      return { replies: [] };
    } catch (err) {
      console.error("Smart replies failed:", err);
      return { replies: [] };
    }
  },
});

// ============================================
// THREAD SUMMARIZER — Generate conversation summaries
// ============================================
// Cost: 1 Haiku call per invocation (~$0.002 for longer threads).
// Only fires when user clicks "Summarize Thread" on a conversation.

const THREAD_SUMMARY_SYSTEM = `You are a conversation analyst for freelancers.
Given a conversation thread between a freelancer and client, produce a structured summary.
Focus on what matters: decisions, open items, tone shifts, and key takeaways.

Respond ONLY with valid JSON matching this schema:
{
  "summary": "2-4 sentence TL;DR of the conversation",
  "arc": "discovery|negotiation|active|delivery|closing|dormant",
  "keyDecisions": ["decision 1", "decision 2"],
  "openItems": ["unresolved topic 1"],
  "toneShift": "improving|stable|declining|null",
  "actionItems": ["action 1"]
}`;

export const summarizeThread = action({
  args: {
    clientId: v.id("clients"),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args): Promise<{
    summary: string;
    arc: string;
    keyDecisions: string[];
    openItems: string[];
    toneShift: string | null;
    actionItems: string[];
  }> => {
    // Get messages for this client (or conversation if specified)
    const messages: Array<Record<string, any>> = await ctx.runQuery(
      internal.messages.getByClientInternal,
      { clientId: args.clientId, limit: 50 }
    );

    if (messages.length < 3) {
      return {
        summary: "Not enough messages to summarize.",
        arc: "discovery",
        keyDecisions: [],
        openItems: [],
        toneShift: null,
        actionItems: [],
      };
    }

    // Check skill is enabled
    const userId = messages[0].userId;
    const enabled = await ctx.runQuery(internal.skills.isSkillEnabled, {
      userId,
      skillSlug: "thread_summarizer",
    });
    if (!enabled) {
      return {
        summary: "Thread Summarizer skill is not enabled.",
        arc: "active",
        keyDecisions: [],
        openItems: [],
        toneShift: null,
        actionItems: [],
      };
    }

    const client: Record<string, any> | null = await ctx.runQuery(
      internal.clients.getInternal,
      { id: args.clientId }
    );

    // Build thread text — chronological, capped to token budget
    const sorted = [...messages].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    let threadText = "";
    for (const msg of sorted) {
      const role = msg.direction === "inbound" ? (client?.name ?? "Client") : "You";
      const line = `[${role}]: ${msg.text}\n`;
      if (threadText.length + line.length > MAX_THREAD_CHARS) {
        threadText += "\n[older messages truncated]\n";
        break;
      }
      threadText += line;
    }

    const userPrompt = `Summarize this conversation thread.

Client: ${client?.name ?? "Unknown"}${client?.company ? ` (${client.company})` : ""}
Messages: ${messages.length} total

Thread:
${threadText}`;

    try {
      const rawText = await callLLM({
        systemPrompt: THREAD_SUMMARY_SYSTEM,
        userPrompt,
        maxTokens: 500,
        preferFast: true,
      });

      const result = safeParseJson(rawText);
      if (!result) throw new Error("Failed to parse summary");

      const summary = {
        summary: (typeof result.summary === "string" ? result.summary : "Unable to summarize."),
        arc: (["discovery", "negotiation", "active", "delivery", "closing", "dormant"].includes(result.arc as string)
          ? result.arc as string : "active"),
        keyDecisions: Array.isArray(result.keyDecisions)
          ? (result.keyDecisions as unknown[]).filter((d): d is string => typeof d === "string").slice(0, 10)
          : [],
        openItems: Array.isArray(result.openItems)
          ? (result.openItems as unknown[]).filter((d): d is string => typeof d === "string").slice(0, 10)
          : [],
        toneShift: (["improving", "stable", "declining"].includes(result.toneShift as string)
          ? result.toneShift as string : null),
        actionItems: Array.isArray(result.actionItems)
          ? (result.actionItems as unknown[]).filter((d): d is string => typeof d === "string").slice(0, 10)
          : [],
      };

      // Persist to conversation_summaries for caching (avoids re-summarizing)
      if (args.conversationId) {
        await ctx.runMutation(internal.conversationSummaries.upsert, {
          userId,
          conversationId: args.conversationId,
          clientId: args.clientId,
          summary: summary.summary,
          arc: summary.arc,
          openCommitments: summary.openItems.length,
          decisionsMade: summary.keyDecisions,
          unresolvedTopics: summary.openItems,
          toneShift: summary.toneShift ?? undefined,
          messageCount: messages.length,
        });
      }

      return summary;
    } catch (err) {
      console.error("Thread summarization failed:", err);
      return {
        summary: "Failed to generate summary. Please try again.",
        arc: "active",
        keyDecisions: [],
        openItems: [],
        toneShift: null,
        actionItems: [],
      };
    }
  },
});

// ============================================
// AUTO-SUMMARIZE — Cron-driven, respects skill enablement
// ============================================
// Called by health.recalculateAll every 4 hours for each client.
// Finds the client's most-recent active conversation and re-summarizes
// it only when the conversation has grown since the last summary, or
// no summary exists yet.
//
// Cost model:
//   - 0 Claude calls when: skill disabled, conversation unchanged, or < 10 messages
//   - 1 Haiku call (~$0.002) when a stale/missing summary is detected
//
// Max 1 conversation per client per cron cycle to bound costs at scale.

const SUMMARIZE_MIN_MESSAGES = 10;        // Don't summarize tiny threads
const SUMMARIZE_STALE_MS = 24 * 60 * 60 * 1000; // Re-summarize if >24h old

export const autoSummarizeForClient = internalAction({
  args: {
    clientId: v.id("clients"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<void> => {
    // Respect the user's skill preference — if they've disabled
    // thread_summarizer, automatic summarization should also stop.
    const enabled = await ctx.runQuery(internal.skills.isSkillEnabled, {
      userId: args.userId,
      skillSlug: "thread_summarizer",
    });
    if (!enabled) return;

    // Get the most-recent active conversation for this client.
    // We target only the freshest thread — older ones are less actionable.
    const conversation = await ctx.runQuery(
      internal.conversations.getMostRecentActiveByClientInternal,
      { clientId: args.clientId }
    );
    if (!conversation || conversation.messageCount < SUMMARIZE_MIN_MESSAGES) return;

    // Check if an existing summary is still fresh and complete.
    const existing = await ctx.runQuery(
      internal.conversationSummaries.getByConversationInternal,
      { conversationId: conversation._id }
    );

    const now = Date.now();
    const isFresh =
      existing &&
      now - existing.updatedAt < SUMMARIZE_STALE_MS &&
      existing.messageCount >= conversation.messageCount;

    if (isFresh) return; // Nothing to do

    // Summary is stale or missing — run the summarizer.
    // Re-uses the public summarizeThread action so we don't duplicate the
    // LLM prompt logic. The action also persists the result via upsert.
    try {
      await ctx.runAction(api.ai.onDemandSkills.summarizeThread, {
        clientId: args.clientId,
        conversationId: conversation._id,
      });
    } catch (err) {
      // Log but don't throw — health cron must not fail because of a
      // summarization error on a single client.
      console.error(
        `[AutoSummarize] Failed for client ${args.clientId}:`,
        String(err).split("\n")[0]
      );
    }
  },
});
