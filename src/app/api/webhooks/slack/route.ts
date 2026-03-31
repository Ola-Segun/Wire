import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Verify Slack request signature (timing-safe)
function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");
  const expected = `v0=${hmac}`;
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

// Slack Events API webhook handler.
// Optimized with:
// - Idempotency via event_id to prevent duplicate processing
// - O(1) identity lookup via by_platform_user index instead of iterating all connections
// - Dead letter queue for failed processing
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle Slack URL verification challenge (no rate limit on this)
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Rate limit webhook requests
  const clientIp = req.headers.get("x-forwarded-for") ?? "unknown";
  const rateCheck = checkRateLimit(`slack-webhook:${clientIp}`, RATE_LIMITS.webhook);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)) } }
    );
  }

  // Verify signature — mandatory, fail-closed if secret is not configured
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("SLACK_SIGNING_SECRET is not set — rejecting webhook");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";

  const parsedTimestamp = parseInt(timestamp, 10);
  if (!timestamp || isNaN(parsedTimestamp)) {
    return NextResponse.json({ error: "Missing or invalid timestamp" }, { status: 403 });
  }

  // Reject requests older than 5 minutes (replay attack prevention)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsedTimestamp) > 300) {
    return NextResponse.json({ error: "Stale request" }, { status: 403 });
  }

  try {
    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
  }

  // Handle event callbacks
  if (body.type === "event_callback") {
    const event = body.event;
    const eventId = body.event_id;

    // Idempotency check: skip duplicate events
    if (eventId) {
      const alreadyProcessed = await convex.query(
        api.webhookReliability.isProcessed,
        { eventId: `slack:${eventId}` }
      );
      if (alreadyProcessed) {
        return NextResponse.json({ ok: true, skipped: "duplicate" });
      }
    }

    // Only process plain messages (no subtype = no join/leave/bot events)
    if (event?.type === "message" && !event.subtype && !event.bot_id) {
      const slackUserId = event.user;
      const text = event.text;
      const ts = event.ts;
      const threadTs = event.thread_ts;
      const channelId = event.channel;
      // channel_type: "im" = DM, "channel" = public, "group" = private
      const channelType: string | undefined = event.channel_type;

      // Wire only supports 1:1 DMs. Skip channel messages early so they don't
      // silently fall through — log them so the user can diagnose.
      if (channelType && channelType !== "im") {
        console.log(
          `Slack webhook: skipping channel message (channel_type=${channelType} channel=${channelId} user=${slackUserId}). ` +
          `Wire currently only tracks 1:1 DM conversations.`
        );
        // Still fall through to mark the event processed below
      } else if (slackUserId && text && ts) {
        try {
          // O(1) lookup: find identities matching this Slack user directly via index
          const matchedIdentities = await convex.query(
            api.identities.findByPlatformUser,
            { platform: "slack", platformUserId: slackUserId }
          );

          // Filter to only selected identities with clients
          const linkedIdentities = matchedIdentities.filter(
            (id: any) => id.clientId && id.isSelected
          );

          if (linkedIdentities.length > 0) {
            // Sender is a tracked contact → inbound
            for (const identity of linkedIdentities) {
              await convex.action(api.sync.slack.processEvent, {
                userId: identity.userId,
                slackUserId,
                text,
                ts,
                threadTs: threadTs || undefined,
                channelId,
              });
            }
          } else {
            // Sender is not a tracked contact — could be the Wire user's own outbound DM.
            // First try fast O(1) lookup by cached dmChannelId.
            const channelIdentity = await convex.query(
              api.identities.findByDmChannel,
              { dmChannelId: channelId }
            );

            if (channelIdentity && channelIdentity.clientId && channelIdentity.isSelected) {
              await convex.action(api.sync.slack.processEvent, {
                userId: channelIdentity.userId,
                slackUserId,
                text,
                ts,
                threadTs: threadTs || undefined,
                channelId,
              });
            } else {
              // dmChannelId not cached yet — check if the sender is a known Wire user
              // (i.e. their own Slack user ID stored at OAuth time).
              const wireConnection = await convex.query(
                api.oauth.findSlackConnectionByUserId,
                { slackUserId }
              );
              if (wireConnection) {
                // This IS the Wire user sending a DM, but dmChannelId isn't cached yet.
                // The next scheduled sync will populate it. Log for diagnostics.
                console.warn(
                  `Slack webhook: outbound DM from Wire user (slackUser=${slackUserId} channel=${channelId}) ` +
                  `dropped — dmChannelId not yet cached. It will appear after the next sync cycle. ` +
                  `Trigger a manual sync to capture it immediately.`
                );
              } else {
                // Unknown sender, unknown channel — not a Wire-tracked conversation.
                console.log(
                  `Slack webhook: message from untracked user (slackUser=${slackUserId} channel=${channelId}) — no matching identity found.`
                );
              }
            }
          }
        } catch (err) {
          console.error("Slack webhook processing error:", err);

          // Add to DLQ on failure
          await convex.mutation(api.webhookReliability.addToDeadLetter, {
            source: "slack",
            eventType: "message.process",
            payload: { slackUserId, text, ts, threadTs, channelId },
            error: err instanceof Error ? err.message : String(err),
            attempts: 1,
          });
        }
      }
    }

    // Mark event as processed for idempotency
    if (eventId) {
      await convex.mutation(api.webhookReliability.markProcessed, {
        eventId: `slack:${eventId}`,
        source: "slack",
      });
    }
  }

  // Always acknowledge quickly to prevent retries
  return NextResponse.json({ ok: true });
}
