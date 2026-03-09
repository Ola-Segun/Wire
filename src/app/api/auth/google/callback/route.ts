import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function getBaseUrl(request: NextRequest): string {
  // Use the site URL from environment variable (for ngrok/production)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    return siteUrl;
  }
  // Fallback to request origin
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId
  const error = searchParams.get("error");
  const baseUrl = getBaseUrl(request);

  if (error) {
    return NextResponse.redirect(
      new URL(`/onboarding/step-1?error=${error}`, baseUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/onboarding/step-1?error=missing_params", baseUrl)
    );
  }

  // Parse state: either "userId" or "userId|origin"
  const [userId, origin] = state.split("|");
  const isFromSettings = origin === "settings";

  try {
    await convex.action(api.onboarding.gmail.handleCallback, {
      code,
      userId: userId as any,
    });

    if (isFromSettings) {
      return NextResponse.redirect(
        new URL("/settings?connected=gmail", baseUrl)
      );
    }

    return NextResponse.redirect(
      new URL("/onboarding/step-2?platform=gmail", baseUrl)
    );
  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    if (isFromSettings) {
      return NextResponse.redirect(
        new URL("/settings?error=gmail_auth_failed", baseUrl)
      );
    }
    return NextResponse.redirect(
      new URL("/onboarding/step-1?error=auth_failed", baseUrl)
    );
  }
}
