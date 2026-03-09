"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// WhatsApp Sync Adapter — Twilio REST API (no SDK dependency)
// ============================================
//
// ENV VARS REQUIRED:
//   TWILIO_ACCOUNT_SID    - Twilio account SID
//   TWILIO_AUTH_TOKEN      - Twilio auth token
//   TWILIO_WHATSAPP_FROM   - Your Twilio WhatsApp number (e.g. "whatsapp:+14155238886")

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function getTwilioAuth(): { accountSid: string; authHeader: string } {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
    );
  }

  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  return { accountSid, authHeader };
}

interface TwilioMessage {
  sid: string;
  body: string;
  date_sent: string;
  from: string;
  to: string;
  status: string;
}

// Fetch messages from Twilio REST API
async function fetchTwilioMessages(
  accountSid: string,
  authHeader: string,
  params: Record<string, string>
): Promise<TwilioMessage[]> {
  const query = new URLSearchParams({ ...params, PageSize: "100" });
  const url = `${TWILIO_API}/Accounts/${accountSid}/Messages.json?${query}`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    throw new Error(`Twilio API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.messages || [];
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

    let auth;
    try {
      auth = getTwilioAuth();
    } catch (err) {
      console.error("WhatsApp syncMessages: Twilio auth failed:", err);
      return { synced: 0 };
    }

    const contactWhatsApp = `whatsapp:${identity.phoneNumber}`;
    let synced = 0;

    try {
      // Fetch inbound messages (from contact to our number)
      const inboundMessages = await fetchTwilioMessages(
        auth.accountSid,
        auth.authHeader,
        { From: contactWhatsApp, To: twilioFrom }
      );

      for (const msg of inboundMessages) {
        if (!msg.body || !msg.date_sent) continue;

        const timestamp = new Date(msg.date_sent).getTime();

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
          direction: "inbound",
          isRead: false,
          aiProcessed: false,
        });

        synced++;
      }

      // Fetch outbound messages (from our number to contact)
      const outboundMessages = await fetchTwilioMessages(
        auth.accountSid,
        auth.authHeader,
        { From: twilioFrom, To: contactWhatsApp }
      );

      for (const msg of outboundMessages) {
        if (!msg.body || !msg.date_sent) continue;

        const timestamp = new Date(msg.date_sent).getTime();

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
