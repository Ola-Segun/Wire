"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// Discord Send Adapter — Discord REST API
// ============================================

const DISCORD_API = "https://discord.com/api/v10";

// Send a Discord DM message
export const sendMessage = action({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
    platformIdentityId: v.id("platform_identities"),
    text: v.string(),
    inReplyToMessageId: v.optional(v.id("messages")),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; messageId: string }> => {
    // Rate limit: max 30 sends per minute per user
    const rateCheck = await ctx.runQuery(api.rateLimit.check, {
      key: `send:${args.userId}`,
      windowMs: 60_000,
      maxRequests: 30,
    });
    if (!rateCheck.allowed) {
      throw new Error(
        "Rate limit exceeded: too many messages sent. Please wait a moment."
      );
    }
    await ctx.runMutation(api.rateLimit.record, {
      key: `send:${args.userId}`,
    });

    console.log(
      `Discord sendMessage: sending for user=${args.userId} client=${args.clientId}`
    );

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) throw new Error("DISCORD_BOT_TOKEN not configured");

    // Get recipient identity (contains Discord user ID + cached DM channel)
    const identity: Record<string, any> | null = await ctx.runQuery(
      api.identities.get,
      { id: args.platformIdentityId }
    );

    if (!identity?.platformUserId) throw new Error("Discord user ID not found");

    const headers = {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    };

    // Ensure DM channel is open
    let channelId = identity.dmChannelId;
    if (!channelId) {
      const dmResponse = await fetch(`${DISCORD_API}/users/@me/channels`, {
        method: "POST",
        headers,
        body: JSON.stringify({ recipient_id: identity.platformUserId }),
      });

      if (!dmResponse.ok)
        throw new Error(`Failed to open DM channel: ${dmResponse.status}`);

      const dmChannel = await dmResponse.json();
      channelId = dmChannel.id;

      // Cache for future sends
      await ctx.runMutation(api.identities.updateDmChannelId, {
        identityId: args.platformIdentityId,
        dmChannelId: channelId,
      });
    }

    // Optionally reference the original message
    let messageReference;
    if (args.inReplyToMessageId) {
      const original: Record<string, any> | null = await ctx.runQuery(
        api.messages.get,
        { id: args.inReplyToMessageId }
      );
      if (original?.platformMessageId) {
        messageReference = {
          message_id: original.platformMessageId,
          channel_id: channelId,
        };
      }
    }

    // Send message via Discord API
    const sendBody: Record<string, any> = { content: args.text };
    if (messageReference) sendBody.message_reference = messageReference;

    const result = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(sendBody),
      }
    );

    if (!result.ok) {
      const errorBody = await result.text();
      throw new Error(`Discord send failed: ${result.status} — ${errorBody}`);
    }

    const sent = await result.json();
    const platformMessageId = sent.id || `sent-${Date.now()}`;

    // Resolve conversation for the outbound message
    const conversationId = await ctx.runMutation(
      api.conversations.resolveForMessage,
      {
        userId: args.userId,
        clientId: args.clientId,
        platform: "discord",
        threadId: channelId,
        timestamp: Date.now(),
      }
    );

    // Store outbound message
    const messageId = await ctx.runMutation(api.messages.create, {
      userId: args.userId,
      clientId: args.clientId,
      platformIdentityId: args.platformIdentityId,
      platform: "discord",
      platformMessageId,
      conversationId,
      threadId: channelId,
      text: args.text,
      timestamp: Date.now(),
      direction: "outbound",
      isRead: true,
      aiProcessed: false,
    });

    console.log(
      `Discord sendMessage: sent successfully, messageId=${platformMessageId}`
    );
    return { success: true, messageId };
  },
});
