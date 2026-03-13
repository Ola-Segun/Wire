"use node";

// ============================================
// LLM PROVIDER ABSTRACTION
// ============================================
//
// Primary:  Anthropic (claude-haiku / claude-sonnet)
// Fallback: NVIDIA NIM (OpenAI-compatible endpoint)
//
// All model names are environment-variable overrideable so you can swap
// models without a code deploy:
//
//   ANTHROPIC_FAST_MODEL    — fast/cheap model (default: claude-haiku-4-5-20251001)
//   ANTHROPIC_QUALITY_MODEL — quality model    (default: claude-sonnet-4-20250514)
//   NVIDIA_QUALITY_MODEL    — NVIDIA quality override (default: meta/llama-3.3-70b-instruct)
//   NVIDIA_FAST_MODEL       — NVIDIA fast override    (default: meta/llama-3.1-8b-instruct)
//   DISABLE_NVIDIA_FALLBACK — set to "true" to throw instead of falling back
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

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  /** Use a faster/cheaper model (Haiku on Anthropic, 8B on NVIDIA). */
  preferFast?: boolean;
}

export interface LLMResult {
  text: string;
  /** Which provider actually served the response. */
  provider: "anthropic" | "nvidia";
  /** Which model was used. */
  model: string;
}

// ─── Exported model constants (defaults, overrideable via ENV) ─────────────────
// These are the compile-time defaults. At runtime, getModelNames() reads ENV
// overrides. Always use getModelNames() in runtime code; use these constants
// only where you need a compile-time default (e.g. type references).

export const ANTHROPIC_FAST_MODEL_DEFAULT    = "claude-haiku-4-5-20251001";
export const ANTHROPIC_QUALITY_MODEL_DEFAULT = "claude-sonnet-4-20250514";

// For backward compat — callers that imported these names still compile.
export const ANTHROPIC_FAST_MODEL    = ANTHROPIC_FAST_MODEL_DEFAULT;
export const ANTHROPIC_QUALITY_MODEL = ANTHROPIC_QUALITY_MODEL_DEFAULT;

// ─── Runtime model name resolution ────────────────────────────────────────────
// Reads ENV at call time so hot-swapping models via deployment env vars works
// without redeploying code.

export function getModelNames(): {
  anthropicFast:    string;
  anthropicQuality: string;
  nvidiaFast:       string;
  nvidiaQuality:    string;
} {
  return {
    anthropicFast:    process.env.ANTHROPIC_FAST_MODEL    ?? ANTHROPIC_FAST_MODEL_DEFAULT,
    anthropicQuality: process.env.ANTHROPIC_QUALITY_MODEL ?? ANTHROPIC_QUALITY_MODEL_DEFAULT,
    nvidiaFast:       process.env.NVIDIA_FAST_MODEL       ?? "meta/llama-3.1-8b-instruct",
    nvidiaQuality:    process.env.NVIDIA_QUALITY_MODEL    ?? "meta/llama-3.3-70b-instruct",
  };
}

// ─── Internal config ─────────────────────────────────────────────────────────

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// Anthropic retry config — transient errors only
const ANTHROPIC_MAX_RETRIES   = 2;
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

/** Any error that should trigger fallback to NVIDIA. */
function isFallbackTrigger(err: unknown): boolean {
  return isHardError(err) || isTransientError(err);
}

// ─── Anthropic call with retry ────────────────────────────────────────────────

async function callAnthropic(opts: LLMOptions): Promise<LLMResult> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const models = getModelNames();
  const model  = opts.preferFast ? models.anthropicFast : models.anthropicQuality;
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
      return { text: block.text, provider: "anthropic", model };
    } catch (err) {
      lastErr = err;
      // Hard errors (billing/auth) — don't retry, fail immediately so caller can fallback
      if (isHardError(err)) throw err;
      // Transient errors — retry with backoff, except on last attempt
      if (isTransientError(err) && attempt < ANTHROPIC_MAX_RETRIES) {
        const delay = ANTHROPIC_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[LLM/Anthropic] Transient error (attempt ${attempt + 1}/${ANTHROPIC_MAX_RETRIES + 1}), retrying in ${delay}ms:`,
          String(err).split("\n")[0]
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // Non-transient, non-hard errors (bad prompt shape, etc.) — propagate
      throw err;
    }
  }

  throw lastErr;
}

// ─── NVIDIA NIM call (OpenAI-compatible) ─────────────────────────────────────

async function callNvidia(opts: LLMOptions): Promise<LLMResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set — cannot use fallback provider");

  const models = getModelNames();
  const model  = opts.preferFast ? models.nvidiaFast : models.nvidiaQuality;

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
  return { text, provider: "nvidia", model };
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Call the LLM with automatic retry and provider fallback.
 * Returns the response text (backward-compatible with previous callers).
 *
 * Strategy:
 *   1. No ANTHROPIC_API_KEY → go straight to NVIDIA NIM.
 *   2. DISABLE_NVIDIA_FALLBACK=true → never fall back; throw on Anthropic error.
 *   3. Anthropic hard error (billing/auth) → immediate fallback to NVIDIA.
 *   4. Anthropic transient error (5xx/429/network) → retry up to 2x with
 *      exponential backoff, then fall back to NVIDIA.
 *   5. Unknown error → propagate (don't silently swallow unexpected failures).
 */
export async function callLLM(opts: LLMOptions): Promise<string> {
  const result = await callLLMWithMeta(opts);
  return result.text;
}

/**
 * Like callLLM but returns { text, provider, model } for callers that want
 * observability into which provider/model served the response.
 */
export async function callLLMWithMeta(opts: LLMOptions): Promise<LLMResult> {
  const fallbackDisabled = process.env.DISABLE_NVIDIA_FALLBACK === "true";

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[LLM] No ANTHROPIC_API_KEY — using NVIDIA NIM directly");
    return callNvidia(opts);
  }

  try {
    return await callAnthropic(opts);
  } catch (err) {
    if (fallbackDisabled) {
      console.error("[LLM] Anthropic error and DISABLE_NVIDIA_FALLBACK=true — not falling back");
      throw err;
    }
    if (isFallbackTrigger(err)) {
      console.warn(
        "[LLM] Falling back to NVIDIA NIM after Anthropic error:",
        String(err).split("\n")[0]
      );
      return callNvidia(opts);
    }
    throw err;
  }
}
