"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

const MAX_SYNC_CONCURRENCY = 5;
const MAX_AI_CONCURRENCY = 3;
const MAX_RETRIES = 2;

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

// Sync messages for all users with connected platforms — parallel fan-out
export const syncAllUsers = action({
  args: {},
  handler: async (ctx): Promise<{ synced: number; errors: number }> => {
    const connections: Array<{ userId: any; platform: string }> =
      await ctx.runQuery(api.oauth.listAllConnections, {});

    if (connections.length === 0) return { synced: 0, errors: 0 };

    // Group connections by user
    const userConnections = new Map<string, string[]>();
    for (const conn of connections) {
      const userId = conn.userId as string;
      if (!userConnections.has(userId)) {
        userConnections.set(userId, []);
      }
      userConnections.get(userId)!.push(conn.platform);
    }

    // Build all sync tasks across all users
    const allTasks: Array<() => Promise<void>> = [];
    for (const [userId, platforms] of userConnections) {
      const userTasks = await buildSyncTasks(ctx, userId as any, platforms);
      allTasks.push(...userTasks);
    }

    return executeSyncTasks(allTasks);
  },
});

// Process AI analysis for all users with unprocessed messages — parallel
export const processAiForAllUsers = action({
  args: {},
  handler: async (ctx): Promise<{ processed: number; errors: number }> => {
    const connections: Array<{ userId: any; platform: string }> =
      await ctx.runQuery(api.oauth.listAllConnections, {});

    // Get unique user IDs
    const userIds = [...new Set(connections.map((c) => c.userId as string))];

    // Run AI processing for all users in parallel with concurrency limit
    const aiTasks = userIds.map((userId) => async () => {
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

    return { processed, errors };
  },
});
