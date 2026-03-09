"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// Process a batch of unprocessed messages through unified AI analysis.
// This replaces the old approach of 3 separate AI calls per message
// with a single consolidated call that returns all metadata at once.
export const processMessageBatch = action({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ processed: number; errors: number; total: number }> => {
    // Delegate to the unified batch analyzer which handles
    // concurrency-limited parallel processing internally
    return await ctx.runAction(api.ai.unified.analyzeBatch, {
      userId: args.userId,
      limit: args.limit || 50,
    });
  },
});
