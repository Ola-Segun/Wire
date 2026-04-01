import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// SKILL REGISTRY — Available skills and their metadata.
// Defined in code (not DB) to avoid schema bloat.
// ============================================

export interface SkillDefinition {
  slug: string;
  name: string;
  description: string;
  category: "guardian" | "intelligence" | "productivity";
  trigger: "reactive" | "cron" | "on_demand";
  // Whether this skill requires an AI API call (affects cost)
  requiresAiCall: boolean;
  defaultEnabled: boolean;
  defaultConfig: Record<string, unknown>;
}

export const SKILL_REGISTRY: SkillDefinition[] = [
  // Guardian skills — protect the freelancer (all reactive, zero AI cost)
  {
    slug: "scope_guardian",
    name: "Scope Guardian",
    description: "Alerts when client requests go beyond contract deliverables",
    category: "guardian",
    trigger: "reactive",
    requiresAiCall: false,
    defaultEnabled: true,
    defaultConfig: { sensitivity: "medium" },
  },
  {
    slug: "commitment_watchdog",
    name: "Commitment Watchdog",
    description: "Surfaces overdue commitments and approaching deadlines",
    category: "guardian",
    trigger: "cron",
    requiresAiCall: false,
    defaultEnabled: true,
    defaultConfig: { warningDaysBeforeDue: 1 },
  },
  {
    slug: "ghosting_detector",
    name: "Ghosting Detector",
    description: "Alerts when a normally responsive client goes unusually quiet",
    category: "guardian",
    trigger: "cron",
    requiresAiCall: false,
    defaultEnabled: true,
    defaultConfig: { silenceMultiplier: 3 },
  },
  {
    slug: "payment_sentinel",
    name: "Payment Sentinel",
    description: "Tracks payment promises and flags overdue invoices",
    category: "guardian",
    trigger: "cron",
    requiresAiCall: false,
    defaultEnabled: true,
    defaultConfig: {},
  },

  // Intelligence skills — surface hidden insights
  {
    slug: "churn_predictor",
    name: "Churn Predictor",
    description: "Early warning when client engagement is declining",
    category: "intelligence",
    trigger: "reactive",
    requiresAiCall: false,
    defaultEnabled: true,
    defaultConfig: { threshold: "medium" },
  },
  {
    slug: "revenue_radar",
    name: "Revenue Radar",
    description: "Detects deal signals, upsell opportunities, and budget changes",
    category: "intelligence",
    trigger: "reactive",
    requiresAiCall: false,
    defaultEnabled: true,
    defaultConfig: {},
  },

  // Portfolio skills — daily synthesis across all clients
  {
    slug: "daily_briefing",
    name: "Daily Briefing",
    description: "Morning portfolio digest: priorities, risks, and opportunities across all clients",
    category: "intelligence",
    trigger: "cron",
    requiresAiCall: true, // 1 Haiku call/day (~$0.0001)
    defaultEnabled: true,
    defaultConfig: {},
  },

  // Productivity skills — save time
  {
    slug: "smart_replies",
    name: "Smart Replies",
    description: "Generates contextual reply suggestions when viewing messages",
    category: "productivity",
    trigger: "on_demand",
    requiresAiCall: true, // Uses Haiku — cheapest model
    defaultEnabled: true,
    defaultConfig: { replyCount: 3 },
  },
  {
    slug: "thread_summarizer",
    name: "Thread Summarizer",
    description: "Generates TL;DR summaries for conversations with 5+ messages",
    category: "productivity",
    trigger: "on_demand",
    requiresAiCall: true,
    defaultEnabled: true,
    defaultConfig: {},
  },

  // New: Cross-platform conflict detection — zero AI cost, pure DB logic
  {
    slug: "conflict_detector",
    name: "Conflict Detector",
    description: "Detects sentiment/intent contradictions across platforms (e.g. positive on Slack, negative on email)",
    category: "guardian",
    trigger: "reactive",
    requiresAiCall: false,
    defaultEnabled: true,
    defaultConfig: { sentimentWindow: 48 * 60 * 60 * 1000 },
  },

  // New: Proactive re-engagement for dormant clients
  {
    slug: "reengagement_scheduler",
    name: "Re-engagement Scheduler",
    description: "Identifies dormant clients and generates personalised outreach templates",
    category: "intelligence",
    trigger: "cron",
    requiresAiCall: true, // 1 Haiku call per dormant client
    defaultEnabled: true,
    defaultConfig: { dormancyMultiplier: 2 },
  },
];

// ============================================
// HELPERS
// ============================================

async function resolveUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
}

// ============================================
// QUERIES
// ============================================

// Get all skill configs for the current user.
// Returns the registry merged with user overrides.
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const userSkills = await ctx.db
      .query("user_skills")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const overrideMap = new Map(userSkills.map((s) => [s.skillSlug, s]));

    return SKILL_REGISTRY.map((def) => {
      const override = overrideMap.get(def.slug);
      return {
        ...def,
        enabled: override ? override.enabled : def.defaultEnabled,
        config: override?.config ?? def.defaultConfig,
        clientScope: override?.clientScope ?? null,
        userSkillId: override?._id ?? null,
      };
    });
  },
});

// Get recent skill outputs for the current user
export const getOutputs = query({
  args: {
    limit: v.optional(v.number()),
    skillSlug: v.optional(v.string()),
    unreadOnly: v.optional(v.boolean()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    let q;
    if (args.clientId) {
      // Per-client view — by_client index, user-ownership filtered below
      q = ctx.db
        .query("skill_outputs")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!));
    } else if (args.unreadOnly) {
      q = ctx.db
        .query("skill_outputs")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", user._id).eq("isRead", false)
        );
    } else if (args.skillSlug) {
      q = ctx.db
        .query("skill_outputs")
        .withIndex("by_user_skill", (q) =>
          q.eq("userId", user._id).eq("skillSlug", args.skillSlug!)
        );
    } else {
      q = ctx.db
        .query("skill_outputs")
        .withIndex("by_user", (q) => q.eq("userId", user._id));
    }

    const outputs = await q.order("desc").take(args.limit ?? 50);

    // Filter dismissed, expired, and (for clientId queries) other-user outputs
    const now = Date.now();
    return outputs.filter(
      (o) =>
        !o.isDismissed &&
        (!o.expiresAt || o.expiresAt > now) &&
        o.userId === user._id
    );
  },
});

// Get unread output count for badge display
// Bounded to 999 — avoids unbounded .collect() on users with many alerts.
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return 0;

    const unread = await ctx.db
      .query("skill_outputs")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .take(999);

    const now = Date.now();
    return unread.filter(
      (o) => !o.isDismissed && (!o.expiresAt || o.expiresAt > now)
    ).length;
  },
});

// ============================================
// MUTATIONS — User-facing skill management
// ============================================

// Toggle a skill on/off
export const toggle = mutation({
  args: {
    skillSlug: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("user_skills")
      .withIndex("by_user_skill", (q) =>
        q.eq("userId", user._id).eq("skillSlug", args.skillSlug)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: Date.now(),
      });
    } else {
      const def = SKILL_REGISTRY.find((s) => s.slug === args.skillSlug);
      if (!def) throw new Error(`Unknown skill: ${args.skillSlug}`);

      await ctx.db.insert("user_skills", {
        userId: user._id,
        skillSlug: args.skillSlug,
        enabled: args.enabled,
        config: def.defaultConfig,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Update skill configuration
export const updateConfig = mutation({
  args: {
    skillSlug: v.string(),
    config: v.any(),
    clientScope: v.optional(v.array(v.id("clients"))),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("user_skills")
      .withIndex("by_user_skill", (q) =>
        q.eq("userId", user._id).eq("skillSlug", args.skillSlug)
      )
      .first();

    const updates: Record<string, any> = {
      config: args.config,
      updatedAt: Date.now(),
    };
    if (args.clientScope !== undefined) {
      updates.clientScope = args.clientScope;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updates);
    } else {
      const def = SKILL_REGISTRY.find((s) => s.slug === args.skillSlug);
      if (!def) throw new Error(`Unknown skill: ${args.skillSlug}`);

      await ctx.db.insert("user_skills", {
        userId: user._id,
        skillSlug: args.skillSlug,
        enabled: def.defaultEnabled,
        config: args.config,
        clientScope: args.clientScope,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Dismiss a skill output — snooze-style.
// The alert can re-fire after the dedup window expires if the underlying
// signal persists. Use markActionTaken when outreach was actually sent.
export const dismissOutput = mutation({
  args: { id: v.id("skill_outputs") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const output = await ctx.db.get(args.id);
    if (!output || output.userId !== user._id) throw new Error("Not found");

    await ctx.db.patch(args.id, { isDismissed: true });
  },
});

// Mark a skill output as actioned — the user explicitly did something about it
// (e.g. sent the crisis recovery message, addressed the scope creep issue).
// Actioned outputs suppress re-firing for the full dedup window even if the
// underlying signal persists, preventing repeated alerts after the user responds.
export const markActionTaken = mutation({
  args: { id: v.id("skill_outputs") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const output = await ctx.db.get(args.id);
    if (!output || output.userId !== user._id) throw new Error("Not found");

    await ctx.db.patch(args.id, {
      isDismissed: true,
      actionTaken: true,
      isRead:      true,
    });
  },
});

// Mark skill output as read
export const markOutputRead = mutation({
  args: { id: v.id("skill_outputs") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const output = await ctx.db.get(args.id);
    if (!output || output.userId !== user._id) throw new Error("Not found");

    await ctx.db.patch(args.id, { isRead: true });
  },
});

// Mark all outputs as read (for "mark all read" button)
export const markAllOutputsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const unread = await ctx.db
      .query("skill_outputs")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();

    await Promise.all(
      unread.map((o) => ctx.db.patch(o._id, { isRead: true }))
    );
  },
});

// ============================================
// INTERNAL — Skill output creation (called by skill runners)
// ============================================

// Create a skill output (called by skill dispatcher, not users)
export const createOutput = internalMutation({
  args: {
    userId: v.id("users"),
    skillSlug: v.string(),
    clientId: v.optional(v.id("clients")),
    messageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
    type: v.string(),
    severity: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    metadata: v.optional(v.any()),
    actionable: v.boolean(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("skill_outputs", {
      ...args,
      isRead: false,
      isDismissed: false,
      createdAt: Date.now(),
    });
  },
});

// Check if a user has a specific skill enabled.
// Used by skill dispatchers to skip disabled skills without auth context.
export const isSkillEnabled = internalQuery({
  args: {
    userId: v.id("users"),
    skillSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const override = await ctx.db
      .query("user_skills")
      .withIndex("by_user_skill", (q) =>
        q.eq("userId", args.userId).eq("skillSlug", args.skillSlug)
      )
      .first();

    if (override) return override.enabled;

    // No override → return the registry default
    const def = SKILL_REGISTRY.find((s) => s.slug === args.skillSlug);
    return def?.defaultEnabled ?? false;
  },
});

// Get user's skill config (for skill runners that need config values)
export const getSkillConfig = internalQuery({
  args: {
    userId: v.id("users"),
    skillSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const override = await ctx.db
      .query("user_skills")
      .withIndex("by_user_skill", (q) =>
        q.eq("userId", args.userId).eq("skillSlug", args.skillSlug)
      )
      .first();

    if (override) {
      return {
        enabled: override.enabled,
        config: override.config,
        clientScope: override.clientScope,
      };
    }

    const def = SKILL_REGISTRY.find((s) => s.slug === args.skillSlug);
    return {
      enabled: def?.defaultEnabled ?? false,
      config: def?.defaultConfig ?? {},
      clientScope: null,
    };
  },
});

// Fetch recent skill outputs for a user by userId — used by daily briefing action
// which runs without auth context (cron). Returns non-dismissed outputs within
// the requested time window.
export const getRecentByUserInternal = internalQuery({
  args: {
    userId: v.id("users"),
    withinMs: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.withinMs;
    const outputs = await ctx.db
      .query("skill_outputs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100);
    return outputs.filter((o) => o.createdAt > cutoff && !o.isDismissed);
  },
});

// Cleanup expired skill outputs (called by cron)
// Batch size raised from 100 → 500 so backlog clears faster when many alerts expire.
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // by_expires index: only fetches documents whose expiresAt < now.
    // No full-table scan — O(expired) not O(all outputs).
    const expired = await ctx.db
      .query("skill_outputs")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(500);

    let cleaned = 0;
    for (const output of expired) {
      if (output.expiresAt && output.expiresAt < now) {
        await ctx.db.delete(output._id);
        cleaned++;
      }
    }
    return cleaned;
  },
});
