import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// ============================================
// Discord Webhook — Gateway Events via HTTP Interactions
// ============================================
//
// Discord sends interactions/events to this endpoint. Configure in:
// Discord Developer Portal → Application → General Information → Interactions Endpoint URL
//   https://your-domain.com/api/webhooks/discord
//
// For DM message events, you also need a Gateway bot. The webhook approach
// here handles interaction-based events. For real-time DM monitoring, you'll
// need either:
// 1. A Discord Gateway bot (websocket connection) — runs separately
// 2. Periodic polling via the sync adapter (simpler, used here)
//
// This webhook primarily handles:
// - Discord verification pings (required for endpoint registration)
// - Interaction events (slash commands, components)
// - Message events if using the privileged Message Content intent
//
// ENV VARS:
//   DISCORD_PUBLIC_KEY  - Application public key for signature verification

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Verify Discord signature using Ed25519
async function verifyDiscordSignature(
  req: NextRequest,
  body: string
): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    console.error("Discord webhook: DISCORD_PUBLIC_KEY not set");
    return false;
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) {
    return false;
  }

  try {
    // Use Web Crypto API for Ed25519 verification
    const encoder = new TextEncoder();
    const message = encoder.encode(timestamp + body);

    const keyBytes = new Uint8Array(
      publicKey.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
    );
    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
    );

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify("Ed25519", cryptoKey, sigBytes, message);
  } catch (err) {
    console.error("Discord webhook: signature verification failed:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // Verify Discord signature
    const isValid = await verifyDiscordSignature(req, body);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(body);

    // Type 1: PING — Discord verification handshake
    if (payload.type === 1) {
      return NextResponse.json({ type: 1 });
    }

    // Type 7: MESSAGE_CREATE (from Gateway events forwarded here)
    // This handles DM messages if you have the MESSAGE_CONTENT intent
    if (payload.t === "MESSAGE_CREATE" && payload.d) {
      const msg = payload.d;

      // Only process DM messages (channel type 1)
      if (msg.channel_type !== 1) {
        return NextResponse.json({ status: "not_dm" });
      }

      // Skip bot messages
      if (msg.author?.bot) {
        return NextResponse.json({ status: "bot_message" });
      }

      const messageId = msg.id;
      const authorId = msg.author.id;
      const content = msg.content;
      const channelId = msg.channel_id;

      if (!content || !messageId) {
        return NextResponse.json({ status: "no_content" });
      }

      // Check idempotency
      const alreadyProcessed = await convex.query(
        api.webhookReliability.isProcessed,
        { eventId: messageId, source: "discord" }
      );

      if (alreadyProcessed) {
        return NextResponse.json({ status: "duplicate" });
      }

      // Look up identity by Discord user ID
      const identity = await convex.query(api.identities.getByPlatformUser, {
        platform: "discord",
        platformUserId: authorId,
      });

      if (!identity || !identity.clientId || !identity.isSelected) {
        return NextResponse.json({ status: "untracked" });
      }

      const timestamp = new Date(msg.timestamp).getTime();

      // Resolve conversation thread
      const conversationId = await convex.mutation(
        api.conversations.resolveForMessage,
        {
          userId: identity.userId,
          clientId: identity.clientId,
          platform: "discord",
          threadId: channelId,
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

      // Create inbound message
      await convex.mutation(api.messages.create, {
        userId: identity.userId,
        clientId: identity.clientId,
        platformIdentityId: identity._id,
        platform: "discord",
        platformMessageId: messageId,
        conversationId,
        threadId: channelId,
        text: content,
        timestamp,
        direction: "inbound",
        isRead: false,
        aiProcessed: false,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      // Mark as processed
      await convex.mutation(api.webhookReliability.markProcessed, {
        eventId: messageId,
        source: "discord",
      });

      return NextResponse.json({ status: "processed" });
    }

    // Unhandled event type
    return NextResponse.json({ status: "unhandled" });
  } catch (err) {
    console.error("Discord webhook: error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "Discord webhook active" });
}
