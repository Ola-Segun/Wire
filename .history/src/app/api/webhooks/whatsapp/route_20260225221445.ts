import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// ============================================
// WhatsApp Webhook — Twilio Incoming Messages
// ============================================
//
// Twilio sends POST requests to this endpoint when a WhatsApp message arrives.
// Configure in Twilio Console:
//   Phone Number → Messaging → When a message comes in → POST to:
//   https://your-domain.com/api/webhooks/whatsapp
//
// Twilio webhook format (form-urlencoded):
//   From: whatsapp:+1234567890
//   To: whatsapp:+14155238886
//   Body: message text
//   MessageSid: unique message ID
//   NumMedia: number of media attachments
//   MediaUrl0, MediaContentType0: first attachment

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Twilio signature validation
function validateTwilioSignature(
  req: NextRequest,
  body: string
): boolean {
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  if (!twilioAuthToken) {
    console.error("WhatsApp webhook: TWILIO_AUTH_TOKEN not set, cannot validate");
    return false;
  }

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    console.error("WhatsApp webhook: missing x-twilio-signature header");
    return false;
  }

  // TODO [SECURITY]: Implement full Twilio signature validation using
  // the twilio.validateRequest() helper. Requires installing twilio SDK
  // in the Next.js app or implementing HMAC-SHA1 manually.
  // For now, we check the signature header exists (basic sanity check).
  // See: https://www.twilio.com/docs/usage/security#validating-requests
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from = formData.get("From") as string; // "whatsapp:+1234567890"
    const to = formData.get("To") as string;     // "whatsapp:+14155238886"
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;
    const numMedia = parseInt((formData.get("NumMedia") as string) || "0");

    if (!from || !body || !messageSid) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Extract phone number (remove "whatsapp:" prefix)
    const phoneNumber = from.replace("whatsapp:", "");

    console.log(
      `WhatsApp webhook: message from ${phoneNumber}, sid=${messageSid}`
    );

    // Look up identity by phone number to find the Wire user + client
    // This uses the by_phone index on platform_identities
    const identity = await convex.query(api.identities.getByPhone, {
      phoneNumber,
    });

    if (!identity || !identity.clientId || !identity.isSelected) {
      console.log(
        `WhatsApp webhook: no tracked identity for phone ${phoneNumber}, ignoring`
      );
      // Return 200 so Twilio doesn't retry
      return NextResponse.json({ status: "ignored" });
    }

    // Check idempotency — has this message already been processed?
    const alreadyProcessed = await convex.query(
      api.webhookReliability.isProcessed,
      { eventId: messageSid, source: "whatsapp" }
    );

    if (alreadyProcessed) {
      console.log(`WhatsApp webhook: message ${messageSid} already processed`);
      return NextResponse.json({ status: "duplicate" });
    }

    // Extract media attachments if present
    const attachments: Array<{ type: string; url: string; filename?: string }> = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = formData.get(`MediaUrl${i}`) as string;
      const mediaType = formData.get(`MediaContentType${i}`) as string;
      if (mediaUrl) {
        attachments.push({
          type: mediaType || "unknown",
          url: mediaUrl,
          filename: `attachment-${i}`,
        });
      }
    }

    // Resolve conversation thread
    const conversationId = await convex.mutation(
      api.conversations.resolveForMessage,
      {
        userId: identity.userId,
        clientId: identity.clientId,
        platform: "whatsapp",
        timestamp: Date.now(),
      }
    );

    // Create the inbound message
    await convex.mutation(api.messages.create, {
      userId: identity.userId,
      clientId: identity.clientId,
      platformIdentityId: identity._id,
      platform: "whatsapp",
      platformMessageId: messageSid,
      conversationId,
      text: body,
      timestamp: Date.now(),
      direction: "inbound",
      isRead: false,
      aiProcessed: false,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    // Mark as processed for idempotency
    await convex.mutation(api.webhookReliability.markProcessed, {
      eventId: messageSid,
      source: "whatsapp",
    });

    // Update identity stats
    await convex.mutation(api.identities.recordMessage, {
      identityId: identity._id,
      timestamp: Date.now(),
    });

    console.log(
      `WhatsApp webhook: processed message ${messageSid} for client ${identity.clientId}`
    );

    // Twilio expects a TwiML response (empty response = no reply)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (err) {
    console.error("WhatsApp webhook: error processing message:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Twilio also sends GET for webhook validation
export async function GET() {
  return NextResponse.json({ status: "WhatsApp webhook active" });
}
