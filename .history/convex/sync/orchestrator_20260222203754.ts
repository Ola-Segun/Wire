"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

const MAX_SYNC_CONCURRENCY = 5;
const MAX_AI_CONCURRENCY = 3;
const MAX_RETRIES = 2;

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

    // Build all sync tasks for parallel execution
    const syncTasks: Array<() => Promise<void>> = [];
    let synced = 0;
    let errors = 0;

    for (const platform of userPlatforms) {
      const identities: Array<Record<string, any>> = await ctx.runQuery(
        api.identities.listByPlatform,
        { userId: args.userId, platform }
      );

      const linkedIdentities = identities.filter(
        (id) => id.clientId && id.isSelected
      );

      for (const identity of linkedIdentities) {
        syncTasks.push(async () => {
          await withRetry(
            async () => {
              if (platform === "gmail") {
                await ctx.runAction(api.sync.gmail.syncMessages, {
                  userId: args.userId,
                  identityId: identity._id,
                });
              } else if (platform === "slack") {
                await ctx.runAction(api.sync.slack.syncMessages, {
                  userId: args.userId,
                  identityId: identity._id,
                });
              }
            },
            MAX_RETRIES,
            `sync ${platform} identity=${identity._id}`
          );
        });
      }
    }

    // Execute all sync tasks in parallel with concurrency limit
    const results = await parallelWithLimit(syncTasks, MAX_SYNC_CONCURRENCY);
    for (const result of results) {
      if (result.status === "fulfilled") {
        synced++;
      } else {
        console.error("Sync task failed:", result.reason);
        errors++;
      }
    }

    return { synced, errors };
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

    // Build all sync tasks across all users for parallel execution
    const syncTasks: Array<() => Promise<void>> = [];
    let synced = 0;
    let errors = 0;

    for (const [userId, platforms] of userConnections) {
      for (const platform of platforms) {
        const identities: Array<Record<string, any>> = await ctx.runQuery(
          api.identities.listByPlatform,
          { userId: userId as any, platform }
        );

        const linkedIdentities = identities.filter(
          (id) => id.clientId && id.isSelected
        );

        for (const identity of linkedIdentities) {
          syncTasks.push(async () => {
            await withRetry(
              async () => {
                if (platform === "gmail") {
                  await ctx.runAction(api.sync.gmail.syncMessages, {
                    userId: userId as any,
                    identityId: identity._id,
                  });
                } else if (platform === "slack") {
                  await ctx.runAction(api.sync.slack.syncMessages, {
                    userId: userId as any,
                    identityId: identity._id,
                  });
                }
              },
              MAX_RETRIES,
              `sync ${platform} user=${userId} identity=${identity._id}`
            );
          });
        }
      }
    }

    // Fan-out: execute all sync tasks in parallel with concurrency limit
    const results = await parallelWithLimit(syncTasks, MAX_SYNC_CONCURRENCY);
    for (const result of results) {
      if (result.status === "fulfilled") {
        synced++;
      } else {
        console.error("Sync task failed:", result.reason);
        errors++;
      }
    }

    return { synced, errors };
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
