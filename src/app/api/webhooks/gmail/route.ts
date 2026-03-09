import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Gmail Pub/Sub push notifications arrive here.
// Optimized: filters by email to sync only the affected user,
// uses idempotency to prevent duplicate processing,
// and queues heavy work asynchronously.
export async function POST(req: NextRequest) {
  // Rate limit webhook requests
  const clientIp = req.headers.get("x-forwarded-for") ?? "unknown";
  const rateCheck = checkRateLimit(`gmail-webhook:${clientIp}`, RATE_LIMITS.webhook);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)) } }
    );
  }

  try {
    const body = await req.json();
    

    // Pub/Sub message format
    const message = body.message;
    if (!message?.data) {
      return NextResponse.json({ error: "No message data" }, { status: 400 });
    }

    // Use Pub/Sub messageId as idempotency key
    const pubsubMessageId = message.messageId;

    // Decode the base64 notification
    const decoded = JSON.parse(
      Buffer.from(message.data, "base64").toString("utf-8")
    );

    // decoded contains: { emailAddress: string, historyId: number }
    const { emailAddress, historyId } = decoded;

    if (!emailAddress || !historyId) {
      return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
    }

    // Idempotency check: skip if this Pub/Sub message was already processed
    if (pubsubMessageId) {
      const alreadyProcessed = await convex.query(
        api.webhookReliability.isProcessed,
        { eventId: `gmail:${pubsubMessageId}` }
      );
      if (alreadyProcessed) {
        return NextResponse.json({ ok: true, skipped: "duplicate" });
      }
    }

    // Targeted lookup: find the specific Gmail connection matching this email
    // instead of syncing ALL connections (O(1) vs O(n))
    const matchedConnection = await convex.query(
      api.oauth.getGmailConnectionByEmail,
      { email: emailAddress.toLowerCase() }
    );

    let syncedCount = 0;

    if (matchedConnection) {
      // Direct match — only sync this one user
      try {
        const result = await convex.action(api.sync.gmail.syncFromHistory, {
          userId: matchedConnection.userId,
          historyId: matchedConnection.historyId,
        });
        syncedCount = result.synced;
      } catch (err) {
        console.error(
          `Gmail webhook: sync failed for user=${matchedConnection.userId}:`,
          err
        );

        // Add to DLQ on failure
        await convex.mutation(api.webhookReliability.addToDeadLetter, {
          source: "gmail",
          eventType: "message.sync",
          payload: { emailAddress, historyId, userId: matchedConnection.userId },
          error: err instanceof Error ? err.message : String(err),
          attempts: 1,
        });
      }
    } else {
      // Fallback: email not matched to a specific connection.
      // This happens if the email field hasn't been stored yet on oauth_tokens.
      // Sync all Gmail connections as a safety net.
      const connections = await convex.query(
        api.oauth.getGmailConnectionsWithHistory,
        {}
      );

      for (const conn of connections) {
        try {
          const result = await convex.action(api.sync.gmail.syncFromHistory, {
            userId: conn.userId,
            historyId: conn.historyId,
          });
          syncedCount += result.synced;
        } catch (err) {
          console.error(
            `Gmail webhook: sync failed for user=${conn.userId}:`,
            err
          );
        }
      }
    }

    // Mark this Pub/Sub message as processed for idempotency
    if (pubsubMessageId) {
      await convex.mutation(api.webhookReliability.markProcessed, {
        eventId: `gmail:${pubsubMessageId}`,
        source: "gmail",
      });
    }

    // Acknowledge the notification (Google requires 200 response)
    return NextResponse.json({ ok: true, synced: syncedCount });
  } catch (err) {
    console.error("Gmail webhook error:", err);
    // Still return 200 to prevent Pub/Sub retries on processing errors
    return NextResponse.json({ ok: true });
  }
}
