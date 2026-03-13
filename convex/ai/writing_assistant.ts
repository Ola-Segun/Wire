"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { callLLM } from "./llm";

// Max chars sent for writing analysis (~500 input tokens — enough for any draft reply).
const MAX_ANALYSIS_CHARS = 2_000;

// Single cached system prompt covering all four analysis dimensions.
// One API call replaces the previous 4 parallel calls — 4× cheaper, same latency.
const WRITING_SYSTEM_PROMPT = `You are a professional writing coach for freelancers.
Analyze the provided draft message and return a single JSON object covering all four dimensions.
Respond ONLY with valid JSON — no markdown fences, no text outside the object.

Schema:
{
  "tone": {
    "primaryTone": "professional|casual|apologetic|confident|defensive|friendly|cold|urgent",
    "intensity": 0.0,
    "secondaryTones": [],
    "appropriateness": "low|medium|high",
    "reasoning": ""
  },
  "clarity": {
    "score": 0,
    "issues": [],
    "readabilityGrade": "",
    "suggestions": []
  },
  "grammar": {
    "errors": [
      {
        "type": "grammar|spelling|punctuation",
        "errorText": "",
        "suggestions": [],
        "explanation": "",
        "severity": "critical|important|minor"
      }
    ],
    "errorCount": 0
  },
  "formality": {
    "level": 3,
    "indicators": [],
    "recommendation": 3,
    "reasoning": ""
  }
}`;

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

// ─── Client intelligence → formality calibration ─────────────────────────────
//
// Maps known intelligence signals to a 1-5 formality target so the LLM has a
// concrete anchor rather than reasoning from scratch each call.
//
// Rules (applied in priority order, first match wins):
//   aggregateChurnRisk=high/critical  → +1 formality (de-escalate, be precise)
//   sentimentTrend=declining          → +1 formality
//   dominantPhase=closing             → 4 (closing calls for precise language)
//   dominantPhase=negotiation         → 4
//   dominantPhase=discovery           → 3
//   sentimentTrend=improving          → -1 formality (relationship is warm)
//   default                           → 3

function deriveTargetFormality(intel: Record<string, any> | undefined | null): number {
  if (!intel) return 3;
  const { aggregateChurnRisk, sentimentTrend, dominantPhase } = intel;

  if (aggregateChurnRisk === "high" || aggregateChurnRisk === "critical") return 4;
  if (sentimentTrend === "declining") return 4;
  if (dominantPhase === "closing" || dominantPhase === "negotiation") return 4;
  if (dominantPhase === "discovery") return 3;
  if (sentimentTrend === "improving") return 2;
  return 3;
}

// Build a compact client context block injected into every analysis prompt.
// Gives Claude concrete signals to calibrate formality without extra API calls.
function buildClientContextBlock(
  client: Record<string, any> | null,
  targetFormality: number
): string {
  if (!client) return "";

  const intel = client.intelligence as Record<string, any> | undefined;
  const lines: string[] = [
    `Client: ${client.name}${client.company ? ` (${client.company})` : ""}`,
    `Target formality: ${targetFormality}/5`,
  ];
  if (intel?.dominantPhase)     lines.push(`Project phase: ${intel.dominantPhase}`);
  if (intel?.sentimentTrend)    lines.push(`Sentiment trend: ${intel.sentimentTrend}`);
  if (intel?.aggregateChurnRisk && intel.aggregateChurnRisk !== "low")
    lines.push(`Churn risk: ${intel.aggregateChurnRisk}`);
  if (Array.isArray(intel?.topTopics) && intel.topTopics.length > 0)
    lines.push(`Common topics: ${intel.topTopics.slice(0, 3).join(", ")}`);

  return `\n\nClient context (use this to calibrate your formality.recommendation):\n${lines.join("\n")}`;
}

// Main writing analysis — 1 API call, prompt-cached system prompt.
export const analyzeWriting = action({
  args: {
    text: v.string(),
    clientId: v.id("clients"),
    context: v.optional(
      v.object({
        isReply: v.boolean(),
        originalMessage: v.optional(v.string()),
        urgency: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<{
    tone: Record<string, unknown>;
    clarity: Record<string, unknown>;
    grammar: Record<string, unknown>;
    formality: Record<string, unknown>;
    suggestions: Array<{ type: string; severity: string; message: string; suggestion: string; action: string }>;
  }> => {
    const client: Record<string, any> | null = await ctx.runQuery(api.clients.get, { id: args.clientId });

    // Token guard: cap long drafts before sending.
    const safeText: string = args.text.length > MAX_ANALYSIS_CHARS
      ? args.text.slice(0, MAX_ANALYSIS_CHARS) + "\n[truncated]"
      : args.text;

    const targetFormality = deriveTargetFormality(client?.intelligence as any);
    const clientContextBlock = buildClientContextBlock(client, targetFormality);

    const contextNote: string = args.context?.originalMessage
      ? `\nReplying to: "${args.context.originalMessage.slice(0, 200)}"`
      : "";

    const userPrompt: string = `Analyze this draft message:${contextNote}${clientContextBlock}

Draft:
"${safeText}"`;

    // Short drafts (< 280 chars) are simple enough for Haiku.
    // Longer, more complex messages use the quality model for better accuracy.
    const rawText = await callLLM({
      systemPrompt: WRITING_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 800,
      preferFast: safeText.length < 280,
    });

    const result: Record<string, unknown> | null = safeParseJson(rawText);

    // Dimension-level fallbacks so a partial parse never crashes the composer.
    const tone     = (result?.tone     as Record<string, unknown>) ?? { primaryTone: "neutral", intensity: 0.5, appropriateness: "medium", secondaryTones: [], reasoning: "" };
    const clarity  = (result?.clarity  as Record<string, unknown>) ?? { score: 70, issues: [], readabilityGrade: "unknown", suggestions: [] };
    const grammar  = (result?.grammar  as Record<string, unknown>) ?? { errors: [], errorCount: 0 };
    const formality = (result?.formality as Record<string, unknown>) ?? { level: 3, indicators: [], recommendation: 3, reasoning: "" };

    return {
      tone,
      clarity,
      grammar,
      formality,
      suggestions: generateSuggestions({ tone, clarity, formality, grammar }),
    };
  },
});

// Generate suggestions from analysis results
function generateSuggestions(analysis: {
  tone: any;
  clarity: any;
  formality: any;
  grammar: any;
}): Array<{
  type: string;
  severity: string;
  message: string;
  suggestion: string;
  action: string;
}> {
  const suggestions: Array<{
    type: string;
    severity: string;
    message: string;
    suggestion: string;
    action: string;
  }> = [];

  // Tone suggestions
  if (analysis.tone.appropriateness === "low") {
    suggestions.push({
      type: "tone",
      severity: "high",
      message: `Tone is too ${analysis.tone.primaryTone}`,
      suggestion: "Consider adjusting your tone",
      action: "rewrite_tone",
    });
  }

  // Clarity suggestions
  if (analysis.clarity.score < 70) {
    suggestions.push({
      type: "clarity",
      severity: "medium",
      message: "Message could be clearer",
      suggestion: `Simplify ${analysis.clarity.issues?.length ?? 0} complex sections`,
      action: "simplify",
    });
  }

  // Formality suggestions
  if (
    analysis.formality.recommendation &&
    Math.abs(analysis.formality.level - analysis.formality.recommendation) > 1
  ) {
    suggestions.push({
      type: "formality",
      severity: "medium",
      message: `Formality mismatch (yours: ${analysis.formality.level}, suggested: ${analysis.formality.recommendation})`,
      suggestion: "Adjust to match client's style",
      action: "adjust_formality",
    });
  }

  // Grammar suggestions
  if (analysis.grammar.errorCount > 0) {
    suggestions.push({
      type: "grammar",
      severity: "high",
      message: `${analysis.grammar.errorCount} grammar/spelling errors`,
      suggestion: "Fix errors before sending",
      action: "fix_grammar",
    });
  }

  return suggestions;
}

// Rewrite with a specific tone
export const rewriteWithTone = action({
  args: {
    text: v.string(),
    targetTone: v.string(),
    clientContext: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const prompt = `Rewrite this message with a ${args.targetTone} tone:

Original: "${args.text}"

${args.clientContext ? `Client Context: ${JSON.stringify(args.clientContext)}` : ""}

Maintain the key information and intent, but adjust the tone.
Respond with ONLY the rewritten message, no explanation.`;

    return await callLLM({
      systemPrompt: "You are a professional writing assistant. Rewrite messages as instructed. Respond with ONLY the rewritten message, no explanation.",
      userPrompt: prompt,
      maxTokens: 500,
      preferFast: true,
    }).catch(() => args.text);
  },
});

// Adjust formality level
export const adjustFormality = action({
  args: {
    text: v.string(),
    targetLevel: v.number(),
  },
  handler: async (ctx, args) => {
    const formalityLabels: Record<number, string> = {
      1: "very casual (like texting a friend)",
      2: "casual but professional",
      3: "standard professional",
      4: "formal business",
      5: "very formal/legal",
    };

    const prompt = `Rewrite this message at formality level ${args.targetLevel} (${formalityLabels[args.targetLevel] || "professional"}):

Original: "${args.text}"

Maintain all key information but adjust formality.
Respond with ONLY the rewritten message.`;

    return await callLLM({
      systemPrompt: "You are a professional writing assistant. Rewrite messages as instructed. Respond with ONLY the rewritten message.",
      userPrompt: prompt,
      maxTokens: 500,
      preferFast: true,
    }).catch(() => args.text);
  },
});

// Fix grammar and spelling errors
export const fixGrammar = action({
  args: {
    text: v.string(),
    errors: v.optional(
      v.array(
        v.object({
          errorText: v.string(),
          suggestions: v.array(v.string()),
        })
      )
    ),
  },
  handler: async (_ctx, args) => {
    const errorHints =
      args.errors && args.errors.length > 0
        ? `\n\nSpecific errors to fix:\n${args.errors
            .map((e) => `- "${e.errorText}" → ${e.suggestions[0] ?? "correct it"}`)
            .join("\n")}`
        : "";

    const prompt = `Fix all grammar, spelling, and punctuation errors in this message:

Original: "${args.text}"${errorHints}

Keep the original meaning, wording, and style exactly — only fix errors.
Respond with ONLY the corrected message.`;

    return await callLLM({
      systemPrompt:
        "You are a grammar editor. Fix errors exactly as instructed. Respond with ONLY the corrected message, nothing else.",
      userPrompt: prompt,
      maxTokens: 500,
      preferFast: true,
    }).catch(() => args.text);
  },
});

// Simplify and clarify
export const simplifyClarify = action({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const prompt = `Rewrite this message to be clearer and more concise:

Original: "${args.text}"

Goals:
- Remove wordiness
- Eliminate jargon
- Use active voice
- Break up complex sentences
- Maintain all key information

Respond with ONLY the rewritten message.`;

    return await callLLM({
      systemPrompt: "You are a professional writing assistant. Rewrite messages as instructed. Respond with ONLY the rewritten message.",
      userPrompt: prompt,
      maxTokens: 500,
      preferFast: true,
    }).catch(() => args.text);
  },
});
