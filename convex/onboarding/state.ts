import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// Get onboarding state for current user
export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return null;

    const state = await ctx.db
      .query("onboarding_state")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    return state;
  },
});

// Initialize onboarding state (call once when onboarding starts)
export const init = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    // Check if already exists
    const existing = await ctx.db
      .query("onboarding_state")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("onboarding_state", {
      userId: user._id,
      currentStep: 1,
      completedSteps: [],
      connectedPlatforms: [],
      startedAt: Date.now(),
    });
  },
});

// Update current step
export const updateStep = mutation({
  args: {
    step: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    const state = await ctx.db
      .query("onboarding_state")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!state) throw new Error("Onboarding state not found");

    const completedSteps = [...state.completedSteps];
    if (!completedSteps.includes(state.currentStep)) {
      completedSteps.push(state.currentStep);
    }

    await ctx.db.patch(state._id, {
      currentStep: args.step,
      completedSteps,
    });
  },
});

// Add connected platform
export const addPlatform = mutation({
  args: {
    platform: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let userId = args.userId;

    // If userId not provided, get from auth context
    if (!userId) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Unauthorized");

      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .first();

      if (!user) throw new Error("User not found");
      userId = user._id;
    }

    const state = await ctx.db
      .query("onboarding_state")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!state) throw new Error("Onboarding state not found");

    const platforms = [...state.connectedPlatforms];
    if (!platforms.includes(args.platform)) {
      platforms.push(args.platform);
    }

    await ctx.db.patch(state._id, {
      connectedPlatforms: platforms,
    });
  },
});

// Save selected contacts
export const saveSelectedContacts = mutation({
  args: {
    contactIds: v.array(v.id("platform_identities")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    const state = await ctx.db
      .query("onboarding_state")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!state) throw new Error("Onboarding state not found");

    await ctx.db.patch(state._id, {
      selectedContacts: args.contactIds,
    });

    // Mark each contact as selected
    for (const contactId of args.contactIds) {
      await ctx.db.patch(contactId, { isSelected: true });
    }
  },
});

// One-time cleanup: remove legacy discoveredContacts field from onboarding_state documents.
// Run once from the Convex dashboard after deploying, then this can be deleted.
export const cleanupDiscoveredContacts = mutation({
  args: {},
  handler: async (ctx) => {
    const allStates = await ctx.db.query("onboarding_state").collect();
    let cleaned = 0;
    for (const state of allStates) {
      if ((state as any).discoveredContacts !== undefined) {
        await ctx.db.patch(state._id, { discoveredContacts: undefined });
        cleaned++;
      }
    }
    return { cleaned };
  },
});

// Complete onboarding
export const complete = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    const state = await ctx.db
      .query("onboarding_state")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (state) {
      await ctx.db.patch(state._id, {
        completedAt: Date.now(),
        currentStep: 5,
        completedSteps: [1, 2, 3, 4, 5],
      });
    }

    await ctx.db.patch(user._id, {
      onboardingCompleted: true,
    });
  },
});
