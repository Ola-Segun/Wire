import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ============================================
// QUICK REPLY TEMPLATES
// User-defined message templates with variable substitution.
//
// Variables:  {{client_name}}, {{project}}, {{date}}, {{amount}}, {{deadline}}
// Categories: greeting | follow-up | payment | delivery | general
//
// Usage tracking for smart sorting by popularity.
// AI personalisation action uses client intelligence data.
// ============================================

// ---- Helpers ----

async function resolveUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
}

/** Extract {{variable}} names from template content */
function extractVariables(content: string): string[] {
  const matches = content.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

// ---- Queries ----

/** Get all templates for the current user, sorted by usage */
export const getByUser = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    let q;
    if (args.category) {
      q = ctx.db
        .query("templates")
        .withIndex("by_user_category", (qi) =>
          (qi as any).eq("userId", user._id).eq("category", args.category)
        );
    } else {
      q = ctx.db
        .query("templates")
        .withIndex("by_user_usage", (qi) =>
          (qi as any).eq("userId", user._id)
        );
    }

    return await q.order("desc").take(50);
  },
});

// ---- Mutations ----

/** Create a new template */
export const create = mutation({
  args: {
    name: v.string(),
    content: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const variables = extractVariables(args.content);

    return await ctx.db.insert("templates", {
      userId: user._id,
      name: args.name,
      content: args.content,
      category: args.category,
      variables,
      usageCount: 0,
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Update an existing template */
export const update = mutation({
  args: {
    id: v.id("templates"),
    name: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) throw new Error("Not found");

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.content !== undefined) {
      updates.content = args.content;
      updates.variables = extractVariables(args.content);
    }
    if (args.category !== undefined) updates.category = args.category;

    await ctx.db.patch(args.id, updates);
  },
});

/** Delete a template */
export const remove = mutation({
  args: { id: v.id("templates") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) throw new Error("Not found");

    await ctx.db.delete(args.id);
  },
});

/** Track template usage (call when a template is sent) */
export const trackUsage = mutation({
  args: { id: v.id("templates") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db.get(args.id);
    if (!existing || existing.userId !== user._id) throw new Error("Not found");

    await ctx.db.patch(args.id, {
      usageCount: existing.usageCount + 1,
      lastUsedAt: Date.now(),
    });
  },
});

/**
 * Ensure the 6 default templates exist for this user.
 * Called on first visit to the templates panel.
 * Idempotent: skips if defaults are already seeded.
 */
export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Check if defaults are already seeded
    const existing = await ctx.db
      .query("templates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) return; // Already has templates

    const defaults = [
      {
        name: "Warm greeting",
        content: "Hi {{client_name}}! Hope you're having a great week. I wanted to touch base about {{project}}.",
        category: "greeting",
      },
      {
        name: "Project kickoff",
        content: "Hi {{client_name}}, excited to kick off {{project}} with you! I'll start by reviewing the brief and will have initial thoughts ready by {{deadline}}.",
        category: "greeting",
      },
      {
        name: "Milestone follow-up",
        content: "Hi {{client_name}}, just checking in on {{project}}. We've hit the {{project}} milestone — let me know if you'd like any adjustments.",
        category: "follow-up",
      },
      {
        name: "Payment reminder",
        content: "Hi {{client_name}}, just a friendly reminder that the invoice for {{project}} ({{amount}}) is due on {{deadline}}. Let me know if you have any questions!",
        category: "payment",
      },
      {
        name: "Delivery confirmation",
        content: "Hi {{client_name}}, I'm happy to share that {{project}} is complete and ready for your review. Please find the deliverables attached. Looking forward to your feedback!",
        category: "delivery",
      },
      {
        name: "Quick check-in",
        content: "Hi {{client_name}}, just wanted to quickly check in. How's everything going? Anything I can help with regarding {{project}}?",
        category: "general",
      },
    ];

    const now = Date.now();
    for (const tmpl of defaults) {
      await ctx.db.insert("templates", {
        userId: user._id,
        name: tmpl.name,
        content: tmpl.content,
        category: tmpl.category,
        variables: extractVariables(tmpl.content),
        usageCount: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// ---- AI Personalisation Action ----

/**
 * Personalize a template for a specific client using their intelligence data.
 * Substitutes known variables, then uses Claude Haiku to adapt the tone
 * based on client sentiment trend and communication style.
 */
export const personalizeForClient = action({
  args: {
    templateId: v.id("templates"),
    clientId: v.id("clients"),
    overrides: v.optional(v.record(v.string(), v.string())), // { project: "Logo redesign" }
  },
  handler: async (ctx, args): Promise<{ personalizedContent: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const [template, client]: [any, any] = await Promise.all([
      ctx.runQuery(api.templates.getById, { id: args.templateId }),
      ctx.runQuery(api.clients.getById, { clientId: args.clientId }),
    ]);

    if (!template || !client) throw new Error("Template or client not found");

    const overrides = args.overrides ?? {};

    // Apply known variable substitutions
    let content = template.content;
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const knownVars: Record<string, string> = {
      client_name: client.name,
      date: today,
      project: overrides.project ?? client.intelligence?.topTopics?.[0] ?? "your project",
      deadline: overrides.deadline ?? "the agreed date",
      amount: overrides.amount ?? "the invoice amount",
      ...overrides,
    };

    for (const [key, value] of Object.entries(knownVars)) {
      content = content.replaceAll(`{{${key}}}`, value);
    }

    // If no unresolved variables remain, skip AI call
    if (!content.includes("{{")) {
      return { personalizedContent: content };
    }

    // Use Haiku to fill remaining variables with tone adaptation
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const sentimentTrend = client.intelligence?.sentimentTrend ?? "stable";
    const toneHint =
      sentimentTrend === "declining"
        ? "extra warm and reassuring"
        : sentimentTrend === "improving"
          ? "upbeat and positive"
          : "professional yet friendly";

    const prompt = `Personalise this message template for a client named ${client.name}. Fill in any remaining {{variable}} placeholders with sensible values. Use a ${toneHint} tone. Return ONLY the final message text with no explanation.

Template: ${content}`;

    const response = await anthropicClient.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    return {
      personalizedContent: (response.content[0] as { type: string; text: string }).text.trim(),
    };
  },
});

// ---- Additional query helpers ----

export const getById = query({
  args: { id: v.id("templates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
