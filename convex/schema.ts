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
    lastActiveAt: v.optional(v.number()),
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

    // Client Intelligence (aggregated from message AI metadata, zero AI cost)
    intelligence: v.optional(
      v.object({
        sentimentTrend: v.optional(v.string()),
        topTopics: v.optional(v.array(v.string())),
        aggregateChurnRisk: v.optional(v.string()),
        dominantPhase: v.optional(v.string()),
        dealSignalCount: v.optional(v.number()),
        expansionSignals: v.optional(v.number()),
        contractionSignals: v.optional(v.number()),
        hiddenRequests: v.optional(v.array(v.string())),
        analyzedMessageCount: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
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
  // CONVERSATIONS (Cross-platform thread grouping)
  // Implements "Conversation Continuity Threads" from wire2.md:
  // A Discord DM, email reply, and Slack mention from the same client
  // merge into one chronological narrative regardless of platform.
  // ============================================

  conversations: defineTable({
    userId: v.id("users"),
    clientId: v.id("clients"),

    // Thread context
    subject: v.optional(v.string()),
    platforms: v.array(v.string()),           // ["gmail", "slack"] — which platforms have messages
    messageCount: v.number(),
    lastMessageAt: v.number(),
    firstMessageAt: v.number(),
    status: v.string(),                       // "active" | "dormant" | "archived"

    // Platform-specific thread references for cross-platform linking
    threadRefs: v.array(v.object({
      platform: v.string(),
      threadId: v.string(),
    })),

    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_client_status", ["clientId", "status"])
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_recent", ["userId", "lastMessageAt"]),

  // ============================================
  // MESSAGES
  // ============================================

  messages: defineTable({
    userId: v.id("users"),
    clientId: v.id("clients"),
    platformIdentityId: v.id("platform_identities"),

    // Conversation thread grouping
    conversationId: v.optional(v.id("conversations")),

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
        // Deep extraction fields (Phase 1A — multi-scale intelligence)
        dealSignal: v.optional(v.boolean()),           // Client signaling agreement/purchase intent
        churnRisk: v.optional(v.string()),             // "none" | "low" | "medium" | "high"
        projectPhase: v.optional(v.string()),          // "discovery" | "negotiation" | "active" | "delivery" | "closing" | "dormant"
        hiddenRequests: v.optional(v.array(v.string())), // Implied but not explicitly stated asks
        valueSignal: v.optional(v.string()),           // "expansion" | "stable" | "contraction" | null
        clientIntent: v.optional(v.string()),          // "requesting" | "approving" | "rejecting" | "informing" | "escalating"
        // Temporal extraction — actions paired with AI-resolved due dates
        extractedActionsWithDates: v.optional(v.array(v.object({
          text: v.string(),
          dueDateIso: v.optional(v.string()),      // "YYYY-MM-DD" | "relative:today" | "relative:tomorrow" | "relative:next_week" | null
          dueTimeOfDay: v.optional(v.string()),    // "morning"|"afternoon"|"evening"|"end_of_day"|"HH:MM" | null
          confidence: v.string(),                  // "explicit" | "inferred" | "none"
          resolvedTimestamp: v.optional(v.number()), // Epoch ms resolved from dueDateIso + message timestamp
        }))),
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
    .index("by_conversation", ["conversationId"])
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

  // ============================================
  // COMMITMENTS (Extracted action items / deadlines)
  // Implements "Commitment Tracker" from wire2.md:
  // AI extracts "send revised logo by Thursday" → tracked task.
  // Foundation laid now; AI extraction wiring comes in AI phase.
  // ============================================

  commitments: defineTable({
    userId: v.id("users"),
    clientId: v.id("clients"),
    conversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.optional(v.id("messages")), // Optional: system-generated check-ins have no source message

    text: v.string(),                         // "Send revised logo by Thursday"
    type: v.string(),                         // "deadline" | "deliverable" | "payment" | "meeting" | "check_in"
    status: v.string(),                       // "pending" | "completed" | "overdue" | "cancelled"
    dueDate: v.optional(v.number()),
    dueDateConfidence: v.optional(v.string()), // "explicit" | "inferred" — how certain the due date is
    // Time-of-day hint from AI extraction — persisted here so calendar/agenda can surface it
    dueTimeOfDay: v.optional(v.string()),     // "morning" | "afternoon" | "evening" | "end_of_day" | "HH:MM"
    // Recurrence support for weekly check-ins and recurring deliverables
    recurrencePattern: v.optional(v.string()), // "weekly" | "monthly" | null
    recurrenceEndDate: v.optional(v.number()),  // epoch ms — when recurrence stops
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    // Convex scheduler job IDs — stored so reminders can be cancelled when commitment is resolved
    schedulerJobIds: v.optional(v.array(v.string())),
  })
    .index("by_user", ["userId"])
    .index("by_client", ["clientId"])
    .index("by_status", ["userId", "status"])
    .index("by_conversation", ["conversationId"])
    // Calendar range queries: filter by user + sort by due date
    .index("by_user_due", ["userId", "dueDate"]),

  // ============================================
  // CONTRACTS / SOWs
  // Foundation for "Scope Guardian" from wire2.md:
  // Stores contract deliverables so AI can detect scope creep.
  // ============================================

  contracts: defineTable({
    userId: v.id("users"),
    clientId: v.id("clients"),

    title: v.string(),
    description: v.optional(v.string()),
    deliverables: v.array(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.string(),                       // "active" | "completed" | "expired"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_user", ["userId"])
    .index("by_status", ["userId", "status"]),

  // ============================================
  // AI SKILLS — User-controllable AI capabilities
  // Each skill is a modular intelligence module (Scope Guardian,
  // Ghosting Detector, Smart Replies, etc.) that users toggle on/off.
  // ============================================

  user_skills: defineTable({
    userId: v.id("users"),
    skillSlug: v.string(),           // "scope_guardian", "ghosting_detector", etc.
    enabled: v.boolean(),
    config: v.optional(v.any()),     // Skill-specific settings (sensitivity, thresholds)
    clientScope: v.optional(v.array(v.id("clients"))), // null = all clients
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_skill", ["userId", "skillSlug"]),

  // ============================================
  // SKILL OUTPUTS — Intelligence produced by skills
  // Alerts, insights, suggestions, and digests that appear
  // in notifications, the Workspace dashboard, and client pages.
  // ============================================

  skill_outputs: defineTable({
    userId: v.id("users"),
    skillSlug: v.string(),
    clientId: v.optional(v.id("clients")),
    messageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),

    type: v.string(),                // "alert" | "insight" | "suggestion" | "digest"
    severity: v.optional(v.string()), // "critical" | "warning" | "info"
    title: v.string(),
    content: v.string(),
    metadata: v.optional(v.any()),   // Structured data specific to the skill
    actionable: v.boolean(),         // Can the user act on this?

    isRead: v.boolean(),
    isDismissed: v.boolean(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_unread", ["userId", "isRead"])
    .index("by_user_skill", ["userId", "skillSlug"])
    .index("by_client", ["clientId"])
    .index("by_expires", ["expiresAt"]),

  // ============================================
  // WORKSPACE LAYOUTS — User-customizable Bento grid dashboards
  // Users compose widgets into saved layouts ("Morning Focus",
  // "Revenue View", "Custom"). Stored as JSON widget arrays.
  // ============================================

  workspace_layouts: defineTable({
    userId: v.id("users"),
    name: v.string(),                // "Overview", "Focus Mode", "Intelligence"
    isDefault: v.boolean(),
    widgets: v.array(v.object({
      id: v.string(),                // Unique within layout (e.g., "stat-unread-1")
      type: v.string(),              // Widget type slug ("stat_card", "priority_inbox", etc.)
      size: v.string(),              // "1x1" | "2x1" | "1x2" | "2x2" — bento grid span
      config: v.optional(v.any()),   // Widget-specific settings (metric, client filter, etc.)
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // ============================================
  // CONVERSATION AI SUMMARIES
  // Thread-level intelligence: summaries, arc detection,
  // open items, decisions made — Scale 2 analysis.
  // ============================================

  conversation_summaries: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    clientId: v.id("clients"),

    summary: v.string(),
    arc: v.string(),                 // "stable" | "escalating" | "resolving" | "stalling"
    openCommitments: v.number(),
    decisionsMade: v.array(v.string()),
    unresolvedTopics: v.array(v.string()),
    toneShift: v.optional(v.string()), // e.g., "neutral->frustrated"
    messageCount: v.number(),        // How many messages were analyzed

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_client", ["clientId"])
    .index("by_user", ["userId"]),
});
