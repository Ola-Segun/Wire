import { v } from "convex/values";
import { action, internalMutation, query, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";

// ============================================
// CONVERSATIONAL Q&A AGENT
// Natural language questions answered from message history via RAG.
//
// Flow:
//   1. Full-text search on messages (top 15 results)
//   2. Pass results + question to Claude Haiku
//   3. Return answer + source citations + confidence score
//   4. Persist Q&A session
//
// Rate limit: 15 questions/day per user (via rate_limits table)
// ============================================

export const ask = action({
  args: {
    question: v.string(),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args): Promise<{
    answer: string;
    confidence: number;
    sourceMessages: Array<{ id: string; text: string; timestamp: number; platform: string }>;
    sessionId: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user: any = await ctx.runQuery(api.users.getCurrentUser);
    if (!user) throw new Error("User not found");

    // Check daily rate limit (15 Q&A per day)
    const rateLimitKey = `qa:${user._id}`;
    const rateLimitInfo: any = await ctx.runQuery(api.rateLimit.check, {
      key: rateLimitKey,
      windowMs: 24 * 60 * 60 * 1000,
      maxRequests: 15,
    });
    if (!rateLimitInfo.allowed) {
      throw new Error("Daily Q&A limit reached (15/day). Reset at midnight.");
    }

    // Record this request
    await ctx.runMutation(api.rateLimit.record, { key: rateLimitKey });

    // Full-text search across message history
    const searchResults: any[] = await ctx.runQuery(api.messages.search, {
      query: args.question,
      limit: 15,
    });

    const sources = searchResults.slice(0, 15);

    let answer: string;
    let confidence: number;

    if (sources.length === 0) {
      answer = "I couldn't find any relevant messages to answer your question. Try searching for keywords from your actual conversations.";
      confidence = 0;
    } else {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const contextLines = sources.map((m: any, i: number) =>
        `[${i + 1}] [${m.platform}] [${new Date(m.timestamp).toLocaleDateString()}] ${m.clientName ?? "Unknown"}: ${m.text.slice(0, 300)}`
      ).join("\n\n");

      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `You are an AI assistant for a freelancer. Answer the question below using ONLY the provided message context. Reference excerpts with [1], [2], etc.

QUESTION: ${args.question}

CONTEXT:
${contextLines}

Rules: Be concise (2-4 sentences). Reference sources. If insufficient context, say so. Do not fabricate.

Answer:`
        }],
      });

      answer = (response.content[0] as { type: string; text: string }).text.trim();
      // Confidence based on source count and quality
      confidence = Math.min(1, sources.length / 10) * 0.6 + 0.3;
    }

    // Persist session
    const sessionId: string = await ctx.runMutation(internal.ai.conversationQA.persistSession, {
      userId: user._id,
      question: args.question,
      answer,
      confidence,
      sourceMessageIds: sources.map((m: any) => m._id),
      clientId: args.clientId,
    });

    return {
      answer,
      confidence,
      sourceMessages: sources.map((m: any) => ({
        id: m._id,
        text: m.text.slice(0, 200),
        timestamp: m.timestamp,
        platform: m.platform,
      })),
      sessionId,
    };
  },
});

// ---- Internal mutation: persist session ----
export const persistSession = internalMutation({
  args: {
    userId: v.id("users"),
    question: v.string(),
    answer: v.string(),
    confidence: v.number(),
    sourceMessageIds: v.array(v.id("messages")),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args): Promise<string> => {
    return await ctx.db.insert("qa_sessions", {
      userId: args.userId,
      question: args.question,
      answer: args.answer,
      confidence: args.confidence,
      sourceMessageIds: args.sourceMessageIds,
      clientId: args.clientId,
      createdAt: Date.now(),
    });
  },
});

// ---- Query: get recent Q&A sessions ----
export const getHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user: any = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return [];

    return await ctx.db
      .query("qa_sessions")
      .withIndex("by_user_recent", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// ---- Query: remaining daily quota ----
export const getDailyQuota = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { remaining: 0, limit: 15 };

    const user: any = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return { remaining: 0, limit: 15 };

    const key = `qa:${user._id}`;
    const windowStart = Date.now() - 24 * 60 * 60 * 1000;

    const records = await ctx.db
      .query("rate_limits")
      .withIndex("by_key", (q: any) => q.eq("key", key))
      .collect();

    const recentCount = records.filter((r: any) => r.timestamp >= windowStart).length;
    return {
      remaining: Math.max(0, 15 - recentCount),
      limit: 15,
      used: recentCount,
    };
  },
});
