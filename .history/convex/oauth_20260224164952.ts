import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Store OAuth tokens for a platform
export const storeTokens = mutation({
  args: {
    userId: v.id("users"),
    platform: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    email: v.optional(v.string()),
    // The authenticated user's own platform user ID (Slack: authed_user.id)
    platformUserId: v.optional(v.string()),
    // Slack user-level token (xoxp-) for reading user-to-user DM history
    userAccessToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if tokens already exist for this user + platform
    const existing = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .first();

    if (existing) {
      // Update existing tokens
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken ?? existing.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope ?? existing.scope,
        email: args.email ?? existing.email,
        platformUserId: args.platformUserId ?? existing.platformUserId,
        userAccessToken: args.userAccessToken ?? existing.userAccessToken,
        lastRefreshedAt: Date.now(),
      });
      return existing._id;
    }

    // Create new token record
    return await ctx.db.insert("oauth_tokens", {
      userId: args.userId,
      platform: args.platform,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scope: args.scope,
      email: args.email,
      platformUserId: args.platformUserId,
      userAccessToken: args.userAccessToken,
      createdAt: Date.now(),
    });
  },
});

// Get OAuth tokens for a user + platform
export const getTokens = query({
  args: {
    userId: v.id("users"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oauth_tokens")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .first();
  },
});

// Get connected platforms for current user
export const getConnectedPlatforms = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return [];

    const tokens = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_user_platform", (q) => q.eq("userId", user._id))
      .collect();

    return tokens.map((t) => ({
      platform: t.platform,
      createdAt: t.createdAt,
      lastRefreshedAt: t.lastRefreshedAt,
      hasRefreshToken: !!t.refreshToken,
    }));
  },
});

// List all active connections across all users (for cron orchestrator)
export const listAllConnections = query({
  args: {},
  handler: async (ctx) => {
    const allTokens = await ctx.db.query("oauth_tokens").collect();
    return allTokens.map((t) => ({
      userId: t.userId,
      platform: t.platform,
    }));
  },
});

// Update historyId for push notification tracking
export const updateHistoryId = mutation({
  args: {
    userId: v.id("users"),
    platform: v.string(),
    historyId: v.string(),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .first();

    if (tokens) {
      await ctx.db.patch(tokens._id, {
        historyId: args.historyId,
        lastRefreshedAt: Date.now(),
      });
    }
  },
});

// Get all Gmail oauth_token records with full token data (for watch renewal in cron)
export const getAllGmailTokens = query({
  args: {},
  handler: async (ctx) => {
    const allTokens = await ctx.db.query("oauth_tokens").collect();
    return allTokens.filter((t) => t.platform === "gmail");
  },
});

// Get all Gmail connections with historyIds (for webhook processing)
export const getGmailConnectionsWithHistory = query({
  args: {},
  handler: async (ctx) => {
    const gmailTokens = await ctx.db
      .query("oauth_tokens")
      .collect();

    return gmailTokens
      .filter((t) => t.platform === "gmail" && t.historyId)
      .map((t) => ({
        userId: t.userId,
        historyId: t.historyId!,
        email: t.email,
      }));
  },
});

// Find Gmail connection by email address (for targeted webhook processing)
export const getGmailConnectionByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_platform_email", (q) =>
        q.eq("platform", "gmail").eq("email", args.email.toLowerCase())
      )
      .first();

    if (!token || !token.historyId) return null;

    return {
      userId: token.userId,
      historyId: token.historyId,
      email: token.email,
    };
  },
});

// Find a Slack OAuth connection by the user's own Slack user ID (authed_user.id).
// Used by the webhook handler to identify outbound messages sent by the Wire user.
export const findSlackConnectionByUserId = query({
  args: { slackUserId: v.string() },
  handler: async (ctx, args) => {
    const tokens = await ctx.db.query("oauth_tokens").collect();
    const match = tokens.find(
      (t) => t.platform === "slack" && t.platformUserId === args.slackUserId
    );
    if (!match) return null;
    return { userId: match.userId };
  },
});

// Full platform data removal — deletes tokens, deactivates identities, and
// optionally purges all messages and identity records from that platform.
// Use for "remove all my data from this platform" use cases.
export const removePlatformData = mutation({
  args: {
    userId: v.id("users"),
    platform: v.string(),
    deleteMessages: v.boolean(),
    deleteIdentities: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Delete OAuth tokens
    const tokens = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .first();
    if (tokens) await ctx.db.delete(tokens._id);

    // Gather all platform identities for this user+platform
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .collect();

    for (const identity of identities) {
      if (args.deleteMessages) {
        // Delete all messages from this identity
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_identity", (q) =>
            q.eq("platformIdentityId", identity._id)
          )
          .collect();
        for (const msg of messages) await ctx.db.delete(msg._id);
      }

      if (args.deleteIdentities) {
        await ctx.db.delete(identity._id);
      } else {
        // Soft-deactivate only
        await ctx.db.patch(identity._id, { isSelected: false });
      }
    }

    // Remove any pending proposals that reference these identities
    const identityIds = new Set(identities.map((i) => i._id));
    const proposals = await ctx.db
      .query("identity_link_proposals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "pending")
      )
      .collect();
    for (const proposal of proposals) {
      const hasIdentity = proposal.identities.some((id) => identityIds.has(id));
      if (hasIdentity) await ctx.db.delete(proposal._id);
    }
  },
});

// Delete tokens (disconnect platform) + cascade cleanup identities
export const deleteTokens = mutation({
  args: {
    userId: v.id("users"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    // Delete the OAuth tokens
    const tokens = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .first();

    if (tokens) {
      await ctx.db.delete(tokens._id);
    }

    // Cascade: deactivate all platform identities for this user+platform
    const identities = await ctx.db
      .query("platform_identities")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform)
      )
      .collect();

    for (const identity of identities) {
      await ctx.db.patch(identity._id, {
        isSelected: false,
      });
    }
  },
});
