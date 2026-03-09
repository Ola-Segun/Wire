"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { WebClient } from "@slack/web-api";

// Send a Slack message
export const sendMessage = action({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
    platformIdentityId: v.id("platform_identities"),
    text: v.string(),
    inReplyToMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; messageId: string }> => {
    // Rate limit: max 30 sends per minute per user
    const rateCheck = await ctx.runQuery(api.rateLimit.check, {
      key: `send:${args.userId}`,
      windowMs: 60_000,
      maxRequests: 30,
    });
    if (!rateCheck.allowed) {
      throw new Error("Rate limit exceeded: too many messages sent. Please wait a moment.");
    }
    await ctx.runMutation(api.rateLimit.record, { key: `send:${args.userId}` });

    console.log(`Slack sendMessage: sending for user=${args.userId} client=${args.clientId}`);

    // Get OAuth tokens
    const tokens: Record<string, any> | null = await ctx.runQuery(
      api.oauth.getTokens,
      { userId: args.userId, platform: "slack" }
    );

    if (!tokens) {
      console.error(`Slack sendMessage: no tokens for user=${args.userId}`);
      throw new Error("Slack not connected");
    }

    // Get recipient identity
    const identity: Record<string, any> | null = await ctx.runQuery(
      api.identities.get,
      { id: args.platformIdentityId }
    );

    if (!identity?.platformUserId) throw new Error("Slack user ID not found");

    // Get original message for thread context
    let threadTs: string | undefined;
    if (args.inReplyToMessageId) {
      const originalMessage: Record<string, any> | null = await ctx.runQuery(
        api.messages.get,
        { id: args.inReplyToMessageId }
      );
      threadTs = originalMessage?.threadId ?? originalMessage?.platformMessageId;
    }

    const client = new WebClient(tokens.accessToken);

    // Open DM channel with the user
    const imResult = await client.conversations.open({
      users: identity.platformUserId,
    });

    const channelId = imResult.channel?.id;
    if (!channelId) throw new Error("Could not open DM channel");

    // Send message
    const result = await client.chat.postMessage({
      channel: channelId,
      text: args.text,
      thread_ts: threadTs,
    });

    const platformMessageId = result.ts || `sent-${Date.now()}`;

    // Store outbound message
    const messageId = await ctx.runMutation(api.messages.create, {
      userId: args.userId,
      clientId: args.clientId,
      platformIdentityId: args.platformIdentityId,
      platform: "slack",
      platformMessageId,
      threadId: result.ts ?? undefined,
      text: args.text,
      timestamp: Date.now(),
      direction: "outbound",
      isRead: true,
      aiProcessed: false,
    });

    console.log(`Slack sendMessage: sent successfully, platformMessageId=${platformMessageId}`);
    return { success: true, messageId };
  },
});
