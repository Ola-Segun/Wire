"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { google } from "googleapis";

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

// Build RFC 2822 email message
function buildRawEmail(args: {
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
  threadId?: string;
}): string {
  const lines: string[] = [];
  lines.push(`To: ${args.to}`);
  lines.push(`From: ${args.from}`);
  lines.push(`Subject: ${args.subject}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");

  if (args.inReplyToMessageId) {
    lines.push(`In-Reply-To: ${args.inReplyToMessageId}`);
    lines.push(`References: ${args.inReplyToMessageId}`);
  }

  lines.push("");
  lines.push(args.body);

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Send a Gmail message
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

    console.log(`Gmail sendMessage: sending for user=${args.userId} client=${args.clientId}`);

    // Get OAuth tokens
    const tokens: Record<string, any> | null = await ctx.runQuery(
      api.oauth.getTokens,
      { userId: args.userId, platform: "gmail" }
    );

    if (!tokens) {
      console.error(`Gmail sendMessage: no tokens for user=${args.userId}`);
      throw new Error("Gmail not connected");
    }

    // Get recipient identity
    const identity: Record<string, any> | null = await ctx.runQuery(
      api.identities.get,
      { id: args.platformIdentityId }
    );

    if (!identity?.email) throw new Error("Recipient email not found");

    // Get original message for thread context
    let originalMessage: Record<string, any> | null = null;
    if (args.inReplyToMessageId) {
      originalMessage = await ctx.runQuery(api.messages.get, {
        id: args.inReplyToMessageId,
      });
    }

    // Build OAuth2 client
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Get sender's email
    const profile = await gmail.users.getProfile({ userId: "me" });
    const senderEmail = profile.data.emailAddress || "";

    // Determine subject
    let subject = "Re: Message";
    if (originalMessage?.text) {
      const firstLine = originalMessage.text.split("\n")[0];
      subject = firstLine.startsWith("Re:") ? firstLine : `Re: ${firstLine}`;
    }

    // Build and send email
    const raw = buildRawEmail({
      to: identity.email,
      from: senderEmail,
      subject,
      body: args.text,
      inReplyToMessageId: originalMessage?.platformMessageId,
      threadId: originalMessage?.threadId,
    });

    const sendResult = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId: originalMessage?.threadId ?? undefined,
      },
    });

    const platformMessageId = sendResult.data.id || `sent-${Date.now()}`;

    // Store outbound message
    const messageId = await ctx.runMutation(api.messages.create, {
      userId: args.userId,
      clientId: args.clientId,
      platformIdentityId: args.platformIdentityId,
      platform: "gmail",
      platformMessageId,
      threadId: sendResult.data.threadId ?? originalMessage?.threadId ?? undefined,
      text: args.text,
      timestamp: Date.now(),
      direction: "outbound",
      isRead: true,
      aiProcessed: false,
    });

    console.log(`Gmail sendMessage: sent successfully, platformMessageId=${platformMessageId}`);
    return { success: true, messageId };
  },
});
