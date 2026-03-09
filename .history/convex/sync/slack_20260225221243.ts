"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { WebClient } from "@slack/web-api";

// Sync Slack DM messages for a specific identity/client
export const syncMessages = action({
  args: {
    userId: v.id("users"),
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args) => {
    console.log(`Slack syncMessages: starting for user=${args.userId} identity=${args.identityId}`);

    const identity = await ctx.runQuery(api.identities.get, {
      id: args.identityId,
    });

    if (!identity || !identity.clientId) {
      console.error(`Slack syncMessages: identity=${args.identityId} not linked to client`);
      throw new Error("Identity not linked to client");
    }

    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "slack",
    });

    if (!tokens) {
      console.error(`Slack syncMessages: no tokens found for user=${args.userId}`);
      throw new Error("Slack not connected");
    }

    const userToken: string | undefined = (tokens as any).userAccessToken;
    if (!userToken) {
      console.warn(
        `Slack syncMessages: no user token for user=${args.userId}. ` +
        `Reconnect Slack after adding im:history and im:read to User Token Scopes in the Slack app dashboard.`
      );
      return { synced: 0 };
    }

    // Use the user token (xoxp-) — bot tokens can only access DMs the bot is part of,
    // not user-to-user DMs.
    const client = new WebClient(userToken);

    // Validate token is still active
    try {
      const authTest = await client.auth.test();
      if (!authTest.ok) {
        console.error(`Slack syncMessages: token invalid for user=${args.userId}, auth.test failed`);
        return { synced: 0 };
      }
    } catch (err) {
      console.error(`Slack syncMessages: token validation failed for user=${args.userId}:`, err);
      return { synced: 0 };
    }

    // Find the user-to-user DM channel by listing the user's existing DMs.
    // We use conversations.list (requires im:read) instead of conversations.open
    // (which requires im:write) — read-only is sufficient to find an existing DM.
    let dmChannelId: string | undefined;
    let cursor: string | undefined;
    try {
      do {
        const listResult: any = await client.conversations.list({
          types: "im",
          limit: 200,
          ...(cursor ? { cursor } : {}),
        });
        const match = listResult.channels?.find(
          (ch: any) => ch.user === identity.platformUserId
        );
        if (match?.id) {
          dmChannelId = match.id;
          break;
        }
        cursor = listResult.response_metadata?.next_cursor || undefined;
      } while (cursor);
    } catch (err: any) {
      const slackError: string = err?.data?.error ?? err?.message ?? String(err);
      if (slackError.includes("missing_scope")) {
        console.error(
          `Slack syncMessages: user token is missing im:read scope for user=${args.userId}. ` +
          `Add im:history and im:read to User Token Scopes in the Slack app dashboard, ` +
          `reinstall the app, then disconnect and reconnect Slack in Wire.`
        );
      } else {
        console.error(`Slack syncMessages: conversations.list failed for user=${args.userId}:`, err);
      }
      return { synced: 0 };
    }

    if (!dmChannelId) {
      console.log(
        `Slack syncMessages: no existing DM found with contact ${identity.platformUserId} for identity=${args.identityId}. ` +
        `Send a DM to this contact in Slack first, then sync again.`
      );
      return { synced: 0 };
    }

    // Cache the DM channel ID on the identity for fast webhook lookups
    await ctx.runMutation(api.identities.updateDmChannelId, {
      identityId: args.identityId,
      dmChannelId,
    });

    // Fetch message history
    let history: any;
    try {
      history = await client.conversations.history({
        channel: dmChannelId,
        limit: 100,
      });
    } catch (err: any) {
      const slackError: string = err?.data?.error ?? err?.message ?? String(err);
      if (slackError.includes("missing_scope")) {
        console.error(
          `Slack syncMessages: user token is missing im:history scope for user=${args.userId}. ` +
          `Add im:history to User Token Scopes in the Slack app dashboard, ` +
          `reinstall the app, then disconnect and reconnect Slack in Wire.`
        );
      } else {
        console.error(`Slack syncMessages: conversations.history failed for channel=${dmChannelId}:`, err);
      }
      return { synced: 0 };
    }

    let synced = 0;

    for (const message of history.messages || []) {
      if (!message.text || !message.ts) continue;
      // Skip bot messages and system messages
      if (message.subtype) continue;

      const direction =
        message.user === identity.platformUserId ? "inbound" : "outbound";

      try {
        // Resolve conversation thread (cross-platform grouping)
        const conversationId = await ctx.runMutation(api.conversations.resolveForMessage, {
          userId: args.userId,
          clientId: identity.clientId!,
          platform: "slack",
          threadId: message.thread_ts ?? message.ts,
          timestamp: Math.floor(parseFloat(message.ts) * 1000),
        });

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: identity.clientId!,
          platformIdentityId: args.identityId,
          platform: "slack",
          platformMessageId: message.ts,
          conversationId,
          threadId: message.thread_ts ?? message.ts,
          text: message.text,
          timestamp: Math.floor(parseFloat(message.ts) * 1000),
          direction,
          isRead: true,
          aiProcessed: false,
        });
        synced++;
      } catch (err) {
        console.error(
          `Slack syncMessages: failed to create message ts=${message.ts} for identity=${args.identityId}:`,
          err
        );
        continue;
      }
    }

    console.log(`Slack syncMessages: completed for identity=${args.identityId}, synced=${synced}`);
    return { synced };
  },
});

// Process a single Slack event message (triggered by Events API webhook)
export const processEvent = action({
  args: {
    userId: v.id("users"),
    slackUserId: v.string(),
    text: v.string(),
    ts: v.string(),
    threadTs: v.optional(v.string()),
    channelId: v.string(),
  },
  handler: async (ctx, args): Promise<{ synced: boolean }> => {
    // Find the identity matching this Slack user
    const identities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId: args.userId, platform: "slack" }
    );

    // Try to match sender as a tracked contact (inbound message from them)
    const matchedAsContact = identities.find(
      (id) => id.platformUserId === args.slackUserId && id.clientId && id.isSelected
    );

    if (matchedAsContact) {
      // Message is FROM the tracked contact → inbound
      try {
        // Resolve conversation thread
        const conversationId = await ctx.runMutation(api.conversations.resolveForMessage, {
          userId: args.userId,
          clientId: matchedAsContact.clientId!,
          platform: "slack",
          threadId: args.threadTs ?? args.ts,
          timestamp: Math.floor(parseFloat(args.ts) * 1000),
        });

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: matchedAsContact.clientId!,
          platformIdentityId: matchedAsContact._id,
          platform: "slack",
          platformMessageId: args.ts,
          conversationId,
          threadId: args.threadTs ?? args.ts,
          text: args.text,
          timestamp: Math.floor(parseFloat(args.ts) * 1000),
          direction: "inbound",
          isRead: false,
          aiProcessed: false,
        });
        return { synced: true };
      } catch (err) {
        console.error(
          `Slack processEvent: failed to create inbound message from slackUser=${args.slackUserId} for identity=${matchedAsContact._id}:`,
          err
        );
        return { synced: false };
      }
    }

    // Sender is NOT a tracked contact — likely the user's own outbound message.
    // Look up which contact this DM channel belongs to using cached dmChannelId.
    const matchedByChannel = identities.find(
      (id) => id.dmChannelId === args.channelId && id.clientId && id.isSelected
    );

    if (matchedByChannel) {
      try {
        // Resolve conversation thread
        const conversationId = await ctx.runMutation(api.conversations.resolveForMessage, {
          userId: args.userId,
          clientId: matchedByChannel.clientId!,
          platform: "slack",
          threadId: args.threadTs ?? args.ts,
          timestamp: Math.floor(parseFloat(args.ts) * 1000),
        });

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: matchedByChannel.clientId!,
          platformIdentityId: matchedByChannel._id,
          platform: "slack",
          platformMessageId: args.ts,
          conversationId,
          threadId: args.threadTs ?? args.ts,
          text: args.text,
          timestamp: Math.floor(parseFloat(args.ts) * 1000),
          direction: "outbound",
          isRead: true,
          aiProcessed: false,
        });
        return { synced: true };
      } catch (err) {
        console.error(
          `Slack processEvent: failed to create outbound message in channel=${args.channelId}:`,
          err
        );
        return { synced: false };
      }
    }

    // No match found — message is from an untracked channel/user
    console.warn(
      `Slack processEvent: no identity match for slackUser=${args.slackUserId} channel=${args.channelId}. ` +
      `Checked ${identities.length} identities for userId=${args.userId}. ` +
      `Ensure the contact is linked to a client with isSelected=true and dmChannelId is cached.`
    );
    return { synced: false };
  },
});
