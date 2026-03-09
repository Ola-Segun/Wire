"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { google } from "googleapis";

// Sync Gmail messages for a specific identity/client
export const syncMessages = action({
  args: {
    userId: v.id("users"),
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args) => {
    console.log(`Gmail syncMessages: starting for user=${args.userId} identity=${args.identityId}`);

    const identity = await ctx.runQuery(api.identities.get, {
      id: args.identityId,
    });

    if (!identity || !identity.clientId) {
      console.error(`Gmail syncMessages: identity=${args.identityId} not linked to client`);
      throw new Error("Identity not linked to client");
    }

    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "gmail",
    });

    if (!tokens) {
      console.error(`Gmail syncMessages: no tokens found for user=${args.userId}`);
      throw new Error("Gmail not connected");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Validate token by making a lightweight API call
    try {
      await gmail.users.getProfile({ userId: "me" });
    } catch (err) {
      console.error(`Gmail syncMessages: token validation failed for user=${args.userId}:`, err);
      return { synced: 0 };
    }

    // Fetch messages from/to this contact
    const response = await gmail.users.messages.list({
      userId: "me",
      q: `from:${identity.email} OR to:${identity.email}`,
      maxResults: 100,
    });

    const messageIds = response.data.messages || [];
    let synced = 0;

    for (const msg of messageIds) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        const headers = full.data.payload?.headers || [];
        const subject =
          headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
        const from =
          headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";

        const body = extractMessageBody(full.data.payload);
        const attachments = extractAttachments(full.data.payload, msg.id!);
        const direction = from
          .toLowerCase()
          .includes(identity.email?.toLowerCase() || "")
          ? "inbound"
          : "outbound";

        // Resolve conversation thread (cross-platform grouping)
        const conversationId = await ctx.runMutation(api.conversations.resolveForMessage, {
          userId: args.userId,
          clientId: identity.clientId!,
          platform: "gmail",
          threadId: full.data.threadId ?? undefined,
          subject: subject || undefined,
          timestamp: parseInt(full.data.internalDate || "0"),
        });

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: identity.clientId!,
          platformIdentityId: args.identityId,
          platform: "gmail",
          platformMessageId: msg.id!,
          conversationId,
          threadId: full.data.threadId ?? undefined,
          text: subject ? `${subject}\n\n${body}` : body,
          timestamp: parseInt(full.data.internalDate || "0"),
          direction,
          isRead: !full.data.labelIds?.includes("UNREAD"),
          aiProcessed: false,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        synced++;
      } catch (err) {
        console.error(
          `Gmail syncMessages: failed to process message id=${msg.id} for identity=${args.identityId}:`,
          err
        );
        continue;
      }
    }

    console.log(`Gmail syncMessages: completed for identity=${args.identityId}, synced=${synced}`);
    return { synced };
  },
});

// Register Gmail push notifications via Watch API
// Requires GOOGLE_CLOUD_PROJECT_ID and GMAIL_PUBSUB_TOPIC env vars
// The Pub/Sub topic must grant publish rights to gmail-api-push@system.gserviceaccount.com
export const registerWatch = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ historyId: string; expiration: string }> => {
    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "gmail",
    });
    if (!tokens) throw new Error("Gmail not connected");

    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) throw new Error("GMAIL_PUBSUB_TOPIC not configured");

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const watchResponse = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
      },
    });

    // Store the historyId for incremental sync
    await ctx.runMutation(api.oauth.updateHistoryId, {
      userId: args.userId,
      platform: "gmail",
      historyId: watchResponse.data.historyId!.toString(),
    });

    return {
      historyId: watchResponse.data.historyId!.toString(),
      expiration: watchResponse.data.expiration!.toString(),
    };
  },
});

// Incremental sync using Gmail History API (triggered by push notification)
export const syncFromHistory = action({
  args: {
    userId: v.id("users"),
    historyId: v.string(),
  },
  handler: async (ctx, args): Promise<{ synced: number }> => {
    console.log(`Gmail syncFromHistory: starting for user=${args.userId}, historyId=${args.historyId}`);

    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "gmail",
    });
    if (!tokens) {
      console.error(`Gmail syncFromHistory: no tokens for user=${args.userId}`);
      throw new Error("Gmail not connected");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Fetch history since last known historyId
    let historyResponse;
    try {
      historyResponse = await gmail.users.history.list({
        userId: "me",
        startHistoryId: args.historyId,
        historyTypes: ["messageAdded"],
      });
    } catch (err: any) {
      // If historyId is too old, fall back to full sync for all identities
      if (err?.code === 404) {
        console.log("History expired, skipping incremental sync");
        return { synced: 0 };
      }
      throw err;
    }

    const histories = historyResponse.data.history || [];
    const newMessageIds = new Set<string>();
    for (const history of histories) {
      for (const added of history.messagesAdded || []) {
        if (added.message?.id) {
          newMessageIds.add(added.message.id);
        }
      }
    }

    if (newMessageIds.size === 0) return { synced: 0 };

    // Get all linked identities for this user on Gmail
    const identities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId: args.userId, platform: "gmail" }
    );
    const linkedIdentities = identities.filter(
      (id) => id.clientId && id.isSelected
    );

    // Build email→identity lookup
    const emailToIdentity = new Map<string, Record<string, any>>();
    for (const id of linkedIdentities) {
      if (id.email) emailToIdentity.set(id.email.toLowerCase(), id);
    }

    let synced = 0;

    for (const msgId of newMessageIds) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msgId,
          format: "full",
        });

        const headers = full.data.payload?.headers || [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
        const to = headers.find((h) => h.name?.toLowerCase() === "to")?.value || "";
        const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";

        // Find which linked identity this message belongs to
        const allAddresses = `${from} ${to}`.toLowerCase();
        let matchedIdentity: Record<string, any> | undefined;
        for (const [email, identity] of emailToIdentity) {
          if (allAddresses.includes(email)) {
            matchedIdentity = identity;
            break;
          }
        }

        if (!matchedIdentity) continue; // Message not for a tracked contact

        const body = extractMessageBody(full.data.payload);
        const attachments = extractAttachments(full.data.payload, msgId);
        const direction = from.toLowerCase().includes(matchedIdentity.email?.toLowerCase() || "")
          ? "inbound"
          : "outbound";

        // Resolve conversation thread (cross-platform grouping)
        const conversationId = await ctx.runMutation(api.conversations.resolveForMessage, {
          userId: args.userId,
          clientId: matchedIdentity.clientId!,
          platform: "gmail",
          threadId: full.data.threadId ?? undefined,
          subject: subject || undefined,
          timestamp: parseInt(full.data.internalDate || "0"),
        });

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: matchedIdentity.clientId!,
          platformIdentityId: matchedIdentity._id,
          platform: "gmail",
          platformMessageId: msgId,
          conversationId,
          threadId: full.data.threadId ?? undefined,
          text: subject ? `${subject}\n\n${body}` : body,
          timestamp: parseInt(full.data.internalDate || "0"),
          direction,
          isRead: !full.data.labelIds?.includes("UNREAD"),
          aiProcessed: false,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        synced++;
      } catch (err) {
        console.error(
          `Gmail syncFromHistory: failed to process message id=${msgId} for user=${args.userId}:`,
          err
        );
        continue;
      }
    }

    // Update stored historyId
    if (historyResponse.data.historyId) {
      await ctx.runMutation(api.oauth.updateHistoryId, {
        userId: args.userId,
        platform: "gmail",
        historyId: historyResponse.data.historyId.toString(),
      });
    }

    return { synced };
  },
});

function extractAttachments(
  payload: any,
  messageId: string
): Array<{ type: string; url: string; filename?: string }> {
  const attachments: Array<{ type: string; url: string; filename?: string }> = [];
  if (!payload) return attachments;

  function walk(parts: any[]) {
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          type: part.mimeType ?? "application/octet-stream",
          // Gmail attachment reference URL (can be fetched via API later)
          url: `gmail://attachment/${messageId}/${part.body.attachmentId}`,
          filename: part.filename,
        });
      }
      if (part.parts) {
        walk(part.parts);
      }
    }
  }

  if (payload.parts) {
    walk(payload.parts);
  }

  return attachments;
}

function extractMessageBody(payload: any): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64").toString("utf-8");
        // Strip HTML tags for plain text
        return html.replace(/<[^>]+>/g, "").trim();
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      if (part.parts) {
        const result = extractMessageBody(part);
        if (result) return result;
      }
    }
  }

  return "";
}

// Renew Gmail watches for all users (runs daily via cron)
// Gmail watches expire after ~7 days, so we need to renew them periodically
export const renewWatches = action({
  args: {},
  handler: async (ctx): Promise<{ renewed: number; failed: number }> => {
    console.log("Gmail renewWatches: starting daily renewal");

    // Actions cannot use ctx.db — fetch tokens via a query
    const gmailTokens: Array<Record<string, any>> = await ctx.runQuery(
      api.oauth.getAllGmailTokens,
      {}
    );
    console.log(`Gmail renewWatches: found ${gmailTokens.length} Gmail connections`);

    let renewed = 0;
    let failed = 0;

    for (const token of gmailTokens) {
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({
          access_token: token.accessToken,
          refresh_token: token.refreshToken,
        });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        const topicName = process.env.GMAIL_PUBSUB_TOPIC;
        if (!topicName) {
          console.warn(`Gmail renewWatches: GMAIL_PUBSUB_TOPIC not configured, skipping user=${token.userId}`);
          continue;
        }

        const watchResponse = await gmail.users.watch({
          userId: "me",
          requestBody: {
            topicName,
            labelIds: ["INBOX"],
          },
        });

        // Update stored historyId — actions cannot use ctx.db directly
        if (watchResponse.data.historyId) {
          await ctx.runMutation(api.oauth.updateHistoryId, {
            userId: token.userId,
            platform: "gmail",
            historyId: watchResponse.data.historyId.toString(),
          });
        }

        renewed++;
        console.log(`Gmail renewWatches: renewed for user=${token.userId}, new historyId=${watchResponse.data.historyId}`);
      } catch (err) {
        failed++;
        console.error(`Gmail renewWatches: failed for user=${token.userId}:`, err);
      }
    }

    console.log(`Gmail renewWatches: completed, renewed=${renewed}, failed=${failed}`);
    return { renewed, failed };
  },
});
