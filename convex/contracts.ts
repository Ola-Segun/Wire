import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

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
// CONTRACTS / SOWs — Scope Guardian Foundation
// ============================================
// Foundation for wire2.md's "Scope Guardian":
// Stores contract deliverables so AI can detect scope creep.
// This module provides CRUD; AI comparison wiring comes in the AI phase.

// Create a contract
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    title: v.string(),
    description: v.optional(v.string()),
    deliverables: v.array(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify client belongs to user
    const client = await ctx.db.get(args.clientId);
    if (!client || client.userId !== user._id)
      throw new Error("Unauthorized");

    const now = Date.now();

    return await ctx.db.insert("contracts", {
      userId: user._id,
      clientId: args.clientId,
      title: args.title,
      description: args.description,
      deliverables: args.deliverables,
      startDate: args.startDate,
      endDate: args.endDate,
      value: args.value,
      currency: args.currency,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update a contract
export const update = mutation({
  args: {
    id: v.id("contracts"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    deliverables: v.optional(v.array(v.string())),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const contract = await ctx.db.get(args.id);
    if (!contract) throw new Error("Contract not found");
    if (contract.userId !== user._id) throw new Error("Unauthorized");

    const { id, ...updates } = args;
    const cleanUpdates: Record<string, any> = {};

    // Only include provided fields
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) cleanUpdates[key] = value;
    }

    cleanUpdates.updatedAt = Date.now();
    await ctx.db.patch(args.id, cleanUpdates);
  },
});

// Get contracts for a client
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const contracts = await ctx.db
      .query("contracts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    return contracts.filter(
      (c) =>
        c.userId === user._id && (!args.status || c.status === args.status)
    );
  },
});

// Get all active contracts for current user
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("contracts")
      .withIndex("by_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .collect();
  },
});

// Internal query: fetch active contracts for a client without auth context.
// Used by skillDispatcher (scope_guardian) to check deliverables.
export const getActiveByClient = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contracts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// Get a single contract
export const get = query({
  args: { id: v.id("contracts") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return null;

    const contract = await ctx.db.get(args.id);
    if (!contract || contract.userId !== user._id) return null;

    return contract;
  },
});
