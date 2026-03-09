import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ============================================
// QUERIES
// ============================================

// Get all pending merge proposals for the current user
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) return [];

    const proposals = await ctx.db
      .query("identity_link_proposals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .collect();

    // Enrich with identity details for display
    const enriched = await Promise.all(
      proposals.map(async (proposal) => {
        const identityDetails = await Promise.all(
          proposal.identities.map((id) => ctx.db.get(id))
        );
        return {
          ...proposal,
          identityDetails: identityDetails.filter(Boolean),
        };
      })
    );

    return enriched;
  },
});

// ============================================
// MUTATIONS
// ============================================

// Accept a merge proposal: links identity2 to identity1's client and
// marks identity2 as selected so sync resumes for both.
export const accept = mutation({
  args: { proposalId: v.id("identity_link_proposals") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.status !== "pending") {
      throw new Error("Proposal not found or already resolved");
    }

    if (proposal.identities.length < 2) {
      throw new Error("Proposal must reference at least 2 identities");
    }

    const [primaryId, secondaryId] = proposal.identities;
    const primary = await ctx.db.get(primaryId);
    if (!primary?.clientId) {
      throw new Error("Primary identity must be linked to a client");
    }

    // Link secondary identity to the same client as primary
    await ctx.db.patch(secondaryId, {
      clientId: primary.clientId,
      linkedAt: Date.now(),
      isSelected: true,
    });

    // Mark proposal accepted
    await ctx.db.patch(args.proposalId, {
      status: "confirmed",
      reviewedAt: Date.now(),
      clientId: primary.clientId,
    });
  },
});

// Reject a proposal: records the rejection to prevent re-suggestion.
export const reject = mutation({
  args: {
    proposalId: v.id("identity_link_proposals"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.status !== "pending") {
      throw new Error("Proposal not found or already resolved");
    }

    // Mark proposal rejected
    await ctx.db.patch(args.proposalId, {
      status: "rejected",
      reviewedAt: Date.now(),
    });

    // Record rejection pair to prevent re-suggestion
    if (proposal.identities.length >= 2) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
          .first();
        if (user) {
          await ctx.db.insert("rejected_identity_matches", {
            userId: user._id,
            identity1: proposal.identities[0],
            identity2: proposal.identities[1],
            rejectedAt: Date.now(),
            reason: args.reason,
          });
        }
      }
    }
  },
});

// ============================================
// ACTIONS
// ============================================

// Generate cross-platform merge proposals for identities that likely belong
// to the same real person. Matches on: exact email, name similarity.
// Skips pairs that were already proposed or rejected.
export const generate = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ proposed: number }> => {
    // Fetch all identities for this user
    const allIdentities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByUser,
      { userId: args.userId }
    );

    // Fetch already-rejected pairs to avoid re-suggesting
    const rejected: Array<Record<string, any>> = await ctx.runQuery(
      api.identityProposals.getRejectedPairs,
      { userId: args.userId }
    );
    const rejectedSet = new Set(
      rejected.map((r) => `${r.identity1}__${r.identity2}`)
    );

    // Fetch existing pending proposals to avoid duplicates
    const existingProposals: Array<Record<string, any>> = await ctx.runQuery(
      api.identityProposals.getAll,
      {}
    );
    const existingSet = new Set(
      existingProposals.map((p) => p.identities.slice().sort().join("__"))
    );

    // Group by platform to find cross-platform candidates
    const byEmail = new Map<string, Array<Record<string, any>>>();
    for (const id of allIdentities) {
      if (!id.email) continue;
      const key = id.email.toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key)!.push(id);
    }

    let proposed = 0;

    // Exact email match across different platforms → high confidence
    for (const [, group] of byEmail) {
      if (group.length < 2) continue;

      // Only pair across different platforms, and only pairs where one has a clientId
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];

          if (a.platform === b.platform) continue;
          // At least one must have a client to be actionable
          if (!a.clientId && !b.clientId) continue;
          // Both already linked to same client — no proposal needed
          if (a.clientId && b.clientId && a.clientId === b.clientId) continue;

          const pairKey = [a._id, b._id].sort().join("__");
          if (rejectedSet.has(pairKey) || existingSet.has(pairKey)) continue;

          // Determine primary (the one with a clientId) and secondary
          const [primary, secondary] = a.clientId ? [a, b] : [b, a];

          await ctx.runMutation(api.identityProposals.createProposal, {
            userId: args.userId,
            primaryIdentityId: primary._id,
            secondaryIdentityId: secondary._id,
            confidence: 0.95,
            signal: "email_match",
          });

          proposed++;
        }
      }
    }

    return { proposed };
  },
});

// ============================================
// INTERNAL HELPERS (called by generate action)
// ============================================

export const createProposal = mutation({
  args: {
    userId: v.id("users"),
    primaryIdentityId: v.id("platform_identities"),
    secondaryIdentityId: v.id("platform_identities"),
    confidence: v.number(),
    signal: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("identity_link_proposals", {
      userId: args.userId,
      identities: [args.primaryIdentityId, args.secondaryIdentityId],
      status: "pending",
      confidence: args.confidence,
      matchingSignals: [
        { signal: args.signal, confidence: args.confidence },
      ],
      proposedAt: Date.now(),
    });
  },
});

export const getRejectedPairs = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rejected_identity_matches")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
