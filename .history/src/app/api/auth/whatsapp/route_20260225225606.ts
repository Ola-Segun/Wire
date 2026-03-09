import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// ============================================
// WhatsApp Auth — Connect WhatsApp via Phone Number
// ============================================
//
// Unlike Gmail/Slack which use OAuth, WhatsApp via Twilio uses the
// account owner's Twilio credentials. Individual client WhatsApp numbers
// are registered as platform identities by providing the phone number.
//
// This endpoint allows a Wire user to "connect" a client's WhatsApp
// number for tracking, not to authenticate as that WhatsApp user.
//
// POST /api/auth/whatsapp
// Body: { phoneNumber: "+1234567890", displayName: "Client Name" }

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumber, displayName } = body;

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

    // Check if this phone number is already registered
    const existingList = await convex.query(api.identities.findByPlatformUser, {
      platform: "whatsapp",
      platformUserId: normalizedPhone,
    });
    const existing = existingList?.find((i: any) => i.userId === user._id);

    if (existing) {
      return NextResponse.json({
        success: true,
        identityId: existing._id,
        message: "WhatsApp number already connected",
      });
    }

    // Create platform identity for this WhatsApp contact
    const now = Date.now();
    const identityId = await convex.mutation(api.identities.create, {
      userId: user._id,
      platform: "whatsapp",
      platformUserId: normalizedPhone,
      displayName: displayName || normalizedPhone,
      phoneNumber: normalizedPhone,
      isSelected: true,
      messageCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
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
      identityId,
      message: "WhatsApp number connected successfully",
    });
  } catch (err) {
    console.error("WhatsApp auth: error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
