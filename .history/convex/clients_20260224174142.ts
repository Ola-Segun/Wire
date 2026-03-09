import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all clients for authenticated user
export const getByUser = query({
  args: {
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return [];

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", user._id).eq("isArchived", false)
      )
      .collect();

    // Sort based on preference
    switch (args.sortBy) {
      case "health":
        return clients.sort(
          (a, b) => (a.relationshipHealth ?? 0) - (b.relationshipHealth ?? 0)
        );
      case "recent":
        return clients.sort((a, b) => b.lastContactDate - a.lastContactDate);
      case "messages":
        return clients.sort((a, b) => b.totalMessages - a.totalMessages);
      case "name":
        return clients.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return clients.sort((a, b) => b.lastContactDate - a.lastContactDate);
    }
  },
});

// Get archived clients for authenticated user
export const getArchived = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return [];

    return await ctx.db
      .query("clients")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", user._id).eq("isArchived", true)
      )
      .collect();
  },
});

// Get single client by ID
export const get = query({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const client = await ctx.db.get(args.id);
    if (!client) return null;

    // Verify ownership
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user || client.userId !== user._id) return null;

    return client;
  },
});

// Create client from a platform identity
export const createFromIdentity = mutation({
  args: {
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.db.get(args.identityId);
    if (!identity) throw new Error("Identity not found");

    const now = Date.now();

    const clientId = await ctx.db.insert("clients", {
      userId: identity.userId,
      name: identity.displayName,
      primaryEmail: identity.email,
      primaryPhone: identity.phoneNumber,
      createdFromPlatform: identity.platform,
      createdFromIdentity: args.identityId,
      firstContactDate: identity.firstSeenAt,
      lastContactDate: identity.lastSeenAt,
      totalMessages: identity.messageCount,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
    });

    // Link identity to the new client and mark as selected
    await ctx.db.patch(args.identityId, {
      clientId: clientId,
      linkedAt: now,
      isSelected: true,
    });

    return clientId;
  },
});

// Update client
export const update = mutation({
  args: {
    id: v.id("clients"),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    primaryEmail: v.optional(v.string()),
    primaryPhone: v.optional(v.string()),
    totalRevenue: v.optional(v.number()),
    currency: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    relationshipHealth: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const client = await ctx.db.get(id);
    if (!client) throw new Error("Client not found");

    // Filter out undefined values
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(id, patch);
    return id;
  },
});

// Archive client — cascades to deactivate all linked identities so sync stops.
// clientId on identities is preserved so restoring the client re-activates them.
export const archive = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (!client) throw new Error("Client not found");

    await ctx.db.patch(args.id, {
      isArchived: true,
      updatedAt: Date.now(),
    });

    // Deactivate all linked identities so webhooks/sync stop processing them
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();

    for (const identity of identities) {
      await ctx.db.patch(identity._id, { isSelected: false });
    }
  },
});

// Unarchive client — re-activates all linked identities so sync resumes.
export const unarchive = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (!client) throw new Error("Client not found");

    await ctx.db.patch(args.id, {
      isArchived: false,
      updatedAt: Date.now(),
    });

    // Re-activate all identities that were linked to this client
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_client", (q) => q.eq("clientId", args.id))
      .collect();

    for (const identity of identities) {
      await ctx.db.patch(identity._id, { isSelected: true });
    }
  },
});
