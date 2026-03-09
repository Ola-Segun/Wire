import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
// COMMITMENTS — Extracted action items / deadlines
// ============================================
// Foundation for wire2.md's "Commitment Tracker":
// AI extracts "send revised logo by Thursday" → tracked task.
// This module provides CRUD; AI wiring comes in the AI phase.

// Create a commitment (called by AI extraction or manually by user)
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    conversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.id("messages"),
    text: v.string(),
    type: v.string(),     // "deadline" | "deliverable" | "payment" | "meeting"
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify client belongs to user
    const client = await ctx.db.get(args.clientId);
    if (!client || client.userId !== user._id)
      throw new Error("Unauthorized");

    return await ctx.db.insert("commitments", {
      userId: user._id,
      clientId: args.clientId,
      conversationId: args.conversationId,
      sourceMessageId: args.sourceMessageId,
      text: args.text,
      type: args.type,
      status: "pending",
      dueDate: args.dueDate,
      createdAt: Date.now(),
    });
  },
});

// Mark commitment as complete
export const complete = mutation({
  args: { id: v.id("commitments") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const commitment = await ctx.db.get(args.id);
    if (!commitment) throw new Error("Commitment not found");
    if (commitment.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, {
      status: "completed",
      completedAt: Date.now(),
    });
  },
});

// Cancel a commitment
export const cancel = mutation({
  args: { id: v.id("commitments") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const commitment = await ctx.db.get(args.id);
    if (!commitment) throw new Error("Commitment not found");
    if (commitment.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.id, { status: "cancelled" });
  },
});

// Get commitments for a client
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const commitments = await ctx.db
      .query("commitments")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Filter to user's own + optional status filter
    return commitments.filter(
      (c) =>
        c.userId === user._id && (!args.status || c.status === args.status)
    );
  },
});

// Get all pending/overdue commitments for current user
export const getPending = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const commitments = await ctx.db
      .query("commitments")
      .withIndex("by_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .collect();

    // Check for overdue items
    const now = Date.now();
    return commitments.map((c) => ({
      ...c,
      isOverdue: c.dueDate ? c.dueDate < now : false,
    }));
  },
});

// Get commitments for a conversation
export const getByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("commitments")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
  },
});
