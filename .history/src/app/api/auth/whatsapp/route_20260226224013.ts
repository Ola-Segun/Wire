import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// ============================================
// WhatsApp Auth — Connect YOUR WhatsApp Account
// ============================================
//
// This endpoint registers the Wire user's OWN WhatsApp phone number.
// It ONLY creates an oauth_tokens record so the settings page shows
// WhatsApp as "Connected". No platform_identity is created here —
// identities are for CLIENT contacts, added via "Sync Contacts".
//
// Flow:
//   1. User enters THEIR phone number → Connect WhatsApp
//   2. This creates an oauth_tokens marker (platform = "whatsapp")
//   3. User then clicks "Sync Contacts" to add CLIENT phone numbers
//   4. Each client number becomes a platform_identity linked to a Client
//
// POST /api/auth/whatsapp
// Body: { phoneNumber: "+1234567890" }

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Normalize phone number (ensure + prefix)
    const normalizedPhone = phoneNumber.startsWith("+")
      ? phoneNumber
      : `+${phoneNumber}`;

    // Get user record from Convex
    const user = await convex.query(api.users.getByClerkId, {
      clerkId,
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Register WhatsApp as a connected platform in oauth_tokens
    // The user's own phone is stored as platformUserId so we can
    // exclude it from the "Sync Contacts" discover list.
    await convex.mutation(api.oauth.storeTokens, {
      userId: user._id,
      platform: "whatsapp",
      accessToken: "twilio-managed", // actual auth is via TWILIO_AUTH_TOKEN env var
      platformUserId: normalizedPhone, // user's OWN WhatsApp number
    });

    // Update onboarding state to include WhatsApp
    try {
      await convex.mutation(api.onboarding.state.addPlatform, {
        userId: user._id,
        platform: "whatsapp",
      });
    } catch {
      // Onboarding may already be complete, non-critical
    }

    return NextResponse.json({
      success: true,
      message: "WhatsApp connected successfully",
    });
  } catch (err) {
    console.error("WhatsApp auth: error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
