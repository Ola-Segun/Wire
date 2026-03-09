"use node";

// ============================================
// LLM PROVIDER ABSTRACTION
// ============================================
//
// Primary:  Anthropic (claude-haiku / claude-sonnet)
// Fallback: NVIDIA NIM (OpenAI-compatible endpoint)
//
// Fallback triggers automatically on:
//   - Billing / quota errors  (401, 402, "credit balance too low")
//   - Rate limits             (429)
//   - Anthropic outages       (500, 503, "overloaded")
//   - Network / timeout       (fetch failure, ECONNRESET, etc.)
//
// Retry strategy before fallback:
//   - Transient errors (5xx, network) → up to ANTHROPIC_MAX_RETRIES attempts
//     with exponential backoff before switching to NVIDIA.
//   - Hard errors (401/402/auth) → immediate fallback, no retry.
//
// Environment variables:
//   ANTHROPIC_API_KEY         — Anthropic key (primary)
//   NVIDIA_API_KEY            — NVIDIA NIM key (fallback)
//   NVIDIA_QUALITY_MODEL      — Quality model override (default: meta/llama-3.3-70b-instruct)
//   NVIDIA_FAST_MODEL         — Fast model override (default: meta/llama-3.1-8b-instruct)
//
// Usage:
//   import { callLLM } from "./llm";
//   const text = await callLLM({ systemPrompt, userPrompt, maxTokens, preferFast });
//
// Model constants are exported so callers can reference them without re-declaring.

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  /** Use a faster/cheaper model (Haiku on Anthropic, 8B on NVIDIA). */
  preferFast?: boolean;
}

// ─── Exported model constants ─────────────────────────────────────────────────
// Single source of truth — import these in callers rather than re-declaring.

export const ANTHROPIC_FAST_MODEL    = "claude-haiku-4-5-20251001";
export const ANTHROPIC_QUALITY_MODEL = "claude-sonnet-4-20250514";

// ─── Internal model config ────────────────────────────────────────────────────

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Quality: large reasoning model for complex analysis
const NVIDIA_QUALITY_DEFAULT = "meta/llama-3.3-70b-instruct";
// Fast: smaller model for simple/cheap tasks (daily briefing narrative, smart replies)
const NVIDIA_FAST_DEFAULT    = "meta/llama-3.1-8b-instruct";

// Anthropic retry config — transient errors only
const ANTHROPIC_MAX_RETRIES = 2;
const ANTHROPIC_BASE_DELAY_MS = 500; // 500ms, 1000ms

// ─── Error classification ─────────────────────────────────────────────────────

/** Immediate fallback — no retry (billing/auth). */
function isHardError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  if (msg.includes("credit balance is too low")) return true;
  if (msg.includes("insufficient_quota"))        return true;
  if (msg.includes("could not resolve authentication")) return true;
  if (msg.includes('"status":401') || msg.includes("status 401")) return true;
  if (msg.includes('"status":402') || msg.includes("status 402")) return true;
  return false;
}

/** Retry then fallback — transient (5xx, rate limit, network). */
function isTransientError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  if (msg.includes('"status":429') || msg.includes("status 429")) return true;
  if (msg.includes('"status":500') || msg.includes("status 500")) return true;
  if (msg.includes('"status":503') || msg.includes("status 503")) return true;
  if (msg.includes("overloaded_error") || msg.includes("overloaded")) return true;
  if (msg.includes("econnreset") || msg.includes("econnrefused"))     return true;
  if (msg.includes("etimedout") || msg.includes("fetch failed"))      return true;
  if (msg.includes("network"))  return true;
  if (msg.includes("timeout"))  return true;
  return false;
}

/** Any error that should trigger fallback to NVIDIA (hard or transient after retries). */
function isFallbackTrigger(err: unknown): boolean {
  return isHardError(err) || isTransientError(err);
}

// ─── Anthropic call with retry ────────────────────────────────────────────────

async function callAnthropic(opts: LLMOptions): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const model = opts.preferFast ? ANTHROPIC_FAST_MODEL : ANTHROPIC_QUALITY_MODEL;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= ANTHROPIC_MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: opts.maxTokens,
        system: [
          {
            type: "text",
            text: opts.systemPrompt,
            // Prompt caching — saves ~90% of system-prompt tokens within the 5-min TTL.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: opts.userPrompt }],
      });

      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") throw new Error("No text in Anthropic response");
      return block.text;
    } catch (err) {
      lastErr = err;
      // Hard errors (billing/auth) — don't retry, fail immediately so caller can fallback
      if (isHardError(err)) throw err;
      // Transient errors — retry with backoff, except on last attempt
      if (isTransientError(err) && attempt < ANTHROPIC_MAX_RETRIES) {
        const delay = ANTHROPIC_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[LLM/Anthropic] Transient error (attempt ${attempt + 1}/${ANTHROPIC_MAX_RETRIES + 1}), retrying in ${delay}ms:`, String(err).split("\n")[0]);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // Non-transient, non-hard errors (bad prompt shape, etc.) — propagate immediately
      throw err;
    }
  }

  throw lastErr;
}

// ─── NVIDIA NIM call (OpenAI-compatible) ─────────────────────────────────────

async function callNvidia(opts: LLMOptions): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set — cannot use fallback provider");

  // Honor preferFast on the fallback provider too
  const qualityModel = process.env.NVIDIA_QUALITY_MODEL ?? NVIDIA_QUALITY_DEFAULT;
  const fastModel    = process.env.NVIDIA_FAST_MODEL    ?? NVIDIA_FAST_DEFAULT;
  const model = opts.preferFast ? fastModel : qualityModel;

  const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user",   content: opts.userPrompt },
      ],
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NVIDIA NIM error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("No content in NVIDIA NIM response");
  return text;
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Call the LLM with automatic retry and provider fallback.
 *
 * Strategy:
 *   1. No ANTHROPIC_API_KEY → go straight to NVIDIA NIM.
 *   2. Anthropic hard error (billing/auth) → immediate fallback to NVIDIA.
 *   3. Anthropic transient error (5xx/429/network) → retry up to 2x with
 *      exponential backoff, then fall back to NVIDIA.
 *   4. Unknown error → propagate (don't silently swallow unexpected failures).
 */
export async function callLLM(opts: LLMOptions): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[LLM] No ANTHROPIC_API_KEY — using NVIDIA NIM directly");
    return callNvidia(opts);
  }

  try {
    return await callAnthropic(opts);
  } catch (err) {
    if (isFallbackTrigger(err)) {
      console.warn("[LLM] Falling back to NVIDIA NIM after Anthropic error:", String(err).split("\n")[0]);
      return callNvidia(opts);
    }
    throw err;
  }
}
