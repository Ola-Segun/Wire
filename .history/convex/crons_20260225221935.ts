import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";

const crons = cronJobs();

// Sync messages from all connected platforms every 15 minutes
crons.interval(
  "sync-all-messages",
  { minutes: 15 },
  api.sync.orchestrator.syncAllUsers
);

// Process unprocessed messages through unified AI every 15 minutes
// (single API call per message instead of 3, enabling higher frequency)
crons.interval(
  "ai-batch-processing",
  { minutes: 15 },
  api.sync.orchestrator.processAiForAllUsers
);

// Refresh Gmail tokens before they expire (every 45 minutes)
crons.interval(
  "refresh-gmail-tokens",
  { minutes: 45 },
  api.sync.tokenRefresh.refreshGmailTokens
);

// Validate Slack tokens every 6 hours (detect revocations)
crons.interval(
  "validate-slack-tokens",
  { hours: 6 },
  api.sync.tokenRefresh.validateSlackTokens
);

// Clean up expired webhook idempotency records daily
crons.interval(
  "cleanup-webhook-idempotency",
  { hours: 24 },
  api.webhookReliability.cleanupExpired
);

// Clean up expired rate limit records every 10 minutes
crons.interval(
  "cleanup-rate-limits",
  { minutes: 10 },
  api.rateLimit.cleanup
);

// Renew Gmail watches daily (they expire after ~7 days)
crons.interval(
  "renew-gmail-watches",
  { hours: 24 },
  api.sync.gmail.renewWatches
);

// ============================================
// CONVERSATION & RETENTION LIFECYCLE
// ============================================

// Mark conversations as dormant after 7 days of inactivity
crons.interval(
  "mark-dormant-conversations",
  { hours: 24 },
  internal.conversations.markDormant
);

// Archive dormant conversations after 90 days
crons.interval(
  "archive-abandoned-conversations",
  { hours: 168 }, // weekly
  internal.retention.archiveAbandonedConversations
);

// Clean up old dead letter queue entries weekly
crons.interval(
  "cleanup-dead-letter-queue",
  { hours: 168 }, // weekly
  internal.retention.cleanupDeadLetterQueue
);

// Clean up old processed webhook records monthly
crons.interval(
  "cleanup-processed-webhooks",
  { hours: 720 }, // ~monthly
  internal.retention.cleanupProcessedWebhooks
);

export default crons;

