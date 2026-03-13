import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Store/sync user from authenticated Clerk session (called from frontend)
// This is the primary way users get created in Convex
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called store without authentication");
    }

    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      // Update last login and any changed profile info
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
        avatar: identity.pictureUrl ?? existing.avatar,
        lastLoginAt: Date.now(),
      });
      return existing._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email ?? "",
      name: identity.name ?? "User",
      avatar: identity.pictureUrl,
      plan: "free",
      planStatus: "active",
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      onboardingCompleted: false,
    });

    return userId;
  },
});

// Create user from Clerk webhook (backup method for production)
export const create = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatar: v.optional(v.string()),
    plan: v.string(),
    planStatus: v.string(),
    onboardingCompleted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existing) {
      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      avatar: args.avatar,
      plan: args.plan,
      planStatus: args.planStatus,
      createdAt: Date.now(),
      onboardingCompleted: args.onboardingCompleted,
    });

    return userId;
  },
});

// Update user from Clerk webhook
export const updateFromClerk = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      email: args.email,
      name: args.name,
      avatar: args.avatar,
      lastLoginAt: Date.now(),
    });

    return user._id;
  },
});

// Get current user (with authentication)
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    return user;
  },
});

// Get user by Clerk ID
export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

// Update user profile (name, timezone)
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    const updates: Record<string, string> = {};
    if (args.name !== undefined && args.name.trim()) updates.name = args.name.trim();
    if (args.timezone !== undefined) updates.timezone = args.timezone;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(user._id, updates);
    }

    return user._id;
  },
});

// Update user preferences
export const updatePreferences = mutation({
  args: {
    preferences: v.object({
      dailyDigestTime: v.optional(v.string()),
      urgencyThreshold: v.optional(v.number()),
      notifications: v.optional(
        v.object({
          email: v.optional(v.boolean()),
          push: v.optional(v.boolean()),
        })
      ),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      preferences: args.preferences,
    });

    return user._id;
  },
});

// Update onboarding status
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      onboardingCompleted: true,
    });

    return user._id;
  },
});

// Fetch all users for the sync orchestrator — returns only the fields
// needed to determine activity status. Keeps the payload minimal.
export const getAllForSync = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      lastActiveAt: u.lastActiveAt,
      lastLoginAt: u.lastLoginAt,
    }));
  },
});

// Update lastActiveAt to track user presence (called from frontend on mount/navigation).
// Server-side debounce: skip the write if lastActiveAt was updated less than 5 minutes
// ago. This prevents the write→invalidation→re-render→write cascade that caused
// thousands of redundant query re-executions and gigabytes of unnecessary reads.
export const touch = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return;

    const FIVE_MINUTES = 5 * 60 * 1000;
    if (user.lastActiveAt && Date.now() - user.lastActiveAt < FIVE_MINUTES) {
      return; // No write → no document change → no query invalidation
    }

    await ctx.db.patch(user._id, { lastActiveAt: Date.now() });
  },
});

// Soft delete user (from Clerk webhook)
export const deleteByClerkId = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return;
    }

    await ctx.db.patch(user._id, {
      email: `deleted-${Date.now()}@deleted.com`,
      name: "Deleted User",
      avatar: undefined,
    });
  },
});
