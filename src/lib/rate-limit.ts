// In-memory sliding window rate limiter for API routes.
// Uses a Map of IP → request timestamps. Automatically cleans expired entries.
// For production at scale, replace with Redis-backed implementation.

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks (every 5 minutes)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(windowMs: number) {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetMs: number } {
  ensureCleanup(config.windowMs);

  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < config.windowMs
  );

  if (entry.timestamps.length >= config.maxRequests) {
    const oldest = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldest + config.windowMs - now,
    };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetMs: config.windowMs,
  };
}

// Preset configurations
export const RATE_LIMITS = {
  webhook: { windowMs: 60_000, maxRequests: 120 }, // 120 req/min per source
  api: { windowMs: 60_000, maxRequests: 60 }, // 60 req/min per user
  ai: { windowMs: 60_000, maxRequests: 20 }, // 20 AI calls/min per user
  send: { windowMs: 60_000, maxRequests: 30 }, // 30 sends/min per user
} as const;
