"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// Discord Sync Adapter — Server Channel Messages
// ============================================
//
// Strategy:
// 1. Find all guilds (servers) the bot is in
// 2. For each guild, get text channels the bot can read
// 3. Fetch recent messages from those channels
// 4. Filter for messages authored by tracked contacts
// 5. Store matching messages in Convex
//
// This captures server channel messages (not just bot DMs),
// which is where most Discord communication happens.
//
// ENV VARS REQUIRED:
//   DISCORD_BOT_TOKEN     - Discord bot token
//
// BOT INTENTS REQUIRED:
//   SERVER MEMBERS INTENT  - to identify members
//   MESSAGE CONTENT INTENT - to read message text

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

// Helper: fetch with rate-limit retry
async function discordFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const response = await fetch(url, { headers });
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 2000;
    console.warn(`Discord rate limited, waiting ${waitMs}ms...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetch(url, { headers });
  }
  return response;
}

// Sync Discord messages for a specific identity/client
// Scans server channels for messages from the tracked contact
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

    const contactDiscordId = identity.platformUserId;
    console.log(
      `Discord syncMessages: looking for messages from contactDiscordId=${contactDiscordId} (${identity.displayName})`
    );

    // Get the Wire user's Discord ID to determine message direction
    const oauthTokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "discord",
    });
    const wireUserDiscordId = oauthTokens?.platformUserId;

    const headers = getDiscordHeaders();
    let synced = 0;

    // Determine sync cursor: fetch only messages newer than the last known one.
    // Discord accepts `after=<snowflake_id>` to return messages after that ID.
    const latestMsg = await ctx.runQuery(api.messages.getLatestForIdentity, {
      identityId: args.identityId,
      platform: "discord",
    });
    const afterSnowflake = latestMsg?.platformMessageId ?? undefined;

    if (afterSnowflake) {
      console.log(
        `Discord syncMessages: incremental sync after messageId=${afterSnowflake} for identity=${args.identityId}`
      );
    }

    try {
      // 1. Get all guilds the bot is in
      const guildsRes = await discordFetch(`${DISCORD_API}/users/@me/guilds`, headers);
      if (!guildsRes.ok) {
        console.error(`Discord syncMessages: failed to fetch guilds: ${guildsRes.status}`);
        return { synced: 0 };
      }
      const guilds = await guildsRes.json();
      console.log(`Discord syncMessages: bot is in ${guilds.length} guild(s)`);

      for (const guild of guilds) {
        // 2. Get text channels in this guild
        const channelsRes = await discordFetch(
          `${DISCORD_API}/guilds/${guild.id}/channels`,
          headers
        );
        if (!channelsRes.ok) {
          console.warn(`Discord syncMessages: can't read channels in guild=${guild.name}: ${channelsRes.status}`);
          continue;
        }
        const channels = await channelsRes.json();

        // Filter to text channels only (type 0 = GUILD_TEXT)
        const textChannels = channels.filter(
          (ch: any) => ch.type === 0
        );
        console.log(
          `Discord syncMessages: guild="${guild.name}" has ${textChannels.length} text channels`
        );

        for (const channel of textChannels) {
          // 3. Fetch messages from this channel — use after= cursor when available
          // to only pull messages newer than the last synced one, reducing API calls.
          const afterParam = afterSnowflake ? `&after=${afterSnowflake}` : "";
          const msgsRes = await discordFetch(
            `${DISCORD_API}/channels/${channel.id}/messages?limit=50${afterParam}`,
            headers
          );
          if (!msgsRes.ok) {
            // Bot may not have permissions in this channel — skip silently
            continue;
          }
          const messages = await msgsRes.json();

          // 4. Filter for messages from the tracked contact OR the Wire user
          const relevantMessages = messages.filter(
            (m: any) =>
              !m.author?.bot &&
              (m.content || (m.attachments && m.attachments.length > 0)) &&
              (m.author.id === contactDiscordId || m.author.id === wireUserDiscordId)
          );

          if (relevantMessages.length > 0) {
            console.log(
              `Discord syncMessages: found ${relevantMessages.length} relevant messages in #${channel.name} (guild="${guild.name}")`
            );
          }

          for (const msg of relevantMessages) {
            const timestamp = new Date(msg.timestamp).getTime();
            const direction =
              msg.author.id === wireUserDiscordId ? "outbound" : "inbound";

            // Use guild_id:channel_id as the thread reference
            const threadRef = `${guild.id}:${channel.id}`;

            // Resolve conversation thread
            const conversationId = await ctx.runMutation(
              api.conversations.resolveForMessage,
              {
                userId: args.userId,
                clientId: identity.clientId,
                platform: "discord",
                threadId: threadRef,
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
              threadId: threadRef,
              text: msg.content || "",
              timestamp,
              direction,
              isRead: direction === "outbound",
              aiProcessed: false,
              attachments: attachments.length > 0 ? attachments : undefined,
            });

            synced++;
          }
        }
      }

      // 5. Also check DM channel (if user DMs the contact directly)
      if (identity.dmChannelId) {
        console.log(`Discord syncMessages: also checking DM channel=${identity.dmChannelId}`);
        const afterParam = afterSnowflake ? `&after=${afterSnowflake}` : "";
        const dmRes = await discordFetch(
          `${DISCORD_API}/channels/${identity.dmChannelId}/messages?limit=50${afterParam}`,
          headers
        );
        if (dmRes.ok) {
          const dmMessages = await dmRes.json();
          const relevantDMs = dmMessages.filter(
            (m: any) => !m.author?.bot && (m.content || (m.attachments && m.attachments.length > 0))
          );

          if (relevantDMs.length > 0) {
            console.log(`Discord syncMessages: found ${relevantDMs.length} DM messages`);
          }

          for (const msg of relevantDMs) {
            const timestamp = new Date(msg.timestamp).getTime();
            const direction =
              msg.author.id === wireUserDiscordId ? "outbound" : "inbound";

            const conversationId = await ctx.runMutation(
              api.conversations.resolveForMessage,
              {
                userId: args.userId,
                clientId: identity.clientId,
                platform: "discord",
                threadId: identity.dmChannelId!,
                timestamp,
              }
            );

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
              text: msg.content || "",
              timestamp,
              direction,
              isRead: direction === "outbound",
              aiProcessed: false,
              attachments: attachments.length > 0 ? attachments : undefined,
            });

            synced++;
          }
        }
      }
    } catch (err) {
      console.error(
        `Discord syncMessages: error for ${args.identityId}:`,
        err
      );
    }

    console.log(
      `Discord syncMessages: synced ${synced} messages for identity=${args.identityId}`
    );
    return { synced };
  },
});
