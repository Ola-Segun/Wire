import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Suggest identity matches based on email and name similarity
export const suggestMatches = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get all platform identities for this user
    const allIdentities = await ctx.db
      .query("platform_identities")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Group by platform
    const byPlatform = new Map<string, typeof allIdentities>();
    for (const identity of allIdentities) {
      const list = byPlatform.get(identity.platform) || [];
      list.push(identity);
      byPlatform.set(identity.platform, list);
    }

    // Get already rejected matches
    const rejectedMatches = await ctx.db
      .query("rejected_identity_matches")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const rejectedPairs = new Set(
      rejectedMatches.map(
        (r) => `${r.identity1}:${r.identity2}`
      )
    );

    // Find potential matches between platforms
    const proposals: Array<{
      identities: string[];
      confidence: number;
      signals: Array<{ signal: string; confidence: number }>;
    }> = [];

    const platforms = Array.from(byPlatform.keys());

    for (let i = 0; i < platforms.length; i++) {
      for (let j = i + 1; j < platforms.length; j++) {
        const platformA = byPlatform.get(platforms[i])!;
        const platformB = byPlatform.get(platforms[j])!;

        for (const identA of platformA) {
          for (const identB of platformB) {
            // Skip if already linked to the same client
            if (identA.clientId && identA.clientId === identB.clientId) continue;

            // Skip if already rejected
            const pairKey1 = `${identA._id}:${identB._id}`;
            const pairKey2 = `${identB._id}:${identA._id}`;
            if (rejectedPairs.has(pairKey1) || rejectedPairs.has(pairKey2))
              continue;

            const signals: Array<{ signal: string; confidence: number }> = [];

            // Email match
            if (identA.email && identB.email) {
              const emailA = identA.email.toLowerCase().trim();
              const emailB = identB.email.toLowerCase().trim();

              if (emailA === emailB) {
                signals.push({ signal: "exact_email_match", confidence: 0.95 });
              } else {
                // Domain match
                const domainA = emailA.split("@")[1];
                const domainB = emailB.split("@")[1];
                if (
                  domainA === domainB &&
                  !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"].includes(domainA)
                ) {
                  signals.push({ signal: "same_company_domain", confidence: 0.6 });
                }
              }
            }

            // Name similarity
            if (identA.displayName && identB.displayName) {
              const nameA = identA.displayName.toLowerCase().trim();
              const nameB = identB.displayName.toLowerCase().trim();

              if (nameA === nameB) {
                signals.push({ signal: "exact_name_match", confidence: 0.85 });
              } else {
                // Simple contains check
                const partsA = nameA.split(/\s+/);
                const partsB = nameB.split(/\s+/);
                const sharedParts = partsA.filter((p) =>
                  partsB.some((pb) => pb === p && p.length > 2)
                );
                if (sharedParts.length > 0) {
                  const similarity =
                    sharedParts.length /
                    Math.max(partsA.length, partsB.length);
                  if (similarity >= 0.5) {
                    signals.push({
                      signal: "name_similarity",
                      confidence: similarity * 0.7,
                    });
                  }
                }
              }
            }

            // Username → name match
            if (identA.username && identB.displayName) {
              const username = identA.username.toLowerCase().replace(/[._-]/g, " ");
              const name = identB.displayName.toLowerCase();
              if (name.includes(username) || username.includes(name.split(" ")[0])) {
                signals.push({ signal: "username_name_match", confidence: 0.5 });
              }
            }
            if (identB.username && identA.displayName) {
              const username = identB.username.toLowerCase().replace(/[._-]/g, " ");
              const name = identA.displayName.toLowerCase();
              if (name.includes(username) || username.includes(name.split(" ")[0])) {
                signals.push({ signal: "username_name_match", confidence: 0.5 });
              }
            }

            if (signals.length > 0) {
              const confidence = Math.min(
                1,
                signals.reduce((sum, s) => sum + s.confidence, 0) /
                  signals.length +
                  signals.length * 0.05
              );

              if (confidence >= 0.4) {
                proposals.push({
                  identities: [identA._id, identB._id],
                  confidence,
                  signals,
                });
              }
            }
          }
        }
      }
    }

    // Sort by confidence descending
    proposals.sort((a, b) => b.confidence - a.confidence);

    // Enrich with identity details
    return proposals.map((p) => ({
      ...p,
      identityDetails: p.identities.map((id) =>
        allIdentities.find((i) => i._id === id)
      ),
    }));
  },
});

// Confirm a match proposal - link identities to the same client
export const confirmMatch = mutation({
  args: {
    identityIds: v.array(v.id("platform_identities")),
    existingClientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    let clientId = args.existingClientId;

    // If no existing client, create from first identity
    if (!clientId) {
      const firstIdentity = await ctx.db.get(args.identityIds[0]);
      if (!firstIdentity) throw new Error("Identity not found");

      clientId = await ctx.db.insert("clients", {
        userId: user._id,
        name: firstIdentity.displayName,
        primaryEmail: firstIdentity.email,
        primaryPhone: firstIdentity.phoneNumber,
        firstContactDate: firstIdentity.firstSeenAt,
        lastContactDate: firstIdentity.lastSeenAt,
        totalMessages: firstIdentity.messageCount,
        createdFromPlatform: firstIdentity.platform,
        createdFromIdentity: firstIdentity._id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isArchived: false,
      });
    }

    // Link all identities to this client
    for (const identityId of args.identityIds) {
      await ctx.db.patch(identityId, {
        clientId,
        linkedAt: Date.now(),
      });
    }

    // Store the proposal as confirmed
    await ctx.db.insert("identity_link_proposals", {
      userId: user._id,
      identities: args.identityIds,
      status: "confirmed",
      confidence: 1,
      matchingSignals: [{ signal: "user_confirmed", confidence: 1 }],
      proposedAt: Date.now(),
      reviewedAt: Date.now(),
      clientId,
    });

    return clientId;
  },
});

// Reject a match proposal
export const rejectMatch = mutation({
  args: {
    identity1: v.id("platform_identities"),
    identity2: v.id("platform_identities"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) throw new Error("User not found");

    await ctx.db.insert("rejected_identity_matches", {
      userId: user._id,
      identity1: args.identity1,
      identity2: args.identity2,
      rejectedAt: Date.now(),
      reason: args.reason,
    });
  },
});

// Link identity to an existing client
export const linkToClient = mutation({
  args: {
    identityId: v.id("platform_identities"),
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.identityId, {
      clientId: args.clientId,
      linkedAt: Date.now(),
    });

    // Update client's total messages
    const identity = await ctx.db.get(args.identityId);
    if (identity) {
      const client = await ctx.db.get(args.clientId);
      if (client) {
        await ctx.db.patch(args.clientId, {
          totalMessages: client.totalMessages + identity.messageCount,
          lastContactDate: Math.max(client.lastContactDate, identity.lastSeenAt),
          updatedAt: Date.now(),
        });
      }
    }
  },
});

// Get pending match proposals for a user
export const getPendingProposals = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("identity_link_proposals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "pending")
      )
      .collect();
  },
});
