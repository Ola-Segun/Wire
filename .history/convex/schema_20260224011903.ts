import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // USER MANAGEMENT
  // ============================================

  users: defineTable({
    // Clerk Authentication
    clerkId: v.string(),
    email: v.string(),

    // Profile (synced from Clerk)
    name: v.string(),
    avatar: v.optional(v.string()),
    timezone: v.optional(v.string()),

    // Subscription
    plan: v.string(), // "free", "pro", "agency"
    planStatus: v.string(), // "active", "cancelled", "trialing"
    stripeCustomerId: v.optional(v.string()),
    subscriptionEndsAt: v.optional(v.number()),

    // Preferences
    preferences: v.optional(
      v.object({
        dailyDigestTime: v.optional(v.string()),
        urgencyThreshold: v.optional(v.number()),
        notifications: v.optional(
          v.object({
            email: v.optional(v.boolean()),
            push: v.optional(v.boolean()),
          })
        ),
      })
    ),

    // Metadata
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
    onboardingCompleted: v.boolean(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  // ============================================
  // CLIENT MANAGEMENT
  // ============================================

  clients: defineTable({
    userId: v.id("users"),

    // Basic Info
    name: v.string(),
    company: v.optional(v.string()),
    avatar: v.optional(v.string()),

    // Contact Info
    primaryEmail: v.optional(v.string()),
    primaryPhone: v.optional(v.string()),

    // Business Metadata
    totalRevenue: v.optional(v.number()),
    currency: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),

    // Relationship Metrics
    relationshipHealth: v.optional(v.number()),
    firstContactDate: v.number(),
    lastContactDate: v.number(),
    totalMessages: v.number(),
    responseTimeAvg: v.optional(v.number()),

    // AI Insights
    communicationPattern: v.optional(
      v.object({
        preferredPlatform: v.optional(v.string()),
        activeHours: v.optional(v.string()),
        responseSpeed: v.optional(v.string()),
      })
    ),

    // Identity Resolution
    createdFromPlatform: v.string(),
    createdFromIdentity: v.id("platform_identities"),

    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
    isArchived: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isArchived"])
    .index("by_user_health", ["userId", "relationshipHealth"]),

  // ============================================
  // PLATFORM IDENTITIES
  // ============================================

  platform_identities: defineTable({
    userId: v.id("users"),
    clientId: v.optional(v.id("clients")),

    // Platform Info
    platform: v.string(), // "gmail", "slack", "whatsapp", "discord"
    platformUserId: v.string(),

    // Display Info
    displayName: v.string(),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    avatar: v.optional(v.string()),

    // Cached DM channel ID (Slack only, for fast webhook lookups)
    dmChannelId: v.optional(v.string()),

    // Status
    isSelected: v.boolean(),
    linkedAt: v.optional(v.number()),

    // Stats
    messageCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_platform", ["userId", "platform"])
    .index("by_client", ["clientId"])
    .index("by_email", ["email"])
    .index("by_phone", ["phoneNumber"])
    // O(1) lookup for Slack webhook processing by platform user ID
    .index("by_platform_user", ["platform", "platformUserId"])
    // O(1) lookup for Slack webhook processing by DM channel ID
    .index("by_dm_channel", ["dmChannelId"]),

  // ============================================
  // MESSAGES
  // ============================================

  messages: defineTable({
    userId: v.id("users"),
    clientId: v.id("clients"),
    platformIdentityId: v.id("platform_identities"),

    // Platform Info
    platform: v.string(),
    platformMessageId: v.string(),
    threadId: v.optional(v.string()),

    // Content
    text: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.string(),
          url: v.string(),
          filename: v.optional(v.string()),
        })
      )
    ),

    // Metadata
    timestamp: v.number(),
    direction: v.string(), // "inbound", "outbound"

    // AI Metadata
    aiMetadata: v.optional(
      v.object({
        priorityScore: v.optional(v.number()),
        sentiment: v.optional(v.string()),
        urgency: v.optional(v.string()),
        extractedActions: v.optional(v.array(v.string())),
        topics: v.optional(v.array(v.string())),
        entities: v.optional(v.array(v.string())),
        scopeCreepDetected: v.optional(v.boolean()),
        suggestedReply: v.optional(v.string()),
      })
    ),

    // AI Processing Status
    aiProcessed: v.boolean(),
    aiProcessedAt: v.optional(v.number()),

    // User Actions
    isRead: v.boolean(),
    isStarred: v.boolean(),
    userRepliedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_client", ["clientId"])
    .index("by_identity", ["platformIdentityId"])
    .index("by_user_unread", ["userId", "isRead"])
    .index("by_timestamp", ["timestamp"])
    .index("by_platform_message", ["platformMessageId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["userId", "clientId", "platform"],
    }),

  // ============================================
  // OAUTH TOKENS
  // ============================================

  oauth_tokens: defineTable({
    userId: v.id("users"),
    platform: v.string(),

    // Tokens (encrypted)
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),

    // Push notification state
    historyId: v.optional(v.string()),

    // Email associated with this connection (for Gmail webhook filtering)
    email: v.optional(v.string()),

    // The authenticated user's own platform user ID (e.g. Slack authed_user.id)
    // Used to identify outbound messages in webhook handlers
    platformUserId: v.optional(v.string()),

    // Slack user-level OAuth token (authed_user.access_token, xoxp-).
    // Required to read user-to-user DM history — bot tokens cannot access these.
    userAccessToken: v.optional(v.string()),

    // Metadata
    scope: v.optional(v.string()),
    createdAt: v.number(),
    lastRefreshedAt: v.optional(v.number()),
  })
    .index("by_user_platform", ["userId", "platform"])
    .index("by_platform_email", ["platform", "email"]),

  // ============================================
  // ANALYTICS & EVENTS
  // ============================================

  analytics_events: defineTable({
    userId: v.optional(v.id("users")),

    eventType: v.string(),
    eventData: v.any(),

    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_type", ["eventType"]),

  // ============================================
  // ONBOARDING STATE
  // ============================================

  onboarding_state: defineTable({
    userId: v.id("users"),

    currentStep: v.number(),
    completedSteps: v.array(v.number()),

    selectedContacts: v.optional(v.array(v.id("platform_identities"))),
    connectedPlatforms: v.array(v.string()),

    // Legacy field — present in old documents, no longer written
    discoveredContacts: v.optional(v.any()),

    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  // ============================================
  // IDENTITY LINKING PROPOSALS
  // ============================================

  identity_link_proposals: defineTable({
    userId: v.id("users"),

    identities: v.array(v.id("platform_identities")),
    status: v.string(), // "pending", "confirmed", "rejected"

    confidence: v.number(),
    matchingSignals: v.array(
      v.object({
        signal: v.string(),
        confidence: v.number(),
      })
    ),

    proposedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    clientId: v.optional(v.id("clients")),
  }).index("by_user_status", ["userId", "status"]),

  // ============================================
  // REJECTED MATCHES
  // ============================================

  rejected_identity_matches: defineTable({
    userId: v.id("users"),
    identity1: v.id("platform_identities"),
    identity2: v.id("platform_identities"),

    rejectedAt: v.number(),
    reason: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // ============================================
  // WEBHOOK IDEMPOTENCY
  // ============================================

  processed_webhooks: defineTable({
    // Unique event identifier (e.g., Gmail messageId, Slack ts, Pub/Sub messageId)
    eventId: v.string(),
    source: v.string(), // "gmail" | "slack"

    processedAt: v.number(),
    // TTL: auto-clean entries older than this
    expiresAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_expires", ["expiresAt"]),

  // ============================================
  // DEAD LETTER QUEUE
  // ============================================

  dead_letter_queue: defineTable({
    source: v.string(), // "gmail" | "slack" | "ai"
    eventType: v.string(), // "message.sync" | "ai.analysis" | etc.
    payload: v.any(),

    error: v.string(),
    attempts: v.number(),

    createdAt: v.number(),
    lastAttemptAt: v.number(),
    // Whether this has been replayed/resolved
    resolved: v.boolean(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_source", ["source", "resolved"])
    .index("by_created", ["createdAt"]),

  // ============================================
  // RATE LIMITING
  // ============================================

  rate_limits: defineTable({
    key: v.string(), // e.g. "send:userId", "ai:userId"
    timestamp: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_timestamp", ["timestamp"]),
});
