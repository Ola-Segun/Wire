"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// WhatsApp Sync Adapter — Meta WhatsApp Business Cloud API
// ============================================
//
// ARCHITECTURE: Webhook-driven, not polling-based.
//
// Meta's WhatsApp Business Cloud API does NOT provide a message history
// endpoint for standard (non-reviewed) apps. All inbound messages are
// delivered exclusively via the Meta webhook at:
//   POST /api/webhooks/whatsapp
//
// This action therefore serves as a CONNECTION HEALTH CHECK:
//   1. Reads the stored WABA token + Phone Number ID from oauth_tokens
//   2. Calls GET /v21.0/{phone_number_id}?fields=display_phone_number
//      to verify the token is still valid and the number is reachable
//   3. Returns { synced: 0 } — no message pull occurs here
//
// CREDENTIALS (stored per-user in oauth_tokens):
//   accessToken    = Meta System User Token (long-lived, from Meta Business Suite)
//   platformUserId = WhatsApp Phone Number ID (15-digit string)
//
// ENV VARS (server-side):
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN  — set in Meta App Dashboard > Webhooks
//   WHATSAPP_APP_SECRET            — from Meta App Dashboard > Basic Settings

const META_GRAPH_API = "https://graph.facebook.com/v21.0";

// ─── syncMessages ─────────────────────────────────────────────────────────────
//
// Called by the orchestrator per linked identity. Verifies the WABA connection
// is still alive. Returns { synced: 0 } because new messages arrive exclusively
// via webhook — not via polling.
//
export const syncMessages = action({
  args: {
    userId: v.id("users"),
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args): Promise<{ synced: number }> => {
    // Load WABA credentials stored during onboarding / reconnect
    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "whatsapp",
    });

    if (!tokens?.accessToken || !tokens?.platformUserId) {
      console.warn(
        `WhatsApp sync: no WABA credentials for user=${args.userId} — ` +
          "user must reconnect WhatsApp in Settings"
      );
      return { synced: 0 };
    }

    // Health check — verify the token and phone number are still valid.
    // A 401/403 means the token was revoked; log prominently so ops can act.
    try {
      const res = await fetch(
        `${META_GRAPH_API}/${tokens.platformUserId}` +
          `?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
      );

      if (res.ok) {
        const data = await res.json();
        console.log(
          `WhatsApp sync: connection OK — ` +
            `number=${data.display_phone_number} ` +
            `name="${data.verified_name}" ` +
            `quality=${data.quality_rating ?? "unknown"}`
        );
      } else if (res.status === 401 || res.status === 403) {
        console.error(
          `WhatsApp sync: token REVOKED for user=${args.userId} ` +
            `(HTTP ${res.status}). User must reconnect in Settings.`
        );
      } else {
        console.warn(
          `WhatsApp sync: health check returned HTTP ${res.status} ` +
            `for user=${args.userId}`
        );
      }
    } catch (err) {
      console.error(
        `WhatsApp sync: health check network error for user=${args.userId}:`,
        err
      );
    }

    // No history pull — messages arrive exclusively via webhook.
    return { synced: 0 };
  },
});
