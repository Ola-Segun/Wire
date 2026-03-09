"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// WhatsApp Send Adapter — Meta WhatsApp Business Cloud API
// ============================================
//
// Sends messages via the Meta Graph API using the Wire user's stored
// WABA token and Phone Number ID (from oauth_tokens).
//
// API endpoint:
//   POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
//   Authorization: Bearer {access_token}
//
// CREDENTIALS (per-user, stored in oauth_tokens at connection time):
//   accessToken    = Meta System User Token (long-lived)
//   platformUserId = WhatsApp Phone Number ID (15-digit string)

const META_GRAPH_API = "https://graph.facebook.com/v21.0";

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
    // ── Rate limiting ──────────────────────────────────────────────────────
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
    await ctx.runMutation(api.rateLimit.record, { key: `send:${args.userId}` });

    // ── Resolve recipient phone number ─────────────────────────────────────
    const identity: Record<string, any> | null = await ctx.runQuery(
      api.identities.get,
      { id: args.platformIdentityId }
    );
    if (!identity?.phoneNumber) {
      throw new Error(
        "WhatsApp phone number not found for this contact. " +
          "Ensure the identity has a phone number set."
      );
    }

    // ── Load WABA credentials ──────────────────────────────────────────────
    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "whatsapp",
    });
    if (!tokens?.accessToken || !tokens?.platformUserId) {
      throw new Error(
        "WhatsApp Business account not connected. " +
          "Please reconnect in Settings → Connected Platforms."
      );
    }

    const phoneNumberId = tokens.platformUserId;
    const accessToken = tokens.accessToken;

    // Meta expects E.164 WITHOUT the leading +, e.g. "15551234567"
    const recipientPhone = identity.phoneNumber.replace(/^\+/, "");

    // ── Send via Meta Graph API ────────────────────────────────────────────
    const response = await fetch(
      `${META_GRAPH_API}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientPhone,
          type: "text",
          text: { body: args.text, preview_url: false },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      // Surface the Meta error code if available for easier debugging
      let detail = errorBody;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed?.error?.message) {
          detail = `${parsed.error.message} (code ${parsed.error.code})`;
        }
      } catch {
        // raw text is fine
      }
      throw new Error(
        `WhatsApp send failed: HTTP ${response.status} — ${detail}`
      );
    }

    const result = await response.json();
    // Meta response: { messages: [{ id: "wamid.HBgL..." }] }
    const platformMessageId =
      result.messages?.[0]?.id ?? `wa-sent-${Date.now()}`;

    // ── Resolve/create conversation thread ────────────────────────────────
    const conversationId = await ctx.runMutation(
      api.conversations.resolveForMessage,
      {
        userId: args.userId,
        clientId: args.clientId,
        platform: "whatsapp",
        threadId: platformMessageId,
        timestamp: Date.now(),
      }
    );

    // ── Persist outbound message ───────────────────────────────────────────
    const messageId = await ctx.runMutation(api.messages.create, {
      userId: args.userId,
      clientId: args.clientId,
      platformIdentityId: args.platformIdentityId,
      platform: "whatsapp",
      platformMessageId,
      conversationId,
      text: args.text,
      timestamp: Date.now(),
      direction: "outbound",
      isRead: true,
      aiProcessed: false,
    });

    console.log(
      `WhatsApp send: OK — wamid=${platformMessageId} ` +
        `user=${args.userId} client=${args.clientId}`
    );
    return { success: true, messageId };
  },
});
