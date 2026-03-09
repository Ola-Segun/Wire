"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// Discord Sync Adapter — Discord.js Bot API
// ============================================
//
// ENV VARS REQUIRED:
//   DISCORD_BOT_TOKEN     - Discord bot token
//   DISCORD_CLIENT_ID     - Discord application client ID
//   DISCORD_CLIENT_SECRET - Discord application client secret
//
// Discord DM syncing works by:
// 1. User connects their Discord account via OAuth2
// 2. Bot joins any servers where the user + their clients interact
// 3. We fetch DM channel history for tracked contacts
//
// TODO [SETUP]: Create Discord application at https://discord.com/developers
// Bot needs: MESSAGE_CONTENT intent, DM permissions

function getDiscordHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "Discord bot token not configured. Set DISCORD_BOT_TOKEN."
    );
  }
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };
}

const DISCORD_API = "https://discord.com/api/v10";

// Sync Discord DM messages for a specific identity/client
export const syncMessages = action({
  args: {
    userId: v.id("users"),
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args) => {
    console.log(
      `Discord syncMessages: starting for user=${args.userId} identity=${args.identityId}`
    );

    const identity = await ctx.runQuery(api.identities.get, {
      id: args.identityId,
    });

    if (!identity || !identity.clientId) {
      console.error(
        `Discord syncMessages: identity not found or not linked for ${args.identityId}`
      );
      return { synced: 0 };
    }

    if (!identity.dmChannelId) {
      // Need to open a DM channel first
      console.log(
        `Discord syncMessages: no DM channel cached, opening one for ${identity.platformUserId}`
      );

      try {
        const headers = getDiscordHeaders();
        const dmResponse = await fetch(`${DISCORD_API}/users/@me/channels`, {
          method: "POST",
          headers,
          body: JSON.stringify({ recipient_id: identity.platformUserId }),
        });

        if (!dmResponse.ok) {
          console.error(
            `Discord syncMessages: failed to open DM channel: ${dmResponse.status}`
          );
          return { synced: 0 };
        }

        const dmChannel = await dmResponse.json();

        // Cache the DM channel ID
        await ctx.runMutation(api.identities.updateDmChannelId, {
          identityId: args.identityId,
          dmChannelId: dmChannel.id,
        });

        identity.dmChannelId = dmChannel.id;
      } catch (err) {
        console.error("Discord syncMessages: failed to open DM channel:", err);
        return { synced: 0 };
      }
    }

    // Fetch message history from the DM channel
    let synced = 0;

    try {
      const headers = getDiscordHeaders();
      const messagesResponse = await fetch(
        `${DISCORD_API}/channels/${identity.dmChannelId}/messages?limit=100`,
        { headers }
      );

      if (!messagesResponse.ok) {
        console.error(
          `Discord syncMessages: failed to fetch messages: ${messagesResponse.status}`
        );
        return { synced: 0 };
      }

      const messages = await messagesResponse.json();

      // Get OAuth connection to identify the Wire user's Discord ID
      const oauthTokens = await ctx.runQuery(api.oauth.getTokens, {
        userId: args.userId,
        platform: "discord",
      });

      const wireUserDiscordId = oauthTokens?.platformUserId;

      for (const msg of messages) {
        if (!msg.content || msg.author.bot) continue;

        const timestamp = new Date(msg.timestamp).getTime();
        const direction =
          msg.author.id === wireUserDiscordId ? "outbound" : "inbound";

        // Resolve conversation thread
        const conversationId = await ctx.runMutation(
          api.conversations.resolveForMessage,
          {
            userId: args.userId,
            clientId: identity.clientId,
            platform: "discord",
            threadId: identity.dmChannelId!, // Use channel ID as thread ref
            timestamp,
          }
        );

        // Extract attachments
        const attachments = (msg.attachments || []).map(
          (att: { content_type?: string; url: string; filename: string }) => ({
            type: att.content_type || "unknown",
            url: att.url,
            filename: att.filename,
          })
        );

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: identity.clientId,
          platformIdentityId: args.identityId,
          platform: "discord",
          platformMessageId: msg.id,
          conversationId,
          threadId: identity.dmChannelId!,
          text: msg.content,
          timestamp,
          direction,
          isRead: direction === "outbound",
          aiProcessed: false,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        synced++;
      }
    } catch (err) {
      console.error(
        `Discord syncMessages: error fetching messages for ${args.identityId}:`,
        err
      );
    }

    console.log(
      `Discord syncMessages: synced ${synced} messages for identity=${args.identityId}`
    );
    return { synced };
  },
});
