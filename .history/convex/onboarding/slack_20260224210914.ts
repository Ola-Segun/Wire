"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { WebClient } from "@slack/web-api";

// Initiate Slack OAuth flow
export const initiateOAuth = action({
  args: {
    userId: v.id("users"),
    origin: v.optional(v.string()), // "settings" or "onboarding" (default)
  },
  handler: async (ctx, args) => {
    const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUri = `${siteUrl}/api/auth/slack/callback`;

    console.log("Slack initiateOAuth debug:", {
      siteUrl,
      redirectUri,
      hasClientId: !!process.env.SLACK_CLIENT_ID,
    });

    // Encode origin in state so callback knows where to redirect
    const statePayload = args.origin
      ? `${args.userId}|${args.origin}`
      : args.userId;

    const authUrl =
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${process.env.SLACK_CLIENT_ID}&` +
      // Bot scopes — used for sending messages and listing workspace users
      `scope=channels:history,channels:read,im:history,im:read,im:write,users:read,users:read.email,chat:write&` +
      // User scopes — required to read user-to-user DM history (bot tokens cannot access these)
      `user_scope=im:history,im:read,channels:history,channels:read&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(statePayload)}`;

    return { authUrl };
  },
});

// Handle OAuth callback
export const handleCallback = action({
  args: {
    code: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const client = new WebClient();

    const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUri = `${siteUrl}/api/auth/slack/callback`;

    console.log("Slack handleCallback debug:", {
      siteUrl,
      redirectUri,
      hasClientId: !!process.env.SLACK_CLIENT_ID,
      hasClientSecret: !!process.env.SLACK_CLIENT_SECRET,
    });

    const result = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code: args.code,
      redirect_uri: redirectUri,
    });

    const authedUser = (result as any).authed_user;
    await ctx.runMutation(api.oauth.storeTokens, {
      userId: args.userId,
      platform: "slack",
      // Bot token — used for sending messages and listing workspace users
      accessToken: result.access_token!,
      scope: result.scope ?? undefined,
      // User's own Slack ID — identifies outbound messages in webhook handler
      platformUserId: authedUser?.id ?? undefined,
      // User token (xoxp-) — required to read user-to-user DM history.
      // Bot tokens can only see DMs that the bot itself is part of.
      userAccessToken: authedUser?.access_token ?? undefined,
    });

    // Mark Slack as connected in onboarding state
    await ctx.runMutation(api.onboarding.state.addPlatform, {
      platform: "slack",
      userId: args.userId,
    });

    // Re-activate any previously linked identities (handles reconnect after disconnect)
    await ctx.runMutation(api.identities.reactivateForPlatform, {
      userId: args.userId,
      platform: "slack",
    });

    return { success: true };
  },
});

// Discover new Slack workspace users not yet tracked in platform_identities.
// Follows the same transient pattern as importUsers — no DB writes.
// Returns only users whose platformUserId is NOT already in platform_identities,
// so the caller (SyncContactsModal) can let the user pick which ones to add.
// Users are persisted only when the user confirms via identities.createSelected.
export const discoverNewUsers = action({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args
  ): Promise<{
    count: number;
    users: Array<{
      platformUserId: string;
      displayName: string;
      username?: string;
      email?: string;
      avatar?: string;
    }>;
  }> => {
    const tokens: Record<string, any> | null = await ctx.runQuery(
      api.oauth.getTokens,
      { userId: args.userId, platform: "slack" }
    );
    if (!tokens) throw new Error("Slack not connected");

    const slackClient: InstanceType<typeof WebClient> = new WebClient(
      tokens.accessToken
    );
    const result: Record<string, any> = await slackClient.users.list({});

    const members: Array<Record<string, any>> = (result.members || []).filter(
      (u: any) => !u.is_bot && !u.deleted && u.id !== "USLACKBOT"
    );

    // Filter against existing platform_identities — return only genuinely new users
    const existingIdentities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId: args.userId, platform: "slack" }
    );
    const knownIds = new Set(existingIdentities.map((i) => i.platformUserId));

    // Exclude the authenticated user's own Slack account — they are not their own client
    const selfToken: Record<string, any> | null = await ctx.runQuery(
      api.oauth.getTokens,
      { userId: args.userId, platform: "slack" }
    );
    if (selfToken?.platformUserId) {
      knownIds.add(selfToken.platformUserId);
    }

    const newUsers = members
      .filter((u) => !knownIds.has(u.id))
      .map((u) => ({
        platformUserId: u.id as string,
        displayName: (u.real_name || u.name || "Unknown") as string,
        username: u.name as string | undefined,
        email: u.profile?.email as string | undefined,
        avatar: u.profile?.image_192 as string | undefined,
      }));

    // No DB writes — identities are persisted only when user confirms selection
    return { count: newUsers.length, users: newUsers };
  },
});

// Import Slack workspace users
export const importUsers = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ count: number }> => {
    const tokens: Record<string, any> | null = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "slack",
    });

    if (!tokens) throw new Error("Slack not connected");

    const client: InstanceType<typeof WebClient> = new WebClient(tokens.accessToken);

    const result: Record<string, any> = await client.users.list({});

    const users: Array<Record<string, any>> = (result.members || [])
      .filter((u: any) => !u.is_bot && !u.deleted && u.id !== "USLACKBOT")
      .map((u: any) => ({
        platformUserId: u.id!,
        displayName: u.real_name || u.name || "Unknown",
        username: u.name,
        email: u.profile?.email,
        avatar: u.profile?.image_192,
      }));

    // Return users as plain data — identities are created only when the user
    // explicitly links a Slack user to a client in step-4 (via identities.createSelected).
    // This prevents every workspace member from becoming a permanent DB record.
    return { count: users.length, users };
  },
});
