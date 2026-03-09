"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

// ============================================
// WhatsApp Onboarding — Manual Contact Discovery
// ============================================
//
// Unlike Gmail/Slack/Discord, WhatsApp has no API to "list contacts".
// Contacts are phone numbers provided manually by the user.
//
// This module provides:
//   discoverNewUsers — Returns existing WhatsApp identities not yet linked
//   addContactByPhone — Creates a new WhatsApp identity from a phone number
//
// The SyncContactsModal uses addContactByPhone to let users add
// contacts one by one via phone number input.

// Discover existing WhatsApp contacts not yet linked to clients
export const discoverNewUsers = action({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args
  ): Promise<{
    count: number;
    users: Array<{
      platformUserId: string;
      displayName: string;
      phoneNumber?: string;
    }>;
  }> => {
    // Verify WhatsApp is connected
    const tokens: Record<string, any> | null = await ctx.runQuery(
      api.oauth.getTokens,
      { userId: args.userId, platform: "whatsapp" }
    );
    if (!tokens) throw new Error("WhatsApp not connected");

    // Get all WhatsApp identities for this user
    const identities: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId: args.userId, platform: "whatsapp" }
    );

    // Return identities that are NOT yet linked to a client
    const unlinked = identities
      .filter((id) => !id.clientId)
      .map((id) => ({
        platformUserId: id.platformUserId,
        displayName: id.displayName || id.platformUserId,
        phoneNumber: id.phoneNumber || id.platformUserId,
      }));

    return { count: unlinked.length, users: unlinked };
  },
});

// Add a WhatsApp contact by phone number
// Creates a new platform_identity if the number isn't already tracked
export const addContactByPhone = action({
  args: {
    userId: v.id("users"),
    phoneNumber: v.string(),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Normalize phone number
    const phone = args.phoneNumber.startsWith("+")
      ? args.phoneNumber
      : `+${args.phoneNumber}`;

    // Check if already exists
    const existing: Array<Record<string, any>> = await ctx.runQuery(
      api.identities.listByPlatform,
      { userId: args.userId, platform: "whatsapp" }
    );

    const found = existing.find((id) => id.platformUserId === phone);
    if (found) {
      return { identityId: found._id, alreadyExists: true };
    }

    // Create new identity
    const now = Date.now();
    const identityId = await ctx.runMutation(api.identities.create, {
      userId: args.userId,
      platform: "whatsapp",
      platformUserId: phone,
      displayName: args.displayName || phone,
      phoneNumber: phone,
      isSelected: true,
      messageCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
    });

    return { identityId, alreadyExists: false };
  },
});
