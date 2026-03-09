"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { google } from "googleapis";

function getOAuth2Client(redirectUrl?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUrl
  );
}

function getRedirectUri() {
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${siteUrl}/api/auth/google/callback`;
}

// Initiate Gmail OAuth flow
export const initiateOAuth = action({
  args: {
    userId: v.id("users"),
    origin: v.optional(v.string()), // "settings" or "onboarding" (default)
  },
  handler: async (ctx, args) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getRedirectUri();

    console.log("initiateOAuth debug:", {
      hasClientId: !!clientId,
      clientIdFull: clientId,
      hasClientSecret: !!clientSecret,
      redirectUri,
    });

    const oauth2Client = getOAuth2Client(redirectUri);

    // Encode origin in state so callback knows where to redirect
    const statePayload = args.origin
      ? `${args.userId}|${args.origin}`
      : args.userId;

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      state: statePayload,
    });

    return { authUrl };
  },
});

// Handle OAuth callback - exchange code for tokens
export const handleCallback = action({
  args: {
    code: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getRedirectUri();

    console.log("handleCallback debug:", {
      hasClientId: !!clientId,
      clientIdPrefix: clientId?.slice(0, 10),
      clientIdFull: clientId,
      hasClientSecret: !!clientSecret,
      clientSecretPrefix: clientSecret?.slice(0, 6),
      redirectUri,
    });

    if (!clientId || !clientSecret) {
      throw new Error(
        `Missing Google OAuth credentials: clientId=${!!clientId}, clientSecret=${!!clientSecret}`
      );
    }

    const oauth2Client = getOAuth2Client(redirectUri);

    let tokens;
    try {
      const response = await oauth2Client.getToken(args.code);
      tokens = response.tokens;
    } catch (err: any) {
      console.error("Google getToken error:", err?.response?.data || err.message);
      throw new Error(`Google token exchange failed: ${err?.response?.data?.error || err.message}`);
    }

    // Fetch user's email from Gmail API
    let userEmail: string | undefined;
    try {
      oauth2Client.setCredentials({ access_token: tokens.access_token });
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      userEmail = profile.data.emailAddress ?? undefined;
      console.log("Fetched Gmail email:", userEmail);
    } catch (err) {
      console.error("Failed to fetch Gmail profile:", err);
      // Continue without email - it's optional
    }

    // Store tokens with email
    await ctx.runMutation(api.oauth.storeTokens, {
      userId: args.userId,
      platform: "gmail",
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ?? undefined,
      scope: tokens.scope ?? undefined,
      email: userEmail,
    });

    // Mark Gmail as connected in onboarding state
    await ctx.runMutation(api.onboarding.state.addPlatform, {
      platform: "gmail",
      userId: args.userId,
    });

    // Re-activate any previously linked identities (handles reconnect after disconnect)
    await ctx.runMutation(api.identities.reactivateForPlatform, {
      userId: args.userId,
      platform: "gmail",
    });

    // Register Gmail push notifications watch
    try {
      await ctx.runAction(api.sync.gmail.registerWatch, {
        userId: args.userId,
      });
    } catch (err) {
      console.error("Failed to register Gmail watch:", err);
      // Don't fail the OAuth flow if watch registration fails
    }

    return { success: true };
  },
});

// Import contacts from Gmail inbox
export const importContacts = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens: Record<string, any> | null = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "gmail",
    });

    if (!tokens) throw new Error("Gmail not connected");

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Fetch recent messages (last 500)
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      q: "-from:me",
    });

    const messageIds = response.data.messages || [];

    // Build contact map from message headers
    const contactMap = new Map<
      string,
      { email: string; name: string; messageCount: number; lastMessageDate: number }
    >();

    // Batch fetch message headers (not full content for speed)
    for (const msg of messageIds.slice(0, 200)) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "Date"],
        });

        const headers = full.data.payload?.headers || [];
        const fromHeader = headers.find(
          (h) => h.name?.toLowerCase() === "from"
        );

        if (fromHeader?.value) {
          const { email, name } = parseEmailAddress(fromHeader.value);

          if (!contactMap.has(email)) {
            contactMap.set(email, {
              email,
              name: name || email.split("@")[0],
              messageCount: 1,
              lastMessageDate: parseInt(full.data.internalDate || "0"),
            });
          } else {
            const existing = contactMap.get(email)!;
            existing.messageCount++;
            existing.lastMessageDate = Math.max(
              existing.lastMessageDate,
              parseInt(full.data.internalDate || "0")
            );
          }
        }
      } catch {
        // Skip messages that fail to fetch
        continue;
      }
    }

    // Return contacts as plain data — identities are created only when the
    // user confirms their selection in step-2 (via identities.createSelected).
    // This prevents hundreds of unneeded platform_identity records accumulating.
    const contacts = Array.from(contactMap.values())
      .sort((a, b) => b.messageCount - a.messageCount);

    return {
      count: contacts.length,
      contacts,
    };
  },
});

// Discover new Gmail contacts not yet tracked in platform_identities.
// Follows the same transient pattern as importContacts — no DB writes.
// Returns only contacts whose email is NOT already in platform_identities,
// so the caller (SyncContactsModal) can let the user pick which ones to add.
// Contacts are persisted only when the user confirms via identities.createSelected.
export const discoverNewContacts = action({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args
  ): Promise<{
    count: number;
    contacts: Array<{
      email: string;
      name: string;
      messageCount: number;
      lastMessageDate: number;
    }>;
  }> => {
    const tokens: Record<string, any> | null = await ctx.runQuery(
      api.oauth.getTokens,
      { userId: args.userId, platform: "gmail" }
    );
    if (!tokens) throw new Error("Gmail not connected");

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      q: "-from:me",
    });

    const messageIds = response.data.messages || [];
    const contactMap = new Map<
      string,
      { email: string; name: string; messageCount: number; lastMessageDate: number }
    >();

    for (const msg of messageIds.slice(0, 200)) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "Date"],
        });

        const headers = full.data.payload?.headers || [];
        const fromHeader = headers.find((h) => h.name?.toLowerCase() === "from");

        if (fromHeader?.value) {
          const { email, name } = parseEmailAddress(fromHeader.value);
          if (!contactMap.has(email)) {
            contactMap.set(email, {
              email,
              name: name || email.split("@")[0],
              messageCount: 1,
              lastMessageDate: parseInt(full.data.internalDate || "0"),
            });
          } else {
            const existing = contactMap.get(email)!;
            existing.messageCount++;
            existing.lastMessageDate = Math.max(
              existing.lastMessageDate,
              parseInt(full.data.internalDate || "0")
            );
          }
        }
      } catch {
        continue;
      }
    }

    // Filter against existing platform_identities — return only genuinely new contacts
    const existingIdentities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId: args.userId, platform: "gmail" }
    );
    const knownEmails = new Set(
      existingIdentities.map((i) => i.email?.toLowerCase()).filter(Boolean)
    );

    // Also exclude the user's own Gmail address — they are not their own client.
    // (importContacts uses "-from:me" but discoverNewContacts may still surface it
    //  via reply threads where the user's address appears as a recipient.)
    if (tokens.email) {
      knownEmails.add((tokens.email as string).toLowerCase());
    }

    const newContacts = Array.from(contactMap.values())
      .filter((c) => !knownEmails.has(c.email.toLowerCase()))
      .sort((a, b) => b.messageCount - a.messageCount);

    // No DB writes — identities are persisted only when user confirms selection
    return { count: newContacts.length, contacts: newContacts };
  },
});

function parseEmailAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim(),
      email: match[2].trim().toLowerCase(),
    };
  }
  return { email: raw.trim().toLowerCase() };
}
