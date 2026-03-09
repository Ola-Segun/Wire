"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// Reduced from 5→2 to prevent OCC failures on the conversations table.
// Multiple concurrent syncs writing to the same conversation document cause
// Convex optimistic-concurrency conflicts. Lower concurrency keeps writes
// serialized enough for auto-retry to succeed.
const MAX_SYNC_CONCURRENCY = 2;
const MAX_AI_CONCURRENCY = 2;
const MAX_RETRIES = 2;

// Only sync users who have been active within these windows.
// The sync window must be wide enough to ensure freelancers who step away
// for lunch or a meeting still receive messages when they return.
// 4 h covers a half-day gap; AI window stays at 6 h so analysis catches up
// on messages that arrive while the user is offline.
const SYNC_ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000;   // 4 hours  (was 30 min)
const AI_ACTIVE_WINDOW_MS   = 6 * 60 * 60 * 1000;   // 6 hours  (was 60 min)

// ============================================
// Dynamic Platform Sync Registry
// ============================================
// Add new platforms here — the orchestrator dispatches automatically.
// Each entry maps a platform key to its syncMessages action reference.
const SYNC_ACTIONS: Record<string, any> = {
  gmail: api.sync.gmail.syncMessages,
  slack: api.sync.slack.syncMessages,
  whatsapp: api.sync.whatsapp.syncMessages,
  discord: api.sync.discord.syncMessages,
};

// Retry wrapper with exponential backoff for external API calls
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  label: string
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        console.warn(`Retrying ${label} (attempt ${attempt + 1}/${maxRetries}):`, lastError.message);
      }
    }
  }
  throw lastError;
}

// Run tasks in parallel with a concurrency limit
async function parallelWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

// Build sync tasks for a user's platforms — shared between single-user and all-users sync
async function buildSyncTasks(
  ctx: any,
  userId: any,
  platforms: string[]
): Promise<Array<() => Promise<void>>> {
  const tasks: Array<() => Promise<void>> = [];

  for (const platform of platforms) {
    const syncAction = SYNC_ACTIONS[platform];
    if (!syncAction) {
      console.warn(`Orchestrator: no sync action registered for platform "${platform}", skipping`);
      continue;
    }

    const identities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId, platform }
    );

    const linkedIdentities = identities.filter(
      (id) => id.clientId && id.isSelected
    );

    console.log(
      `Orchestrator: ${platform} — ${identities.length} identities total, ` +
      `${linkedIdentities.length} linked (isSelected+clientId). ` +
      `${identities.length - linkedIdentities.length} skipped.`
    );

    if (identities.length > 0 && linkedIdentities.length === 0) {
      console.warn(
        `Orchestrator: ${platform} has ${identities.length} identities but NONE are linked to clients. ` +
        `Users must: 1) Sync contacts in Settings, 2) Link identities to a Client in the Clients page.`
      );
    }

    for (const identity of linkedIdentities) {
      tasks.push(async () => {
        await withRetry(
          async () => {
            await ctx.runAction(syncAction, {
              userId,
              identityId: identity._id,
            });
          },
          MAX_RETRIES,
          `sync ${platform} user=${userId} identity=${identity._id}`
        );
      });
    }
  }

  return tasks;
}

// Execute sync tasks and tally results
async function executeSyncTasks(
  tasks: Array<() => Promise<void>>
): Promise<{ synced: number; errors: number }> {
  const results = await parallelWithLimit(tasks, MAX_SYNC_CONCURRENCY);
  let synced = 0;
  let errors = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      synced++;
    } else {
      console.error("Sync task failed:", result.reason);
      errors++;
    }
  }
  return { synced, errors };
}

// Manual sync for a single user (triggered from UI)
export const syncCurrentUser = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ synced: number; errors: number }> => {
    const connections: Array<{ userId: any; platform: string }> =
      await ctx.runQuery(api.oauth.listAllConnections, {});

    const userPlatforms = connections
      .filter((c) => (c.userId as string) === (args.userId as string))
      .map((c) => c.platform);

    if (userPlatforms.length === 0) return { synced: 0, errors: 0 };

    const tasks = await buildSyncTasks(ctx, args.userId, userPlatforms);
    return executeSyncTasks(tasks);
  },
});

// Sync messages for all users with connected platforms — parallel fan-out.
// Only processes users who have been active within SYNC_ACTIVE_WINDOW_MS.
// This eliminates cron overhead entirely when no users are online.
export const syncAllUsers = action({
  args: {},
  handler: async (ctx): Promise<{ synced: number; errors: number; skipped: number }> => {
    const connections: Array<{ userId: any; platform: string }> =
      await ctx.runQuery(api.oauth.listAllConnections, {});

    if (connections.length === 0) return { synced: 0, errors: 0, skipped: 0 };

    // Fetch all users in one batch to check lastActiveAt
    const users: Array<Record<string, any>> = await ctx.runQuery(api.users.getAllForSync, {});
    const userMap = new Map<string, Record<string, any>>();
    for (const u of users) {
      userMap.set(u._id as string, u);
    }

    const now = Date.now();

    // Group connections by user, skipping inactive users
    const userConnections = new Map<string, string[]>();
    let skipped = 0;
    for (const conn of connections) {
      const userId = conn.userId as string;
      const user = userMap.get(userId);
      const lastActive = user?.lastActiveAt ?? user?.lastLoginAt ?? 0;

      if (now - lastActive > SYNC_ACTIVE_WINDOW_MS) {
        skipped++;
        continue;
      }

      if (!userConnections.has(userId)) {
        userConnections.set(userId, []);
      }
      userConnections.get(userId)!.push(conn.platform);
    }

    if (userConnections.size === 0) {
      console.log(`Orchestrator syncAllUsers: all ${skipped} connection(s) skipped — no active users`);
      return { synced: 0, errors: 0, skipped };
    }

    console.log(
      `Orchestrator syncAllUsers: ${userConnections.size} active user(s), ${skipped} skipped`
    );

    // Build all sync tasks across active users
    const allTasks: Array<() => Promise<void>> = [];
    for (const [userId, platforms] of userConnections) {
      const userTasks = await buildSyncTasks(ctx, userId as any, platforms);
      allTasks.push(...userTasks);
    }

    const result = await executeSyncTasks(allTasks);
    return { ...result, skipped };
  },
});

// Process AI analysis for all users with unprocessed messages.
// Only runs for users active within AI_ACTIVE_WINDOW_MS (60 min).
// AI analysis is deferred for idle users — it runs when they next return.
export const processAiForAllUsers = action({
  args: {},
  handler: async (ctx): Promise<{ processed: number; errors: number; skipped: number }> => {
    const connections: Array<{ userId: any; platform: string }> =
      await ctx.runQuery(api.oauth.listAllConnections, {});

    // Fetch all users to check lastActiveAt
    const users: Array<Record<string, any>> = await ctx.runQuery(api.users.getAllForSync, {});
    const userMap = new Map<string, Record<string, any>>();
    for (const u of users) {
      userMap.set(u._id as string, u);
    }

    const now = Date.now();

    // Deduplicate user IDs, filtering to active users only
    const seenUserIds = new Set<string>();
    let skipped = 0;
    for (const conn of connections) {
      const userId = conn.userId as string;
      if (seenUserIds.has(userId)) continue;

      const user = userMap.get(userId);
      const lastActive = user?.lastActiveAt ?? user?.lastLoginAt ?? 0;

      if (now - lastActive > AI_ACTIVE_WINDOW_MS) {
        skipped++;
        continue;
      }

      seenUserIds.add(userId);
    }

    const activeUserIds = [...seenUserIds];

    if (activeUserIds.length === 0) {
      console.log(`Orchestrator processAiForAllUsers: all ${skipped} user(s) skipped — no active users`);
      return { processed: 0, errors: 0, skipped };
    }

    console.log(
      `Orchestrator processAiForAllUsers: ${activeUserIds.length} active user(s), ${skipped} skipped`
    );

    // Run AI processing for active users in parallel with concurrency limit
    const aiTasks = activeUserIds.map((userId) => async () => {
      return await withRetry(
        async () => {
          return await ctx.runAction(api.ai.batch.processMessageBatch, {
            userId: userId as any,
            limit: 20,
          });
        },
        MAX_RETRIES,
        `AI batch user=${userId}`
      );
    });

    const results = await parallelWithLimit(aiTasks, MAX_AI_CONCURRENCY);

    let processed = 0;
    let errors = 0;

    for (const result of results) {
      if (result.status === "fulfilled") {
        processed += result.value.processed;
        errors += result.value.errors;
      } else {
        console.error("AI batch task failed:", result.reason);
        errors++;
      }
    }

    return { processed, errors, skipped };
  },
});
