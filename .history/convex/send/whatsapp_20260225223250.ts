"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// WhatsApp Send Adapter — Twilio REST API (no SDK dependency)
// ============================================

const TWILIO_API = "https://api.twilio.com/2010-04-01";

// Send a WhatsApp message via Twilio REST API
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
      `WhatsApp sendMessage: sending for user=${args.userId} client=${args.clientId}`
    );

    // Get recipient identity (contains phone number)
    const identity: Record<string, any> | null = await ctx.runQuery(
      api.identities.get,
      { id: args.platformIdentityId }
    );

    if (!identity?.phoneNumber) throw new Error("WhatsApp phone number not found");

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken)
      throw new Error("Twilio credentials not configured");
    if (!twilioFrom) throw new Error("TWILIO_WHATSAPP_FROM not configured");

    const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

    // Send via Twilio REST API
    const response = await fetch(
      `${TWILIO_API}/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: twilioFrom,
          To: `whatsapp:${identity.phoneNumber}`,
          Body: args.text,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Twilio send failed: ${response.status} — ${errorBody}`
      );
    }

    const result = await response.json();
    const platformMessageId = result.sid || `sent-${Date.now()}`;

    // Resolve conversation for the outbound message
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

    // Store outbound message
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
      `WhatsApp sendMessage: sent successfully, sid=${platformMessageId}`
    );
    return { success: true, messageId };
  },
});
