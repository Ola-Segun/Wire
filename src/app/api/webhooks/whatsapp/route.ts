import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import crypto from "crypto";

// ============================================
// WhatsApp Webhook — Meta WhatsApp Business Cloud API
// ============================================
//
// Configure in Meta App Dashboard → Webhooks:
//   Callback URL : https://your-domain.com/api/webhooks/whatsapp
//   Verify Token : value of WHATSAPP_WEBHOOK_VERIFY_TOKEN env var
//   Subscriptions: messages
//
// GET  → hub.challenge verification (Meta calls once on webhook setup)
// POST → Inbound message events (JSON, signed with X-Hub-Signature-256)
//
// ENV VARS REQUIRED:
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN  — random string matching what you set in Meta
//   WHATSAPP_APP_SECRET            — from Meta App Dashboard → Basic Settings

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// ─── HMAC-SHA256 signature validation ────────────────────────────────────────
//
// Meta signs every POST body with:
//   X-Hub-Signature-256: sha256=<hex(HMAC-SHA256(rawBody, APP_SECRET))>
//
// Uses timing-safe comparison to prevent timing oracle attacks.
// Fails closed if WHATSAPP_APP_SECRET is unset.
//
function validateMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error(
      "WhatsApp webhook: WHATSAPP_APP_SECRET is not set — all requests rejected"
    );
    return false;
  }
  if (!signatureHeader?.startsWith("sha256=")) {
    console.error("WhatsApp webhook: missing or malformed X-Hub-Signature-256");
    return false;
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", appSecret)
      .update(rawBody, "utf8")
      .digest("hex");

  // Pad to equal length before timing-safe comparison to prevent length oracle
  const a = Buffer.from(signatureHeader.padEnd(expected.length));
  const b = Buffer.from(expected.padEnd(signatureHeader.length));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── GET — hub.challenge verification ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    console.log("WhatsApp webhook: hub.challenge verification OK");
    // Meta requires the raw challenge string as plain text — not JSON
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.error(
    `WhatsApp webhook: verification failed — mode=${mode} token_match=${
      token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    }`
  );
  return new NextResponse("Forbidden", { status: 403 });
}

// ─── POST — inbound message events ───────────────────────────────────────────
//
// Meta sends JSON for every subscribed event. Payload structure:
// {
//   "object": "whatsapp_business_account",
//   "entry": [{
//     "changes": [{
//       "field": "messages",
//       "value": {
//         "metadata": { "phone_number_id": "...", "display_phone_number": "..." },
//         "contacts": [{ "profile": { "name": "..." }, "wa_id": "..." }],
//         "messages": [{ "from": "...", "id": "wamid.xxx", "timestamp": "...",
//                        "type": "text", "text": { "body": "..." } }],
//         "statuses": [...]   // delivery/read receipts — ignored
//       }
//     }]
//   }]
// }
//
export async function POST(req: NextRequest) {
  // Read raw body first — required for HMAC validation before JSON.parse
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 }
    );
  }

  // Reject unsigned or tampered requests
  const signature = req.headers.get("x-hub-signature-256");
  if (!validateMetaSignature(rawBody, signature)) {
    console.error("WhatsApp webhook: invalid signature — rejected");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only handle whatsapp_business_account events (ignore Meta test pings)
  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ status: "ignored", reason: "not a waba event" });
  }

  // Fan-out: one payload can contain multiple entries (WABAs) and changes
  const errors: string[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue; // skip status, commerce, etc.

      const value = change.value;
      const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Route to the correct Wire user by their Phone Number ID
      let connection: {
        userId: any;
        accessToken: string;
        phoneNumberId: string;
      } | null = null;
      try {
        connection = await convex.query(
          api.oauth.findWhatsAppConnectionByPhoneNumberId,
          { phoneNumberId }
        );
      } catch (err) {
        console.error(
          `WhatsApp webhook: DB lookup failed for phone_number_id=${phoneNumberId}:`,
          err
        );
        errors.push(`lookup_failed:${phoneNumberId}`);
        continue;
      }

      if (!connection) {
        console.log(
          `WhatsApp webhook: no Wire user for phone_number_id=${phoneNumberId} — ignoring`
        );
        continue;
      }

      // Process each inbound message (typically 1 per change)
      for (const msg of value.messages ?? []) {
        try {
          await processInboundMessage(
            connection.userId,
            msg,
            value.contacts ?? []
          );
        } catch (err) {
          console.error(
            `WhatsApp webhook: failed to process msg id=${msg?.id}:`,
            err
          );
          errors.push(`process_failed:${msg?.id}`);
          // Continue processing remaining messages even if one fails
        }
      }

      // value.statuses (delivered, read) are intentionally ignored —
      // Wire tracks read state via isRead set during message creation.
    }
  }

  // Always respond 200 to Meta. Non-200 triggers retries which are undesirable
  // for permanent errors (unknown phone_number_id, untracked contacts, etc.).
  if (errors.length > 0) {
    console.error(
      `WhatsApp webhook: processed with ${errors.length} error(s):`,
      errors
    );
  }
  return NextResponse.json({ status: "ok" });
}

// ─── processInboundMessage ────────────────────────────────────────────────────
//
// Maps a single Meta message object → Wire message record.
// Supported types: text, image, document, audio, video.
// Skipped types:   reaction, location, contacts, sticker, order, system.
//
async function processInboundMessage(
  userId: any,
  msg: any,
  _contacts: any[]
): Promise<void> {
  const messageId: string = msg.id;
  // Meta sends Unix timestamps as string seconds — convert to ms
  const timestamp: number = parseInt(msg.timestamp, 10) * 1000;
  // "from" is E.164 without +, e.g. "15551234567"
  const fromPhone: string = msg.from;

  // ── Map message type → text + attachments ─────────────────────────────
  let text: string | null = null;
  const attachments: Array<{ type: string; url: string; filename?: string }> =
    [];

  switch (msg.type) {
    case "text":
      text = msg.text?.body ?? null;
      break;
    case "image":
      text = msg.image?.caption ?? "[Image]";
      if (msg.image?.id) {
        attachments.push({
          type: msg.image.mime_type ?? "image/jpeg",
          // Store Meta media ID ref — can be resolved to a download URL on demand
          url: `meta://media/${msg.image.id}`,
          filename: "image.jpg",
        });
      }
      break;
    case "document":
      text = msg.document?.caption ?? msg.document?.filename ?? "[Document]";
      if (msg.document?.id) {
        attachments.push({
          type: msg.document.mime_type ?? "application/octet-stream",
          url: `meta://media/${msg.document.id}`,
          filename: msg.document.filename ?? "document",
        });
      }
      break;
    case "audio":
      text = "[Voice message]";
      if (msg.audio?.id) {
        attachments.push({
          type: msg.audio.mime_type ?? "audio/ogg",
          url: `meta://media/${msg.audio.id}`,
          filename: "voice.ogg",
        });
      }
      break;
    case "video":
      text = msg.video?.caption ?? "[Video]";
      if (msg.video?.id) {
        attachments.push({
          type: msg.video.mime_type ?? "video/mp4",
          url: `meta://media/${msg.video.id}`,
          filename: "video.mp4",
        });
      }
      break;
    default:
      // reaction, location, contacts, sticker, order, system — not actionable
      console.log(
        `WhatsApp webhook: skipping unsupported type "${msg.type}" (id=${messageId})`
      );
      return;
  }

  if (!text) {
    console.log(
      `WhatsApp webhook: message ${messageId} has no text content — skipping`
    );
    return;
  }

  // ── Idempotency guard ──────────────────────────────────────────────────
  const alreadyProcessed = await convex.query(
    api.webhookReliability.isProcessed,
    { eventId: messageId }
  );
  if (alreadyProcessed) {
    console.log(`WhatsApp webhook: message ${messageId} already processed — skipping`);
    return;
  }

  // ── Identity lookup by sender phone ───────────────────────────────────
  // Normalize to E.164 with + to match storage format in platform_identities
  const normalizedPhone = fromPhone.startsWith("+")
    ? fromPhone
    : `+${fromPhone}`;

  const identities = await convex.query(api.identities.findByPlatformUser, {
    platform: "whatsapp",
    platformUserId: normalizedPhone,
  });
  const identity = identities?.[0] ?? null;

  if (!identity || !identity.clientId || !identity.isSelected) {
    console.log(
      `WhatsApp webhook: ${normalizedPhone} is not a tracked contact — ignoring. ` +
        "Add via Settings → Sync Contacts."
    );
    // Mark processed so we don't spin on retries for untracked numbers
    await convex.mutation(api.webhookReliability.markProcessed, {
      eventId: messageId,
      source: "whatsapp",
    });
    return;
  }

  // ── Resolve/create conversation thread ────────────────────────────────
  const conversationId = await convex.mutation(
    api.conversations.resolveForMessage,
    {
      userId: identity.userId,
      clientId: identity.clientId,
      platform: "whatsapp",
      threadId: messageId,
      timestamp,
    }
  );

  // ── Create inbound message ─────────────────────────────────────────────
  await convex.mutation(api.messages.create, {
    userId: identity.userId,
    clientId: identity.clientId,
    platformIdentityId: identity._id,
    platform: "whatsapp",
    platformMessageId: messageId,
    conversationId,
    text,
    timestamp,
    direction: "inbound",
    isRead: false,
    aiProcessed: false,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  // ── Mark idempotency record ────────────────────────────────────────────
  await convex.mutation(api.webhookReliability.markProcessed, {
    eventId: messageId,
    source: "whatsapp",
  });

  console.log(
    `WhatsApp webhook: message ${messageId} from ${normalizedPhone} → client=${identity.clientId}`
  );
}
