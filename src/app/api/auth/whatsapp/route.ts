import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// ============================================
// WhatsApp Auth — Connect WhatsApp Business Account (Meta Cloud API)
// ============================================
//
// Accepts a Meta System User Token + WhatsApp Phone Number ID.
// Validates both against the Meta Graph API before storing credentials.
//
// HOW TO GET CREDENTIALS (user instructions shown in the UI):
//   1. business.facebook.com → Settings → System Users
//   2. Select/create a system user → Generate New Token
//      Permissions required: whatsapp_business_messaging + whatsapp_business_management
//   3. Copy the generated token → WABA Token field
//   4. business.facebook.com → WhatsApp → Phone Numbers
//   5. Click your number → copy the "Phone Number ID" (15-digit number)
//
// STORAGE (oauth_tokens record):
//   accessToken    = Meta System User Token (long-lived, used for send + health checks)
//   platformUserId = Phone Number ID        (used in Graph API calls + webhook routing)
//   email          = display_phone_number   (human-readable, shown in Settings)
//
// POST /api/auth/whatsapp
// Body: { wabaToken: string, phoneNumberId: string }

const META_GRAPH_API = "https://graph.facebook.com/v21.0";
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { wabaToken, phoneNumberId } = body as {
      wabaToken?: string;
      phoneNumberId?: string;
    };

    if (!wabaToken || !phoneNumberId) {
      return NextResponse.json(
        { error: "Both wabaToken and phoneNumberId are required" },
        { status: 400 }
      );
    }

    // Trim whitespace — common copy-paste artifact from the Meta dashboard
    const token = wabaToken.trim();
    const numberId = phoneNumberId.trim();

    // ── Validate against Meta Graph API ─────────────────────────────────
    // Confirms the token is valid AND the Phone Number ID belongs to this WABA.
    const validationRes = await fetch(
      `${META_GRAPH_API}/${encodeURIComponent(numberId)}` +
        `?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!validationRes.ok) {
      let errorMsg = `HTTP ${validationRes.status}`;
      try {
        const errData = await validationRes.json();
        if (errData?.error?.message) {
          errorMsg = `${errData.error.message} (code ${errData.error.code ?? "?"})`;
        }
      } catch {
        // use raw status string
      }
      return NextResponse.json(
        {
          error:
            `Meta API validation failed: ${errorMsg}. ` +
            "Double-check your WABA Token and Phone Number ID.",
        },
        { status: 400 }
      );
    }

    const phoneData = await validationRes.json();
    const displayPhone: string = phoneData.display_phone_number ?? numberId;
    const verifiedName: string = phoneData.verified_name ?? "WhatsApp Business";

    // ── Fetch Wire user ──────────────────────────────────────────────────
    const user = await convex.query(api.users.getByClerkId, { clerkId });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ── Store WABA credentials in oauth_tokens ───────────────────────────
    await convex.mutation(api.oauth.storeTokens, {
      userId: user._id,
      platform: "whatsapp",
      accessToken: token,       // Meta System User Token
      platformUserId: numberId, // Phone Number ID (webhook routing key)
      email: displayPhone,      // Human-readable number shown in Settings
    });

    // ── Re-activate previously linked identities (reconnect flow) ────────
    try {
      await convex.mutation(api.identities.reactivateForPlatform, {
        userId: user._id,
        platform: "whatsapp",
      });
    } catch {
      // Non-critical — user may have no previous WhatsApp identities
    }

    // ── Update onboarding state ──────────────────────────────────────────
    try {
      await convex.mutation(api.onboarding.state.addPlatform, {
        userId: user._id,
        platform: "whatsapp",
      });
    } catch {
      // Non-critical — onboarding may already be complete
    }

    console.log(
      `WhatsApp auth: connected ${displayPhone} ("${verifiedName}") ` +
        `for user=${user._id} phoneNumberId=${numberId}`
    );

    return NextResponse.json({
      success: true,
      displayPhone,
      verifiedName,
      message: `WhatsApp Business number ${displayPhone} connected successfully`,
    });
  } catch (err) {
    console.error("WhatsApp auth: unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
