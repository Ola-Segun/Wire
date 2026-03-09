"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// WhatsApp Sync Adapter — Twilio WhatsApp Business API
// ============================================
//
// ENV VARS REQUIRED:
//   TWILIO_ACCOUNT_SID    - Twilio account SID
//   TWILIO_AUTH_TOKEN      - Twilio auth token
//   TWILIO_WHATSAPP_FROM   - Your Twilio WhatsApp number (e.g. "whatsapp:+14155238886")
//
// TODO [SETUP]: Configure Twilio WhatsApp sandbox or production number.
// The Twilio Messages API allows fetching message history for a given number.
// Unlike Gmail/Slack, WhatsApp doesn't have a push-notification model built into
// Twilio — instead it uses webhooks for incoming messages. This sync adapter
// handles historical message fetch for initial import.

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
    );
  }

  // Dynamic import to avoid bundling issues when Twilio isn't installed yet
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const twilio = require("twilio");
  return twilio(accountSid, authToken);
}

// Sync WhatsApp message history for a specific identity/client
export const syncMessages = action({
  args: {
    userId: v.id("users"),
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args) => {
    console.log(
      `WhatsApp syncMessages: starting for user=${args.userId} identity=${args.identityId}`
    );

    // Get the platform identity to find the client's WhatsApp number
    const identity = await ctx.runQuery(api.identities.get, {
      id: args.identityId,
    });

    if (!identity || !identity.clientId) {
      console.error(
        `WhatsApp syncMessages: identity not found or not linked for ${args.identityId}`
      );
      return { synced: 0 };
    }

    if (!identity.phoneNumber) {
      console.error(
        `WhatsApp syncMessages: no phone number for identity ${args.identityId}`
      );
      return { synced: 0 };
    }

    const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!twilioFrom) {
      console.error("WhatsApp syncMessages: TWILIO_WHATSAPP_FROM not configured");
      return { synced: 0 };
    }

    let client;
    try {
      client = getTwilioClient();
    } catch (err) {
      console.error("WhatsApp syncMessages: Twilio client initialization failed:", err);
      return { synced: 0 };
    }

    // Fetch recent messages to/from this WhatsApp number
    // Twilio stores messages with "whatsapp:" prefix
    const contactWhatsApp = `whatsapp:${identity.phoneNumber}`;
    let synced = 0;

    try {
      // Fetch inbound messages (from contact to our number)
      const inboundMessages = await client.messages.list({
        from: contactWhatsApp,
        to: twilioFrom,
        limit: 100,
      });

      for (const msg of inboundMessages) {
        if (!msg.body || !msg.dateSent) continue;

        const timestamp = new Date(msg.dateSent).getTime();

        // Resolve conversation thread
        const conversationId = await ctx.runMutation(
          api.conversations.resolveForMessage,
          {
            userId: args.userId,
            clientId: identity.clientId,
            platform: "whatsapp",
            threadId: msg.sid, // Twilio message SID as thread reference
            timestamp,
          }
        );

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: identity.clientId,
          platformIdentityId: args.identityId,
          platform: "whatsapp",
          platformMessageId: msg.sid,
          conversationId,
          text: msg.body,
          timestamp,
          direction: "inbound",
          isRead: false,
          aiProcessed: false,
        });

        synced++;
      }

      // Fetch outbound messages (from our number to contact)
      const outboundMessages = await client.messages.list({
        from: twilioFrom,
        to: contactWhatsApp,
        limit: 100,
      });

      for (const msg of outboundMessages) {
        if (!msg.body || !msg.dateSent) continue;

        const timestamp = new Date(msg.dateSent).getTime();

        const conversationId = await ctx.runMutation(
          api.conversations.resolveForMessage,
          {
            userId: args.userId,
            clientId: identity.clientId,
            platform: "whatsapp",
            threadId: msg.sid,
            timestamp,
          }
        );

        await ctx.runMutation(api.messages.create, {
          userId: args.userId,
          clientId: identity.clientId,
          platformIdentityId: args.identityId,
          platform: "whatsapp",
          platformMessageId: msg.sid,
          conversationId,
          text: msg.body,
          timestamp,
          direction: "outbound",
          isRead: true,
          aiProcessed: false,
        });

        synced++;
      }
    } catch (err) {
      console.error(
        `WhatsApp syncMessages: failed to fetch messages for ${args.identityId}:`,
        err
      );
    }

    console.log(
      `WhatsApp syncMessages: synced ${synced} messages for identity=${args.identityId}`
    );
    return { synced };
  },
});
