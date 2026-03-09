"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// Discord Onboarding — Discover Server Members
// ============================================
//
// Discovers Discord users from mutual guilds that are not yet tracked
// in platform_identities. Follows the same transient pattern as
// slack.discoverNewUsers — no DB writes until the user confirms.

const DISCORD_API = "https://discord.com/api/v10";

// Discover new Discord users from shared guilds not yet tracked.
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
      avatar?: string;
    }>;
  }> => {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) throw new Error("DISCORD_BOT_TOKEN not configured");

    const tokens: Record<string, any> | null = await ctx.runQuery(
      api.oauth.getTokens,
      { userId: args.userId, platform: "discord" }
    );
    if (!tokens) throw new Error("Discord not connected");

    const headers = {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    };

    // Get user's OAuth token to discover their guilds
    const userHeaders = {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
    };

    // 1. Get guilds the user belongs to (via user OAuth token)
    const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: userHeaders,
    });

    if (!guildsRes.ok) {
      console.error(
        `Discord discover: failed to fetch guilds: ${guildsRes.status}`
      );
      throw new Error("Failed to fetch Discord guilds");
    }

    const guilds: Array<{ id: string; name: string }> = await guildsRes.json();

    // 2. For each guild, fetch members using the bot token
    //    (Bot must be in the same guild — only overlapping guilds will return members)
    const allMembers: Map<
      string,
      { platformUserId: string; displayName: string; username?: string; avatar?: string }
    > = new Map();

    for (const guild of guilds.slice(0, 5)) {
      // Cap at 5 guilds to avoid rate limits
      try {
        const membersRes = await fetch(
          `${DISCORD_API}/guilds/${guild.id}/members?limit=100`,
          { headers }
        );

        if (!membersRes.ok) {
          // Bot might not be in this guild — skip silently
          continue;
        }

        const members: Array<{
          user?: {
            id: string;
            username: string;
            global_name?: string;
            avatar?: string;
            bot?: boolean;
          };
          nick?: string;
        }> = await membersRes.json();

        for (const member of members) {
          if (!member.user || member.user.bot) continue;

          const uid = member.user.id;
          if (!allMembers.has(uid)) {
            const avatarUrl = member.user.avatar
              ? `https://cdn.discordapp.com/avatars/${uid}/${member.user.avatar}.png?size=128`
              : undefined;

            allMembers.set(uid, {
              platformUserId: uid,
              displayName:
                member.nick ||
                member.user.global_name ||
                member.user.username ||
                "Unknown",
              username: member.user.username,
              avatar: avatarUrl,
            });
          }
        }
      } catch (err) {
        console.error(
          `Discord discover: error fetching members for guild ${guild.id}:`,
          err
        );
      }
    }

    // 3. Filter against existing platform_identities — return only new users
    const existingIdentities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId: args.userId, platform: "discord" }
    );
    const knownIds = new Set(existingIdentities.map((i) => i.platformUserId));

    // Exclude the authenticated user's own Discord account
    if (tokens.platformUserId) {
      knownIds.add(tokens.platformUserId);
    }

    const newUsers = Array.from(allMembers.values()).filter(
      (u) => !knownIds.has(u.platformUserId)
    );

    console.log(
      `Discord discover: found ${allMembers.size} total members, ${newUsers.length} new`
    );

    // No DB writes — identities are persisted only when user confirms selection
    return { count: newUsers.length, users: newUsers };
  },
});
