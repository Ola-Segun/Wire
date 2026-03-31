import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a platform identity
export const create = mutation({
  args: {
    userId: v.id("users"),
    platform: v.string(),
    platformUserId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    avatar: v.optional(v.string()),
    messageCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    isSelected: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check for existing identity with same platform + platformUserId
    const existing = await ctx.db
      .query("platform_identities")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .filter((q) => q.eq(q.field("platformUserId"), args.platformUserId))
      .first();

    if (existing) {
      // Update existing identity
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        username: args.username,
        email: args.email,
        avatar: args.avatar,
        messageCount: args.messageCount,
        lastSeenAt: args.lastSeenAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("platform_identities", args);
  },
});

// Get identity by ID
export const get = query({
  args: { id: v.id("platform_identities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// List identities by platform for a user
export const listByPlatform = query({
  args: {
    userId: v.id("users"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platform_identities")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .collect();
  },
});

// Get selected identities by platform
export const getSelectedByPlatform = query({
  args: {
    userId: v.id("users"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .collect();

    return identities.filter((i) => i.isSelected);
  },
});

// Get unlinked identities for a platform (no clientId assigned)
export const getUnlinkedByPlatform = query({
  args: {
    userId: v.id("users"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .collect();

    return identities.filter((i) => !i.clientId);
  },
});

// Get all identities linked to a client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platform_identities")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});

// Re-activate all previously linked identities for a platform (used after reconnect)
// Only re-activates identities that have a clientId (were previously linked to a client)
export const reactivateForPlatform = mutation({
  args: {
    userId: v.id("users"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .collect();

    let reactivated = 0;
    for (const identity of identities) {
      if (identity.clientId && !identity.isSelected) {
        await ctx.db.patch(identity._id, { isSelected: true });
        reactivated++;
      }
    }
    return reactivated;
  },
});

// Create a platform identity already marked as selected.
// Used at onboarding confirmation time so only chosen contacts are persisted.
export const createSelected = mutation({
  args: {
    userId: v.id("users"),
    platform: v.string(),
    platformUserId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    avatar: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    messageCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  },
  handler: async (ctx, args) => {
    // O(1) dedup via by_platform_user index, filtered to this user
    const existing = await ctx.db
      .query("platform_identities")
      .withIndex("by_platform_user", (q) =>
        q.eq("platform", args.platform).eq("platformUserId", args.platformUserId)
      )
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        email: args.email,
        avatar: args.avatar,
        messageCount: args.messageCount,
        lastSeenAt: args.lastSeenAt,
        isSelected: true,
      });
      return existing._id;
    }

    return await ctx.db.insert("platform_identities", { ...args, isSelected: true });
  },
});

// Mark identity as selected
export const markAsSelected = mutation({
  args: { identityId: v.id("platform_identities") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.identityId, { isSelected: true });
  },
});

// Update cached DM channel ID (Slack only, for fast webhook lookups)
export const updateDmChannelId = mutation({
  args: {
    identityId: v.id("platform_identities"),
    dmChannelId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.identityId, { dmChannelId: args.dmChannelId });
  },
});

// Link identity to a client (also marks as selected so sync picks it up)
export const linkToClient = mutation({
  args: {
    identityId: v.id("platform_identities"),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.identityId, {
      clientId: args.clientId,
      linkedAt: Date.now(),
      isSelected: true,
    });
  },
});

// List all identities for a user across all platforms (used by proposal generator)
export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platform_identities")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Unlink identity from its client.
// Strategy:
//   - If the identity has no messages → hard-delete the record. The contact
//     will re-appear as "new" the next time importContacts / discoverNewContacts
//     runs, allowing the user to re-select and re-link it.
//   - If messages exist → soft-deactivate (clear clientId, set isSelected=false).
//     The record must be kept so that message history (which references this ID)
//     remains intact.
export const unlinkFromClient = mutation({
  args: { identityId: v.id("platform_identities") },
  handler: async (ctx, args) => {
    const identity = await ctx.db.get(args.identityId);
    if (!identity) throw new Error("Identity not found");

    const hasMessages = await ctx.db
      .query("messages")
      .withIndex("by_identity", (q) =>
        q.eq("platformIdentityId", args.identityId)
      )
      .first();

    if (hasMessages) {
      // Keep record intact for message history — just deactivate sync
      await ctx.db.patch(args.identityId, {
        clientId: undefined,
        linkedAt: undefined,
        isSelected: false,
      });
    } else {
      // No messages reference this identity — safe to remove entirely
      await ctx.db.delete(args.identityId);
    }
  },
});

// Toggle sync for a single identity without changing its client linkage.
// isSelected=false pauses sync; true resumes it.
export const toggleSelected = mutation({
  args: {
    identityId: v.id("platform_identities"),
    isSelected: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.identityId, { isSelected: args.isSelected });
  },
});

// Get all unlinked identities across all platforms for a user.
// Used by the "Add connection" modal on the client detail page.
export const getAllUnlinked = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return identities.filter((i) => !i.clientId);
  },
});

// O(1) lookup: find a Slack identity by platformUserId across all users
// Used by Slack webhook handler to quickly find the matching identity
export const findByPlatformUser = query({
  args: {
    platform: v.string(),
    platformUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platform_identities")
      .withIndex("by_platform_user", (q) =>
        q.eq("platform", args.platform).eq("platformUserId", args.platformUserId)
      )
      .collect();
  },
});

// O(1) lookup: find identity by DM channel ID (Slack webhook outbound matching)
export const findByDmChannel = query({
  args: { dmChannelId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("platform_identities")
      .withIndex("by_dm_channel", (q) => q.eq("dmChannelId", args.dmChannelId))
      .first();
  },
});
