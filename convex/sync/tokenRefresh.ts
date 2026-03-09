"use node";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { google } from "googleapis";

// Refresh expired Gmail tokens proactively
// Called by cron every 45 minutes so tokens never expire mid-sync
export const refreshGmailTokens = action({
  args: {},
  handler: async (ctx): Promise<{ refreshed: number; errors: number }> => {
    const connections: Array<{ userId: any; platform: string }> =
      await ctx.runQuery(api.oauth.listAllConnections, {});

    const gmailConnections = connections.filter((c) => c.platform === "gmail");
    let refreshed = 0;
    let errors = 0;

    for (const conn of gmailConnections) {
      try {
        const tokens: Record<string, any> | null = await ctx.runQuery(
          api.oauth.getTokens,
          { userId: conn.userId, platform: "gmail" }
        );

        if (!tokens || !tokens.refreshToken) continue;

        // Skip if token expires more than 10 minutes from now
        if (tokens.expiresAt && tokens.expiresAt > Date.now() + 10 * 60 * 1000) {
          continue;
        }

        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({
          refresh_token: tokens.refreshToken,
        });

        const { credentials } = await oauth2Client.refreshAccessToken();

        await ctx.runMutation(api.oauth.storeTokens, {
          userId: conn.userId,
          platform: "gmail",
          accessToken: credentials.access_token!,
          refreshToken: credentials.refresh_token ?? tokens.refreshToken,
          expiresAt: credentials.expiry_date ?? undefined,
          scope: credentials.scope ?? undefined,
        });

        refreshed++;
      } catch (err) {
        console.error(`Token refresh failed for user=${conn.userId}:`, err);
        errors++;
      }
    }

    return { refreshed, errors };
  },
});

// Validate Slack tokens periodically
// Slack bot tokens don't expire but user tokens can be revoked
export const validateSlackTokens = action({
  args: {},
  handler: async (ctx): Promise<{ valid: number; invalid: number }> => {
    const { WebClient } = await import("@slack/web-api");

    const connections: Array<{ userId: any; platform: string }> =
      await ctx.runQuery(api.oauth.listAllConnections, {});

    const slackConnections = connections.filter((c) => c.platform === "slack");
    let valid = 0;
    let invalid = 0;

    for (const conn of slackConnections) {
      try {
        const tokens: Record<string, any> | null = await ctx.runQuery(
          api.oauth.getTokens,
          { userId: conn.userId, platform: "slack" }
        );

        if (!tokens) {
          console.error(`Slack token missing for user=${conn.userId}`);
          invalid++;
          continue;
        }

        const client = new WebClient(tokens.accessToken);
        const authResult = await client.auth.test();

        if (authResult.ok) {
          valid++;
        } else {
          console.error(`Slack token invalid for user=${conn.userId}`);
          invalid++;
        }
      } catch (err) {
        console.error(`Slack token validation failed for user=${conn.userId}:`, err);
        invalid++;
      }
    }

    return { valid, invalid };
  },
});
