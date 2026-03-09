/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_batch from "../ai/batch.js";
import type * as ai_clientIntelligence from "../ai/clientIntelligence.js";
import type * as ai_dailyBriefing from "../ai/dailyBriefing.js";
import type * as ai_llm from "../ai/llm.js";
import type * as ai_onDemandSkills from "../ai/onDemandSkills.js";
import type * as ai_unified from "../ai/unified.js";
import type * as ai_writing_assistant from "../ai/writing_assistant.js";
import type * as analytics from "../analytics.js";
import type * as clients from "../clients.js";
import type * as commitments from "../commitments.js";
import type * as contracts from "../contracts.js";
import type * as conversationSummaries from "../conversationSummaries.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as health from "../health.js";
import type * as identities from "../identities.js";
import type * as identityProposals from "../identityProposals.js";
import type * as matching from "../matching.js";
import type * as messages from "../messages.js";
import type * as oauth from "../oauth.js";
import type * as onboarding_discord from "../onboarding/discord.js";
import type * as onboarding_gmail from "../onboarding/gmail.js";
import type * as onboarding_slack from "../onboarding/slack.js";
import type * as onboarding_state from "../onboarding/state.js";
import type * as onboarding_whatsapp from "../onboarding/whatsapp.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reminders from "../reminders.js";
import type * as retention from "../retention.js";
import type * as send_discord from "../send/discord.js";
import type * as send_gmail from "../send/gmail.js";
import type * as send_slack from "../send/slack.js";
import type * as send_whatsapp from "../send/whatsapp.js";
import type * as skillDispatcher from "../skillDispatcher.js";
import type * as skills from "../skills.js";
import type * as sync_discord from "../sync/discord.js";
import type * as sync_gmail from "../sync/gmail.js";
import type * as sync_orchestrator from "../sync/orchestrator.js";
import type * as sync_slack from "../sync/slack.js";
import type * as sync_tokenRefresh from "../sync/tokenRefresh.js";
import type * as sync_whatsapp from "../sync/whatsapp.js";
import type * as users from "../users.js";
import type * as webhookReliability from "../webhookReliability.js";
import type * as workspaceLayouts from "../workspaceLayouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/batch": typeof ai_batch;
  "ai/clientIntelligence": typeof ai_clientIntelligence;
  "ai/dailyBriefing": typeof ai_dailyBriefing;
  "ai/llm": typeof ai_llm;
  "ai/onDemandSkills": typeof ai_onDemandSkills;
  "ai/unified": typeof ai_unified;
  "ai/writing_assistant": typeof ai_writing_assistant;
  analytics: typeof analytics;
  clients: typeof clients;
  commitments: typeof commitments;
  contracts: typeof contracts;
  conversationSummaries: typeof conversationSummaries;
  conversations: typeof conversations;
  crons: typeof crons;
  health: typeof health;
  identities: typeof identities;
  identityProposals: typeof identityProposals;
  matching: typeof matching;
  messages: typeof messages;
  oauth: typeof oauth;
  "onboarding/discord": typeof onboarding_discord;
  "onboarding/gmail": typeof onboarding_gmail;
  "onboarding/slack": typeof onboarding_slack;
  "onboarding/state": typeof onboarding_state;
  "onboarding/whatsapp": typeof onboarding_whatsapp;
  rateLimit: typeof rateLimit;
  reminders: typeof reminders;
  retention: typeof retention;
  "send/discord": typeof send_discord;
  "send/gmail": typeof send_gmail;
  "send/slack": typeof send_slack;
  "send/whatsapp": typeof send_whatsapp;
  skillDispatcher: typeof skillDispatcher;
  skills: typeof skills;
  "sync/discord": typeof sync_discord;
  "sync/gmail": typeof sync_gmail;
  "sync/orchestrator": typeof sync_orchestrator;
  "sync/slack": typeof sync_slack;
  "sync/tokenRefresh": typeof sync_tokenRefresh;
  "sync/whatsapp": typeof sync_whatsapp;
  users: typeof users;
  webhookReliability: typeof webhookReliability;
  workspaceLayouts: typeof workspaceLayouts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
