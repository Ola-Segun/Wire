"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { callLLM, ANTHROPIC_FAST_MODEL, ANTHROPIC_QUALITY_MODEL } from "./llm";

// ─── Safety & Cost Constants ─────────────────────────────────────────────────

// Hard cap on message text sent to the AI (~1 000 input tokens).
// Prevents runaway costs from unusually large payloads (pasted documents, etc).
const MAX_TEXT_CHARS = 4_000;

// Model routing thresholds.
// Short messages with no urgency signals use Haiku (~10× cheaper than Sonnet).
// Longer or time-sensitive messages use Sonnet for better reasoning quality.
// Model names imported from llm.ts — single source of truth.
const HAIKU_THRESHOLD_CHARS = 280;
const URGENCY_PATTERN = /\b(urgent|asap|immediately|deadline|critical|emergency|today|tonight)\b/i;

// Rate limit: max 30 AI analyses per user per minute.
// Guards against a sudden flood of messages (e.g. large first-time sync)
// exhausting the Anthropic budget in a single burst.
const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_MAX       = 30;

// Safe defaults applied when AI returns unexpected or unparseable output.
// Prefer a neutral result over crashing and leaving the message unprocessed.
const FALLBACK_METADATA = {
  priorityScore: 30,
  urgency: "normal" as string,
  sentiment: "neutral" as string,
  extractedActions: [] as string[],
  scopeCreepDetected: false,
  topics: [] as string[],
  // Deep extraction defaults
  dealSignal: false,
  churnRisk: "none" as string,
  projectPhase: "active" as string,
  hiddenRequests: [] as string[],
  valueSignal: null as string | null,
  clientIntent: "informing" as string,
  // Temporal extraction — populated from AI field 13, undefined when no dates extracted
  extractedActionsWithDates: undefined as Array<{
    text: string;
    dueDateIso?: string;
    dueTimeOfDay?: string;
    confidence: string;
    resolvedTimestamp?: number;
  }> | undefined,
};

// ─── System Prompt (prompt-cached) ───────────────────────────────────────────

// Cached for 5 minutes across all messages — saves ~90% of system-prompt tokens.
const ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant for a freelancer communication tool called Wire.
You analyze client messages and provide structured JSON output.

Your analysis must include ALL of the following in a single response:

1. **Priority Score** (0-100): How urgently does this message need attention?
   - Consider: urgency indicators (ASAP, urgent, deadline), client value, sentiment, time sensitivity
   - 80+ = urgent, 60-79 = high, 40-59 = normal, <40 = low

2. **Urgency Label**: "urgent" | "high" | "normal" | "low"

3. **Sentiment**: "positive" | "neutral" | "negative" | "frustrated"
   - Analyze the emotional tone of the message

4. **Extracted Actions**: Array of action items mentioned in the message
   - Only include concrete, actionable items

5. **Scope Creep Detection**: Is the client requesting work beyond the agreed scope?

6. **Topics**: Key topics or themes in the message (1-3 words each)

7. **Deal Signal**: Is the client signaling agreement, purchase intent, or readiness to proceed?
   - Look for: "let's do it", "go ahead", "send the invoice", "approved", "sounds good, proceed"

8. **Churn Risk**: Is there any sign the client may disengage or leave?
   - "none" = no signals, "low" = minor concern, "medium" = notable disengagement, "high" = likely churning
   - Look for: "exploring alternatives", delayed responses mentioned, reduced enthusiasm, "my manager wants to review", "budget concerns"

9. **Project Phase**: What phase of the engagement does this message suggest?
   - "discovery" = initial conversations, requirements gathering
   - "negotiation" = discussing terms, pricing, scope
   - "active" = work is underway, regular updates
   - "delivery" = reviewing deliverables, feedback rounds
   - "closing" = wrapping up, final approvals, payment
   - "dormant" = no active work discussed

10. **Hidden Requests**: Things implied but not explicitly asked for
    - "it would be nice if..." = feature request
    - "I noticed that..." = implicit bug report / change request
    - Indirect asks disguised as observations or wishes

11. **Value Signal**: Is the client's budget/scope expanding, stable, or contracting?
    - "expansion" = "can you also handle...", "we might need more...", scope growing
    - "stable" = normal project discussion
    - "contraction" = "let's scale back", "budget is tight", scope shrinking
    - null = no signal

12. **Client Intent**: What is the client's primary purpose in this message?
    - "requesting" = asking for something to be done
    - "approving" = giving the green light on something
    - "rejecting" = declining, pushing back, saying no
    - "informing" = sharing information, no action needed
    - "escalating" = raising urgency, expressing dissatisfaction with progress

13. **Extracted Actions With Dates**: For every item in extractedActions, provide its temporal information.
    The array MUST have the same length and order as extractedActions.
    - Parse explicit dates: "on the 4th of March" → dueDateIso: "2026-03-04"
    - Parse relative dates: "by this evening" → dueDateIso: "relative:today", dueTimeOfDay: "evening"
    - Parse relative days: "call me tomorrow" → dueDateIso: "relative:tomorrow"
    - Parse next week: "by next week" → dueDateIso: "relative:next_week"
    - confidence: "explicit" if specific date/time stated, "inferred" if vague timing (e.g. "soon", "this week"),
      "none" if no timing is given
    - If no date for an action, set dueDateIso and dueTimeOfDay to null and confidence to "none"

Respond ONLY with valid JSON matching this exact schema:
{
  "priorityScore": number,
  "urgency": "urgent" | "high" | "normal" | "low",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "sentimentConfidence": number,
  "extractedActions": string[],
  "scopeCreepDetected": boolean,
  "topics": string[],
  "dealSignal": boolean,
  "churnRisk": "none" | "low" | "medium" | "high",
  "projectPhase": "discovery" | "negotiation" | "active" | "delivery" | "closing" | "dormant",
  "hiddenRequests": string[],
  "valueSignal": "expansion" | "stable" | "contraction" | null,
  "clientIntent": "requesting" | "approving" | "rejecting" | "informing" | "escalating",
  "extractedActionsWithDates": [
    {
      "text": "action text matching extractedActions entry",
      "dueDateIso": "YYYY-MM-DD | relative:today | relative:tomorrow | relative:next_week | null",
      "dueTimeOfDay": "morning | afternoon | evening | end_of_day | HH:MM | null",
      "confidence": "explicit | inferred | none"
    }
  ]
}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Resolve a potentially-relative dueDateIso + dueTimeOfDay to an absolute epoch timestamp.
// Uses the message's own timestamp as the "today" anchor so relative dates are
// always interpreted relative to when the client actually sent the message.
//
// Returns undefined when the date cannot be resolved (null input, bad ISO, etc.)
function resolveActionDueDate(
  dueDateIso: string | null | undefined,
  dueTimeOfDay: string | null | undefined,
  messageTimestamp: number
): number | undefined {
  if (!dueDateIso) return undefined;

  let base: Date;

  if (dueDateIso.startsWith("relative:")) {
    const rel = dueDateIso.slice("relative:".length);
    base = new Date(messageTimestamp);
    base.setHours(0, 0, 0, 0); // midnight of message day

    if (rel === "today") {
      // base is already the message day
    } else if (rel === "tomorrow") {
      base.setDate(base.getDate() + 1);
    } else if (rel === "next_week") {
      base.setDate(base.getDate() + 7);
    } else {
      return undefined; // unknown relative key
    }
  } else {
    // Expect "YYYY-MM-DD"
    const parsed = new Date(dueDateIso + "T00:00:00Z");
    if (isNaN(parsed.getTime())) return undefined;
    base = parsed;
  }

  // Apply time-of-day offset (defaults to end-of-business if unspecified)
  if (dueTimeOfDay) {
    const TOD: Record<string, number> = {
      morning:    9,
      afternoon: 14,
      evening:   18,
      end_of_day: 17,
    };
    if (TOD[dueTimeOfDay] !== undefined) {
      base.setUTCHours(TOD[dueTimeOfDay], 0, 0, 0);
    } else if (/^\d{2}:\d{2}$/.test(dueTimeOfDay)) {
      const [h, m] = dueTimeOfDay.split(":").map(Number);
      base.setUTCHours(h, m, 0, 0);
    } else {
      base.setUTCHours(17, 0, 0, 0);
    }
  } else {
    base.setUTCHours(17, 0, 0, 0); // end-of-business default
  }

  return base.getTime();
}

// Route to Haiku for short, non-urgent messages; Sonnet for everything else.
function selectModel(text: string): string {
  if (text.length <= HAIKU_THRESHOLD_CHARS && !URGENCY_PATTERN.test(text)) {
    return ANTHROPIC_FAST_MODEL;
  }
  return ANTHROPIC_QUALITY_MODEL;
}

// Safe JSON parse — strips markdown fences, returns null on failure.
// Prevents a rare malformed AI response from crashing the entire analysis.
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

// ─── analyzeMessage ───────────────────────────────────────────────────────────

// Unified analysis: 1 API call → priority + sentiment + actions + scope + topics.
// Prompt-cached system prompt + model routing + rate limiting + DLQ on failure.
export const analyzeMessage = action({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(api.messages.get, { id: args.messageId });
    if (!message) throw new Error("Message not found");

    // Guard 1: Skip already-processed messages.
    // Prevents double-analysis from the event trigger + batch cron race window.
    if (message.aiProcessed) return null;

    // Guard 2: Skip outbound messages — only analyse what clients send us.
    if (message.direction !== "inbound") {
      await ctx.runMutation(api.messages.markAsProcessed, { messageId: args.messageId });
      return null;
    }

    // Guard 3: Skip trivially short messages (reactions, one-word replies, etc).
    if (message.text.length < 5) {
      const minimal = { ...FALLBACK_METADATA, priorityScore: 20, urgency: "low" };
      await ctx.runMutation(api.messages.updateAiMetadata, { messageId: args.messageId, metadata: minimal });
      await ctx.runMutation(api.messages.markAsProcessed, { messageId: args.messageId });
      return minimal;
    }

    // Guard 4: Per-user rate limit — defer if over budget, leave for next cron cycle.
    const rateCheck = await ctx.runQuery(api.rateLimit.check, {
      key: `ai:${message.userId}`,
      windowMs: AI_RATE_WINDOW_MS,
      maxRequests: AI_RATE_MAX,
    });
    if (!rateCheck.allowed) {
      console.warn(`AI rate limit hit for user ${message.userId} — deferring ${args.messageId}`);
      return null; // aiProcessed stays false → picked up by next batch cron
    }
    await ctx.runMutation(api.rateLimit.record, { key: `ai:${message.userId}` });

    // Token guard: truncate long messages before sending to AI.
    const safeText = message.text.length > MAX_TEXT_CHARS
      ? message.text.slice(0, MAX_TEXT_CHARS) + "\n[message truncated for analysis]"
      : message.text;

    // Use internal query — this action runs without user auth (scheduled from mutation).
    const client = await ctx.runQuery(internal.clients.getInternal, { id: message.clientId });

    const userPrompt = `Analyze this client message:

Client: ${client?.name ?? "Unknown"}
Client Value: ${client?.totalRevenue ? `$${client.totalRevenue}` : "Unknown"}
Platform: ${message.platform}
Message:
"${safeText}"`;

    // Model routing: fast (Haiku) for short non-urgent, quality (Sonnet) otherwise.
    const preferFast = selectModel(safeText) === ANTHROPIC_FAST_MODEL;

    let metadata = { ...FALLBACK_METADATA };

    try {
      const rawText = await callLLM({
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 700,
        preferFast,
      });

      const result = safeParseJson(rawText);
      if (result) {
        const score = Math.max(0, Math.min(100, Number(result.priorityScore) || 30));
        metadata = {
          priorityScore: score,
          urgency: (["urgent", "high", "normal", "low"].includes(result.urgency as string)
            ? result.urgency
            : score >= 80 ? "urgent" : score >= 60 ? "high" : "normal") as string,
          sentiment: (["positive", "neutral", "negative", "frustrated"].includes(result.sentiment as string)
            ? result.sentiment
            : "neutral") as string,
          extractedActions: Array.isArray(result.extractedActions)
            ? (result.extractedActions as unknown[]).filter((a): a is string => typeof a === "string")
            : [],
          scopeCreepDetected: Boolean(result.scopeCreepDetected),
          topics: Array.isArray(result.topics)
            ? (result.topics as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 5)
            : [],
          // Deep extraction fields
          dealSignal: Boolean(result.dealSignal),
          churnRisk: (["none", "low", "medium", "high"].includes(result.churnRisk as string)
            ? result.churnRisk : "none") as string,
          projectPhase: (["discovery", "negotiation", "active", "delivery", "closing", "dormant"].includes(result.projectPhase as string)
            ? result.projectPhase : "active") as string,
          hiddenRequests: Array.isArray(result.hiddenRequests)
            ? (result.hiddenRequests as unknown[]).filter((r): r is string => typeof r === "string").slice(0, 5)
            : [],
          valueSignal: (["expansion", "stable", "contraction"].includes(result.valueSignal as string)
            ? result.valueSignal : null) as string | null,
          clientIntent: (["requesting", "approving", "rejecting", "informing", "escalating"].includes(result.clientIntent as string)
            ? result.clientIntent : "informing") as string,
          // Temporal extraction — resolve relative dates using message timestamp as anchor
          extractedActionsWithDates: Array.isArray(result.extractedActionsWithDates)
            ? (result.extractedActionsWithDates as Array<Record<string, any>>)
                .filter((a) => typeof a.text === "string")
                .map((a) => ({
                  text: a.text as string,
                  dueDateIso: typeof a.dueDateIso === "string" ? a.dueDateIso : undefined,
                  dueTimeOfDay: typeof a.dueTimeOfDay === "string" ? a.dueTimeOfDay : undefined,
                  confidence: (["explicit", "inferred", "none"].includes(a.confidence as string)
                    ? a.confidence : "none") as string,
                  resolvedTimestamp: resolveActionDueDate(
                    a.dueDateIso as string | null,
                    a.dueTimeOfDay as string | null,
                    message.timestamp
                  ),
                }))
            : undefined,
        };
      }
      // If safeParseJson returns null → FALLBACK_METADATA used, no crash.
    } catch (err) {
      // Send failed analyses to the dead letter queue for visibility and manual retry.
      try {
        await ctx.runMutation(api.webhookReliability.addToDeadLetter, {
          source: "ai",
          eventType: "message.analysis",
          payload: { messageId: args.messageId },
          error: String(err),
          attempts: 1,
        });
      } catch {
        // DLQ write failing is non-fatal — don't mask the original error
      }
      // Mark as processed to prevent infinite retry loops on persistent failures.
      await ctx.runMutation(api.messages.markAsProcessed, { messageId: args.messageId });
      throw err;
    }

    // Persist metadata and mark processed in sequence (metadata first).
    await ctx.runMutation(api.messages.updateAiMetadata, { messageId: args.messageId, metadata });
    await ctx.runMutation(api.messages.markAsProcessed, { messageId: args.messageId });

    // Persist extracted actions as commitments with AI-resolved due dates (inbound only).
    if (metadata.extractedActions.length > 0) {
      await ctx.runMutation(internal.commitments.createFromExtractedActions, {
        userId: message.userId,
        clientId: message.clientId,
        conversationId: message.conversationId,
        sourceMessageId: args.messageId,
        actions: metadata.extractedActions,
        actionsWithDates: (metadata as any).extractedActionsWithDates ?? [],
      });
    }

    // Fire reactive skills (scope guardian, churn predictor, revenue radar).
    // Cost: 0 Claude calls — skills read the metadata we just persisted.
    await ctx.runAction(internal.skillDispatcher.onMessageAnalyzed, {
      userId: message.userId,
      messageId: args.messageId,
      clientId: message.clientId,
      aiMetadata: metadata,
    });

    return metadata;
  },
});

// Batch analyze multiple messages in a single action call.
// Uses parallel execution with concurrency limit to avoid overwhelming the API.
export const analyzeBatch = action({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ processed: number; errors: number; total: number }> => {
    const messages: Array<Record<string, any>> = await ctx.runQuery(
      api.messages.getUnprocessed,
      {
        userId: args.userId,
        limit: args.limit || 50,
      }
    );

    if (messages.length === 0) {
      return { processed: 0, errors: 0, total: 0 };
    }

    let processed = 0;
    let errors = 0;

    // Process in batches of 5 concurrently to respect rate limits
    const CONCURRENCY = 5;
    for (let i = 0; i < messages.length; i += CONCURRENCY) {
      const batch = messages.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((message) =>
          ctx.runAction(api.ai.unified.analyzeMessage, {
            messageId: message._id,
          })
        )
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          processed++;
        } else {
          console.error("AI analysis failed for message:", result.reason);
          errors++;
        }
      }
    }

    return { processed, errors, total: messages.length };
  },
});
