import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

// ============================================
// Discord OAuth2 Callback — User Account Linking
// ============================================
//
// Discord OAuth2 flow:
// 1. Frontend redirects user to Discord authorization URL:
//    https://discord.com/oauth2/authorize?client_id=...&scope=identify&redirect_uri=...
// 2. User authorizes → Discord redirects here with ?code=...
// 3. We exchange code for access token, fetch user profile, store connection
//
// ENV VARS:
//   DISCORD_CLIENT_ID     - Application client ID
//   DISCORD_CLIENT_SECRET - Application client secret
//   NEXT_PUBLIC_APP_URL   - App base URL for redirect_uri construction
//
// Scopes needed: identify (for user profile), guilds (optional, for shared servers)

const DISCORD_API = "https://discord.com/api/v10";
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      console.error(`Discord OAuth callback: error=${error}`);
      return NextResponse.redirect(
        new URL("/settings?error=discord_denied", req.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/settings?error=discord_no_code", req.url)
      );
    }

    const clientId = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId || !clientSecret || !appUrl) {
      throw new Error("Discord OAuth environment variables not configured");
    }

    const redirectUri = `${appUrl}/api/auth/discord/callback`;

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(
        `Discord OAuth token exchange failed: ${tokenResponse.status}`,
        errorBody
      );
      return NextResponse.redirect(
        new URL("/settings?error=discord_token_failed", req.url)
      );
    }

    const tokens = await tokenResponse.json();

    // Fetch user profile
    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch Discord user profile: ${userResponse.status}`);
    }

    const discordUser = await userResponse.json();

    // Get Convex user
    const user = await convex.query(api.users.getByClerkId, { clerkId });
    if (!user) {
      return NextResponse.redirect(
        new URL("/settings?error=user_not_found", req.url)
      );
    }

    // Store OAuth tokens
    await convex.mutation(api.oauth.storeTokens, {
      userId: user._id,
      platform: "discord",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : undefined,
      scope: tokens.scope,
      platformUserId: discordUser.id,
    });

    // Update onboarding state
    try {
      await convex.mutation(api.onboarding.state.addPlatform, {
        userId: user._id,
        platform: "discord",
      });
    } catch {
      // Onboarding may already be complete
    }

    console.log(
      `Discord OAuth: connected for user=${user._id}, discordUser=${discordUser.id} (${discordUser.username})`
    );

    return NextResponse.redirect(
      new URL("/settings?success=discord_connected", req.url)
    );
  } catch (err) {
    console.error("Discord OAuth callback: error:", err);
    return NextResponse.redirect(
      new URL("/settings?error=discord_error", req.url)
    );
  }
}
