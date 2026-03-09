# Wire AI Features — Comprehensive Analysis

## Part 1: Implemented AI Features

### 1. Unified Message Analysis (`convex/ai/unified.ts`)

The core AI engine runs a **single API call per message** producing 6 outputs simultaneously:

| Output | Details |
|--------|---------|
| **Priority Score** | 0–100, maps to urgent/high/normal/low |
| **Sentiment** | positive / neutral / negative / frustrated |
| **Action Extraction** | Concrete action items parsed from natural language → auto-persisted as `commitments` records |
| **Scope Creep Detection** | Boolean flag when request appears outside agreed work |
| **Topics** | 1–3 word theme extraction (up to 5) |
| **Urgency Label** | Derived from score + keyword signals |

**Engineering Highlights:**

- **Intelligent model routing**: Short (<280 chars), non-urgent messages → Claude Haiku (10× cheaper). Complex/long/urgent → Claude Sonnet
- **Prompt caching**: System prompt uses `cache_control: ephemeral` — saves ~90% of system-prompt tokens across all calls
- **Rate limiting**: Hard cap of 30 AI analyses/user/minute — guarded against large sync floods
- **Dead Letter Queue**: Failed analyses are captured in `webhookReliability` DLQ for manual retry
- **Guard chain**: skips already-processed, outbound, trivially short messages

---

### 2. Batch Processing (`convex/ai/batch.ts` + `unified.analyzeBatch`)

- Processes up to 50 unanalyzed messages per cron cycle
- Concurrency limit of **5 parallel analyses** to respect rate limits
- Returns `{ processed, errors, total }` — error-tolerant via `Promise.allSettled`

---

### 3. Writing Assistant (`convex/ai/writing_assistant.ts`)

Runs on draft replies in the composer — **1 API call → 4 dimensions:**

| Feature | What It Does |
|---------|-------------|
| **Tone Analysis** | Primary tone, intensity (0.0–1.0), secondary tones, appropriateness rating |
| **Clarity Scoring** | 0–100 score, issue list, readability grade, simplification suggestions |
| **Grammar Check** | Error-by-error breakdown with severity (critical/important/minor) |
| **Formality Matching** | Current level (1–5) vs. recommended level for this client |

**Plus three rewrite actions:**

- `rewriteWithTone` — rewrites draft to a target tone (professional, casual, etc.)
- `adjustFormality` — shifts formality level on a 1–5 scale
- `simplifyClarify` — removes wordiness, breaks complex sentences, enforces active voice

---

### 4. Commitment Tracking (inside `unified.analyzeMessage`)

When action items are extracted, they are automatically persisted via `internal.commitments.createFromExtractedActions` — linking the commitment to the user, client, conversation, and source message. This is the backend foundation of a commitment tracker.

---

## Part 2: Analysis of Extras Documents

The Extras folder contains 4 strategic planning documents covering what was originally envisioned. Cross-referencing against what's built:

### What's Built vs. What's Planned

| Feature | Planned in Extras | Currently Built |
|---------|-------------------|-----------------|
| Priority scoring | ✅ | ✅ Done |
| Sentiment analysis | ✅ | ✅ Done |
| Action item extraction | ✅ | ✅ Done (with DB persistence) |
| Scope creep detection | ✅ | ✅ Done (boolean flag) |
| Writing assistant / tone adjust | ✅ | ✅ Done |
| Batch AI processing | ✅ | ✅ Done |
| **Semantic/vector search** | ✅ (Pinecone/Weaviate mentioned) | ❌ Not built |
| **Relationship Health Score** | ✅ (detailed spec) | ❌ Not built |
| **Smart reply suggestions** | ✅ | ❌ Not built |
| **Ghosting detector** | ✅ | ❌ Not built |
| **Daily briefing / digest** | ✅ | ❌ Not built |
| **Voice note transcription** | ✅ (Whisper) | ❌ Not built |
| **Lead qualification bot** | ✅ | ❌ Not built |
| **Client persona / style profile** | ✅ (tone matching per client) | ❌ Not built |
| **Payment sentinel / invoice trigger** | ✅ | ❌ Not built |
| **Send-time optimization** | ✅ | ❌ Not built |
| **Emotion trajectory mapping** | ✅ (trend lines) | ❌ Not built (only per-message) |
| **Scope Guardian (contract vs. chat)** | ✅ | ❌ Partial (detection only, no contract comparison) |

---

## Part 3: AI Features That Can Be Implemented

Grouped by implementation complexity and business value:

---

### Tier 1 — High Value, Buildable on Existing Stack

#### A. Smart Reply Suggestions

When viewing a message, show 2–3 AI-generated reply options before the composer opens.

```
"Are you free Tuesday?" → [
  "Yes, I'm available Tuesday afternoon!",
  "Tuesday at 2pm works — I'll send a calendar invite",
  "I'm tied up Tuesday but Wednesday opens up"
]
```

Uses existing `analyzeMessage` context + a new `generateReplySuggestions` action. Claude already has client name, sentiment, and topics — add reply generation in the same call or a follow-up.

---

#### B. Relationship Health Score (RHS)

A per-client score (0–100) derived from:

- Response latency trend (getting slower = bad)
- Sentiment trajectory (3-message rolling average)
- Engagement symmetry (who initiates contact more)
- Message volume trend (going quiet = churn signal)
- Scope creep frequency

Stored as a Convex field on `clients`. Updated via cron after each new message. Displayed as a health indicator on the client list/detail page.

---

#### C. Ghosting Detector

Compare each client's average response time (historical) vs. current silence duration. If a normally-responsive client has been quiet for 2× their average, trigger a notification:

> *"Sarah hasn't replied in 18 hrs — she usually responds within 4 hrs. Send a follow-up?"*

Implementable as a cron job querying `messages` table for last-sent-by-client timestamps.

---

#### D. Commitment Tracker UI

The backend already creates `commitments` records from extracted actions. What's missing is:

- A UI panel on the client detail page listing open commitments
- Status toggles (pending / done / overdue)
- Due date extraction from the action text (e.g., "send by Friday")

---

#### E. Emotion/Sentiment Trajectory

Currently sentiment is per-message (single data point). Extend to compute a **rolling 5-message sentiment trend** per client and store it. Surface as a micro chart on client cards showing "getting better / stable / deteriorating."

---

### Tier 2 — Medium Complexity, High Differentiation

#### F. RAG-Powered Conversational Q&A

Allow freelancers to ask natural language questions about their own history:

- *"What did the client say about the deadline in January?"*
- *"Has this client ever mentioned budget concerns?"*
- *"Find all scope change requests from ClientX"*

Requires a vector store (Convex doesn't have native embeddings yet — use **Convex + Pinecone** or wait for Convex's planned vector support). Generate embeddings on message insert, retrieve top-k on query, pass to Claude with RAG prompt.

---

#### G. Daily Morning Briefing

A generated digest at 8 AM per user:

```
You have 3 urgent messages across 2 clients.
— Sarah (Acme Corp): Waiting on invoice response (48hrs)
— Mike (StartupXYZ): New scope request flagged
2 commitments due today.
Optimal reply window: 10am–12pm (highest client activity).
```

Implementable as a Convex cron action + Claude generation. Deliver via in-app notification (already have `sonner` toasts) or email.

---

#### H. Client Style Profile

After analyzing enough messages from/to a client, build a stored profile:

```
{
  preferredFormality: 4,
  avgResponseTimePreference: "within 2 hours",
  communicationStyle: "direct, bullet-point",
  triggersPositiveSentiment: ["quick updates", "detailed explanations"],
  emotionalPattern: "formal → relaxed after project starts"
}
```

This feeds the writing assistant to auto-suggest the right formality/tone without manual selection.

---

#### I. Scope Guardian (Contract-Aware)

Currently scope creep is a boolean flag per message with no contract baseline. Extend by:

1. Letting users paste/upload their SOW (Statement of Work) during onboarding
2. Storing it as a `contracts` record with embedded key deliverables
3. When scope creep is detected, show *which clause* is being exceeded and suggest a response template

---

### Tier 3 — Advanced / Future Differentiation

#### J. Send-Time Optimization

Track when each client opens/responds to messages. Build a per-client "responsiveness heatmap" (hour × day of week). When composing a reply, show: *"Best time to send: Tuesday 10am — John is 85% likely to respond within 1 hour."*

---

#### K. Revenue Signal Detection

Train a classifier to detect high-value signals in conversations:

- Budget expansion signals: *"we may need more pages"*, *"budget increased"*
- Churn signals: *"we're evaluating alternatives"*, *"my manager wants to review"*
- Upsell opportunities: *"can you also handle X?"*

Surface these as highlighted alerts on the client timeline.

---

#### L. Cross-Platform Conflict Detection

If a client said "deliver by Thursday" in Gmail and "no rush, end of month" in Slack — detect the contradiction and surface it. Requires cross-message comparison with semantic similarity, feasible with embeddings.

---

#### M. Proactive Re-engagement Suggestions

After a project ends, AI generates a "relationship maintenance" schedule:

- Day 30: *"Check-in — how's the site performing?"*
- Day 90: *"Portfolio request + upsell"*
- Day 180: *"Annual retainer pitch"*

With pre-drafted message templates ready to send in one click.

---

## Summary: Priority Roadmap

```
IMMEDIATE (builds on existing infra):
├── Smart reply suggestions         ← 1 new action, high UX impact
├── Commitment Tracker UI           ← backend exists, just needs UI
├── Sentiment trajectory            ← extend existing per-message data
└── Ghosting detector               ← cron + timestamp comparison

SHORT-TERM (new data structures):
├── Relationship Health Score       ← new client field + cron computation
├── Client Style Profile            ← new table, feeds writing assistant
├── Daily briefing                  ← cron + Claude generation + notification
└── Scope Guardian upgrade          ← contracts table + comparison logic

LONG-TERM (infrastructure investment):
├── RAG / Semantic search           ← vector DB integration
├── Send-time optimization          ← behavioral data collection first
├── Revenue signal detection        ← fine-tuned classifier
└── Proactive re-engagement         ← scheduling + template generation
```

---

## Key Takeaways

The foundation is solid — the Anthropic integration, prompt caching, model routing, rate limiting, and batch processing are all production-grade. The gap is primarily in **higher-level intelligence features** (relationship health, conversational Q&A, proactive suggestions) and **UI surfaces** that expose the already-computed data (commitments, sentiment trends).

---

# Wire Strategies — AI Strategy Validation Analysis

## Document Overview

The file presents two layered analyses:

1. A conceptual breakdown of AI use cases for a freelancer communication OS
2. A technical implementation architecture with stack recommendations and agent frameworks

It is well-reasoned as a planning document but was written **before Wire's actual stack was chosen**. The core AI concepts are valid — the implementation prescriptions are often wrong for Wire's architecture but have direct equivalents that are superior.

---

## Strategy-by-Strategy Validation

### Layer 1: Memory Layer (Organizing & Context)

#### Auto-Tagging & Categorization

**Document proposes:** AI tags messages as "Urgent," "Billing Issue," "Project Update"  
**Current Wire state:** ✅ **Already implemented and exceeded**

`unified.ts` extracts `topics[]`, `urgency` label, and `sentiment` per message via AI. The schema's `aiMetadata` field stores this on every message. The document's proposed feature is fully live.

**Verdict: Done. No action needed.**

---

#### Conversation TL;DR Summaries

**Document proposes:** After a week of silence, show a summary of the last 5 messages  
**Current Wire state:** ❌ Not built

**Implementability: HIGH.** Wire already has:

- `conversations` table with `messageCount`, `lastMessageAt`, `platforms[]`
- `messages` queryable by `conversationId`
- Claude already integrated

No new infrastructure required. A new Convex action `ai/summarize.ts` calling Claude with the last N messages of a conversation is sufficient. The document suggests this as complex — it is not in Wire's stack. One action, ~40 lines.

**Verdict: Directly implementable. High value, low effort.**

---

#### Contextual/Semantic Search

**Document proposes:** Vector DB (Pinecone/Weaviate/Milvus) → embeddings → semantic search  
**Current Wire state:** ❌ Not built

**Implementability: MEDIUM — requires new infrastructure.**

The document's technical approach (vector DB) is correct in principle. The gap is that Convex has no native vector support yet. Wire would need to integrate Pinecone or a similar service as a sidecar. Every message insert would trigger an embedding API call and a Pinecone upsert.

**However:** There is a simpler interim approach specific to Wire's use case. Since Wire already has `topics[]` extracted per message, a "poor man's semantic search" is possible by matching against topic arrays and using Claude's context window to reason over the top results. Full vector search is a Phase 2 investment, not Phase 1.

**Verdict: Valid concept, correct infrastructure prescription. Not directly implementable without Pinecone integration. An interim approach exists using extracted topics + Claude reasoning.**

---

#### Relationship Health Alerts

**Document proposes:** Alert "Client seems unhappy — suggest apologize and offer quick fix"  
**Current Wire state:** ✅ PARTIALLY — schema exists, health.ts computes it, analytics.ts surfaces it

**Critical finding:** The `clients` schema already has:

```
relationshipHealth: v.optional(v.number()),
communicationPattern: v.optional(v.object({
  preferredPlatform, activeHours, responseSpeed
}))
```

And `analytics.ts` already does:

```typescript
const needsAttention = clients.filter(c => c.relationshipHealth < 50);
```

What's **missing** is the AI-driven health *computation* and the proactive alert. The field exists and is queried — but the AI layer that writes to it intelligently (sentiment trajectory, response time degradation, silence detection) isn't wired up yet.

**Verdict: Partially done structurally. The AI computation layer is the missing piece, and it can be built entirely within Wire's existing Convex + Claude stack.**

---

### Layer 2: Drafting Layer (Speed & Communication)

#### Smart Compose (Style-based autocomplete)

**Document proposes:** AI suggests next sentence based on past writing style  
**Current Wire state:** ✅ PARTIALLY — `rewriteWithTone`, `adjustFormality`, `simplifyClarify` exist

The document describes inline autocomplete (real-time suggestion as you type). Wire's writing assistant works as a post-draft analysis tool, not a real-time autocomplete. Real-time autocomplete would require:

- Debounced API calls as the user types
- A new action: `generateCompletion(draftSoFar, clientContext)` → next sentence

**Verdict: The foundation is built. Real-time autocomplete is one new action + frontend debounce integration. Valid and implementable.**

---

#### Tone Adjuster

**Document proposes:** Rewrite "hey, send the file" to a professional version  
**Current Wire state:** ✅ **Already implemented**

`rewriteWithTone`, `adjustFormality`, and `simplifyClarify` are all live in `writing_assistant.ts`. This is fully done.

**Verdict: Done.**

---

#### Multi-Language Translation

**Document proposes:** NLLB/M2M100 specialized translation models  
**Current Wire state:** ❌ Not built

**Implementability: HIGH — and the document's technical prescription is wrong for Wire.**

The document recommends NLLB (Meta's open-source model) or M2M100 — both require Python deployment and model hosting. Wire uses Claude, which handles translation natively and at high quality. The correct approach for Wire:

```typescript
// No new model needed — just a new action in writing_assistant.ts
export const translateMessage = action({
  args: { text: v.string(), targetLanguage: v.string() },
  handler: async (ctx, args) => {
    // Prompt Claude to translate — no external service required
  }
});
```

**Verdict: The concept is valid but the technical prescription (NLLB/M2M100) is wrong for Wire. Claude does this natively. Very implementable.**

---

#### Voice Note Transcription (Whisper)

**Document proposes:** Transcribe WhatsApp/Slack voice notes to text  
**Current Wire state:** ❌ Not built

**Implementability: MEDIUM — requires Whisper API or Claude Audio.**

The document correctly identifies Whisper as the right tool. Wire would need:

1. Attachment extraction (schema already has `attachments[]` with `type`, `url`, `filename`)
2. Pass audio URL to Whisper API or use Claude's audio input capability
3. Store transcript alongside the message

The schema infrastructure partially exists (attachments are stored). The API integration is new but straightforward.

**Verdict: Valid concept, correct tool prescription. Implementable with Whisper API addition. The document is right on this one.**

---

### Layer 3: Autonomous Agent Layer

#### Lead Qualification Bot (State Machine)

**Document proposes:** When a new lead messages, AI asks qualification questions (budget, timeline, project scope). State machine: NEW → ASKING → QUALIFIED → CLOSING.  
**Current Wire state:** ❌ Not built — and this needs conceptual re-evaluation for Wire

**The document's lead qualification state machine is well-designed but mismatches Wire's current product model.** Wire manages *existing linked clients*, not inbound leads from unknown senders. The platform identities system is explicit: you link known contacts, you control whose messages appear.

However, there is a valid Wire-specific interpretation: **an "intake mode" for unlinked identities**. When a message arrives from an unlinked identity (someone not yet a client), Wire could run a lightweight qualification prompt to help the freelancer decide whether to link them. This adapts the concept without requiring a full "leads" module.

The state machine approach itself (NEW → QUALIFYING → QUALIFIED) is correct architecture for Convex — store state on the `platform_identities` record and transition it via mutations.

**Verdict: Core concept valid, but the product fit needs adaptation. A "smart intake" feature for unlinked identities would fit Wire better than a traditional lead qualification pipeline. The state machine architecture is implementable in Convex.**

---

#### Scheduling Assistant

**Document proposes:** Parse "Are you free Tuesday?" → check calendar → send Calendly link  
**Current Wire state:** ❌ Not built

**Implementability: LOW currently — requires new OAuth scope.**

Wire already has Google OAuth for Gmail. Adding Google Calendar API access requires:

1. Expanding OAuth scopes to include `calendar.readonly`
2. A new Convex action to fetch free/busy slots
3. A new action to detect scheduling intent in messages

The document's approach is valid. The technical dependency is real — Calendar API expansion is non-trivial. The commitment extraction in `unified.ts` already detects "meeting" type actions, which is the foundation for this.

**Verdict: Valid concept. Partially blocked by OAuth scope expansion. Calendar integration is the prerequisite — feasible but a medium-sized addition.**

---

#### Invoice Trigger

**Document proposes:** Detect "Okay, let's do it" → auto-generate invoice / Stripe link  
**Current Wire state:** ❌ Not built

**Implementability: LOW — requires Stripe integration (major new module).**

The AI signal detection part is feasible (Claude can detect deal-closing intent in messages). But Wire has no payment processing, invoicing, or Stripe integration. This is a significant product scope expansion beyond communication management.

**However**, a lighter version fits Wire today: detect deal-closing signals and surface a **"Client agreed — ready to invoice?"** notification with a link to the user's preferred invoicing tool (Stripe, FreshBooks, Wave). This requires:

1. A new intent classifier in `unified.ts` (`dealClosed: boolean`)
2. A notification trigger
3. No payment infrastructure needed

**Verdict: The full feature requires Stripe integration (out of scope). A lighter "deal signal alert" is implementable now within Wire's existing AI pipeline by adding one new field to the unified analysis schema.**

---

### Layer 4: Analytics Layer (Business Intelligence)

#### Revenue Leakage Detection

**Document proposes:** Find promises of payment that were never fulfilled  
**Current Wire state:** ✅ FOUNDATION EXISTS — **This is the most underappreciated insight in the document**

Wire's `commitments.ts` already has:

- `type: "payment"` on commitments
- `status: "pending" | "completed" | "cancelled"`
- `dueDate` field
- `getPending` query that already detects overdue items

The AI in `unified.ts` extracts payment-related action items. The schema, mutations, and queries are **already built**. What's missing is:

1. A cron that scans overdue payment-type commitments and surfaces them
2. A UI panel showing "Revenue at risk" commitments

**Verdict: Nearly free to implement. The document identifies a real problem; Wire has accidentally already built the data infrastructure for it. This is the highest ROI feature to implement next.**

---

#### Hour Logging

**Document proposes:** Estimate time spent from chat context → log to Toggl/Clockify  
**Current Wire state:** ❌ Not built

**Implementability: LOW currently — requires Toggl/Clockify API integration.**

The concept is interesting but requires external time-tracking API integration. Wire could offer a lightweight internal time tracking stub before full Toggl integration. Low priority relative to other features.

**Verdict: Valid but requires external API dependency. Defer.**

---

#### Pricing Intelligence

**Document proposes:** Analyze what clients are willing to pay from chat history  
**Current Wire state:** ❌ Not built

**Implementability: LOW — requires sufficient data volume to be meaningful.**

This feature is only useful after accumulating significant conversation data per user. It requires cross-client analysis (comparing rates discussed across all clients) which raises privacy/isolation concerns per Wire's architecture. The `clients.totalRevenue` field exists but is not sufficient for pricing intelligence.

**Verdict: Premature for Wire's current stage. Revisit at scale.**

---

## Technical Architecture Validation

The document's technical stack recommendations are the most problematic part:

| Document Recommends | Assessment for Wire | Wire's Correct Equivalent |
|---------------------|--------------------|-----------------------------|
| Python + FastAPI backend | ❌ Wrong — Wire is TypeScript-first | Convex actions (`"use node"`) |
| PostgreSQL | ❌ Redundant — Wire uses Convex | Convex DB (already better for real-time) |
| Redis + RabbitMQ message queue | ❌ Redundant | Convex `ctx.scheduler.runAfter()` |
| LangChain / LangGraph agents | ❌ Not needed — adds Python dependency | Convex actions + Anthropic SDK directly |
| AutoGen multi-agent | ❌ Heavy, Python-only | Parallel Convex action dispatches |
| Auth0 / Supabase Auth | ❌ Redundant | Clerk (already better) |
| Pinecone/Weaviate for vectors | ✅ **Correct — only valid new infra gap** | Pinecone as sidecar service |
| NLLB/M2M100 for translation | ❌ Wrong for Wire | Claude's native translation |
| Whisper for voice | ✅ **Correct** | Whisper API via Convex action |
| Fine-tuned BERT for sentiment | ❌ Overkill | Claude already outperforms BERT |

**The document was architected for a Python-first stack with a dedicated AI service layer.** Wire made a different — and largely better — choice: TypeScript throughout with Convex as the backend. Convex's scheduler replaces Redis/RabbitMQ. Convex actions with `"use node"` replace FastAPI. The Anthropic SDK replaces LangChain for 90% of use cases.

The **only two infrastructure gaps** where the document's prescriptions are actually correct for Wire:

1. **Pinecone** (or equivalent) for vector/semantic search
2. **Whisper API** for voice note transcription

Everything else Claude handles natively.

---

## Agent Framework Recommendation

The document evaluates LangChain, LangGraph, AutoGen, and CrewAI. **None of these are appropriate for Wire.** Wire already has a native agent architecture:

```
Convex Cron → Convex Action (analyzeMessage) → Claude API → Convex Mutation (persist)
         ↓                                                          ↓
   Convex Scheduler                                        Real-time WebSocket push
```

This is functionally a distributed agent pipeline. Adding LangChain on top would add Python dependency, latency, cost, and complexity for zero benefit. The document's agent framework analysis is useful as a conceptual reference but should not be implemented in Wire.

---

## Consolidated Verdict

### What the document gets right

- The four-layer taxonomy (Memory / Drafting / Agent / Analytics) is a sound mental model
- Identifying semantic search + vector DB as a real gap
- Whisper for voice transcription
- The state machine pattern for multi-step AI workflows
- Revenue leakage as a high-value, low-effort win
- Relationship health monitoring importance

### What the document gets wrong for Wire

- Python/LangChain/PostgreSQL stack prescription — contradicts Wire's superior TypeScript/Convex architecture
- Specialized models (NLLB, BERT) — Claude does this better without new infrastructure
- Lead qualification as a product feature — doesn't fit Wire's client-first model without adaptation
- Invoice trigger as an immediate feature — requires Stripe integration first
- Over-engineering the agent framework — Convex scheduler already handles this

### Implementation Priority (Mapped to Wire's Stack)

| Feature from Document | Wire Effort | Infra Needed | Priority |
|-----------------------|-------------|--------------|----------|
| Revenue leakage alerts (commitments scan) | LOW | None — already built | **P0** |
| Conversation TL;DR summaries | LOW | None | **P0** |
| Relationship health AI computation | MEDIUM | None | **P1** |
| Deal-closing signal detection | LOW | None — extend unified.ts | **P1** |
| Smart reply suggestions | LOW | None | **P1** |
| Translation (via Claude) | LOW | None | **P2** |
| Inline smart compose | MEDIUM | None | **P2** |
| Voice transcription | MEDIUM | Whisper API | **P2** |
| Semantic search | HIGH | Pinecone integration | **P3** |
| Scheduling assistant | HIGH | Google Calendar OAuth | **P3** |
| Full invoice trigger | VERY HIGH | Stripe integration | **Defer** |

---

## Final Summary

The document's strategic instincts are sound. Its technical prescriptions need Wire-specific translation — which is largely already done by Wire's existing architecture. The highest-value unimplemented features are all buildable within the current Convex + Claude stack without adding any new infrastructure dependencies.

---

# Wire Strategic Upgrade Plan: Dynamic AI, Skills, and Dashboard

## The Core Thesis

Wire currently runs AI as a **static pipeline**: message arrives → analyze → store metadata → display. This is a first-generation approach. What you're describing — dynamic, productive, extracting invisible data — requires AI to become an **operating system layer** that works at multiple scales, adapts to each client relationship, and gives users control over what intelligence they receive.

Three interconnected upgrades make this happen:

---

## I. Deepening the AI Intelligence Layer

### Problem with current approach

The unified analysis in `unified.ts` extracts 6 fields per message: priority, urgency, sentiment, actions, scope creep, topics. This is **message-level** analysis only. Conversations, client relationships, and your entire portfolio contain vastly more signal that's currently invisible.

### The multi-scale analysis model

Wire's AI should operate at **four scales**, each revealing different invisible data:

| Scale | Frequency | Example Question | Insights |
|-------|-----------|-----------------|----------|
| **Scale 4: Portfolio** | Daily cron | "Which clients take 40% of my time but generate 10% of revenue?" | Cross-client patterns, workload distribution, revenue risk |
| **Scale 3: Client** | Every 4-8 hours | "Sarah's communication style changed this week" | Style profiles, sentiment trajectory, ghosting, churn risk |
| **Scale 2: Conversation** | On update (3+ messages) | "This thread is escalating toward a scope dispute" | Thread summaries, arc detection, commitment tracking |
| **Scale 1: Message** | On arrival (CURRENT) | "This message is urgent, negative sentiment, has 2 action items" | Priority, sentiment, actions, topics, scope creep |

### Scale 1 upgrade: Richer message analysis (zero-cost)

Extend the existing `unified.ts` prompt to extract additional fields without a second API call. Same Claude call, richer output:

| Current Output | ADD These Fields |
|----------------|------------------|
| priorityScore | dealSignal: boolean |
| urgency | churnRisk: "none"\|"low"\|"medium"\|"high" |
| sentiment | projectPhase: "discovery"\|"active"\|"delivery"\|"closing" |
| extractedActions | hiddenRequests: string[] |
| scopeCreepDetected | valueSignal: "expansion"\|"stable"\|"contraction"\|null |
| topics | clientIntent: "requesting"\|"approving"\|"rejecting"\|"informing" |

This adds 5 new dimensions of invisible data extraction at literally zero additional cost — same API call, same latency, same token budget (the response grows by ~50 tokens).

**What this unlocks:**

- `dealSignal` → Revenue detection ("let's proceed", "send invoice")
- `churnRisk` → Early warning ("exploring alternatives", going cold)
- `projectPhase` → Lifecycle awareness (adapt behavior per phase)
- `hiddenRequests` → Things implied but not stated ("it would be nice if..." = request)
- `valueSignal` → Budget direction (expanding scope vs. tightening)
- `clientIntent` → What the client is actually doing in this message

---

### Scale 2: Conversation-level analysis (new)

When a conversation accumulates 3+ messages, run a lightweight analysis that captures what individual messages cannot:

```
Conversation analysis output:
{
  summary: "Client requested logo redesign, approved color palette, 
            now asking for additional animations not in original scope",
  arc: "escalating",          // "stable" | "escalating" | "resolving" | "stalling"
  openCommitments: 2,
  decisionsMade: ["approved blue palette", "deadline moved to Friday"],
  unresolvedTopics: ["animation scope", "final pricing"],
  toneShift: "neutral→frustrated"  // detected emotional trajectory across thread
}
```

**Trigger:** Run when a conversation gets a new message AND has 3+ messages AND hasn't been analyzed in the last hour. This avoids over-processing while keeping summaries fresh.

**Implementation:** A new Convex action `ai/conversationAnalysis.ts` that fetches the last N messages of a conversation, passes them to Claude with a conversation-specific system prompt, and stores the result on the `conversations` table as a new `aiSummary` field.

---

### Scale 3: Client-level intelligence (new)

Run every 4–8 hours via the existing health cron cycle. This builds a **living profile** of each client that evolves over time:

```
Client intelligence output:
{
  communicationStyle: {
    formality: 4,              // 1-5 scale
    responseExpectation: "within 2 hours",
    preferredLength: "concise",
    decisionPattern: "needs manager approval",
    bestContactTimes: ["tue-thu 10am-12pm"],
  },
  sentimentTrajectory: [65, 60, 45, 40],   // last 4 analysis windows
  engagementTrend: "declining",             // "growing"|"stable"|"declining"
  churnProbability: 0.35,                   // based on pattern analysis
  revenueRelationship: {
    contractValue: 5000,
    commitmentsFulfilled: 8,
    commitmentsOverdue: 2,
    estimatedLifetimeValue: 15000,
  },
  silenceDuration: 48,                      // hours since last client message
  normalResponseTime: 4,                    // hours (their baseline)
  isGhosting: true,                         // silence > 3x normal
}
```

**This is where the really invisible data lives.** Individual messages can't tell you that Sarah's enthusiasm has been declining for two weeks, or that this client always needs manager approval before committing, or that they respond fastest on Tuesday mornings. Only accumulated analysis across many messages reveals these patterns.

**Implementation:** A new `ai/clientIntelligence.ts` action. Run from the existing `recalculateAll` cron or add a dedicated cron. Uses the last 50 messages for a client, the contracts table, the commitments table, and the client record to build the profile. Store on the `clients` table in an expanded `communicationPattern` field (which already exists in schema but is underutilized).

---

### Scale 4: Portfolio analysis (new, daily)

One daily analysis across all clients for the user:

```
Portfolio intelligence:
{
  workloadDistribution: [
    { client: "Sarah", timeShare: 0.4, revenueShare: 0.1, efficiency: "low" },
    { client: "Mike", timeShare: 0.2, revenueShare: 0.5, efficiency: "high" },
  ],
  riskClients: ["Sarah"],        // declining health + high message volume
  upsellOpportunities: ["Mike"], // expansion signals detected
  overdueCommitments: 3,
  revenueAtRisk: 5000,           // from at-risk clients' contract values
  dailyPriorities: [
    "Reply to Sarah's scope concern (18hr old, frustrated)",
    "Follow up on Mike's expansion signal",
    "2 commitments due today",
  ],
}
```

This is the **Daily Briefing** — the "morning standup" that tells the freelancer exactly what matters today. It feeds directly into a dashboard widget and/or a notification.

---

## II. The Skills System

### What a Skill is

A Skill is a **user-controllable AI capability** with a clear purpose. It is the interface between the freelancer and Wire's intelligence layer. The freelancer doesn't think about "AI pipelines" — they think about abilities their tool has:

> "I turned on Scope Guardian for my enterprise clients."  
> "The Ghosting Detector just flagged Sarah."  
> "I use Smart Replies for quick messages but not for formal clients."

### Skill architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SKILL REGISTRY                            │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │  Scope Guardian  │  │ Ghosting Detect │  │ Smart Replies  │  │
│  │  trigger: msg    │  │ trigger: cron   │  │ trigger: view  │  │
│  │  scope: client   │  │ scope: client   │  │ scope: message │  │
│  │  output: alert   │  │ output: alert   │  │ output: action │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ Payment Sentinel│  │ Thread Summary  │  │ Daily Briefing │  │
│  │ trigger: msg    │  │ trigger: conv   │  │ trigger: cron  │  │
│  │ scope: client   │  │ scope: convers  │  │ scope: user    │  │
│  │ output: alert   │  │ output: insight │  │ output: digest │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ Commitment Watch│  │ Churn Predictor │  │ Revenue Radar  │  │
│  │ trigger: cron   │  │ trigger: cron   │  │ trigger: msg   │  │
│  │ scope: user     │  │ scope: client   │  │ scope: client  │  │
│  │ output: alert   │  │ output: insight │  │ output: insight│  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Skill definitions (the initial set)

**Guardian Skills** (protect the freelancer):

| Skill | Purpose | Trigger | Data Needed | Output |
|-------|---------|---------|-------------|--------|
| **Scope Guardian** | Compares message against contract deliverables | On inbound message with `scopeCreepDetected: true` | Active contracts for that client | Alert: "This request for 'animations' is outside contract Section 3. Suggest sending rate card?" |
| **Payment Sentinel** | Tracks payment promises vs. reality | Cron (daily) | Commitments with type="payment", status="pending" | Alert: "Client X promised payment on March 1st (5 days ago). Draft follow-up ready." |
| **Commitment Watchdog** | Surfaces overdue commitments | Cron (daily) | All pending commitments with dueDate < now | Alert: "3 commitments overdue. Highest: 'Send revised mockup' (2 days late, Client Y)" |
| **Ghosting Detector** | Alerts on unusual client silence | Cron (every 4 hours) | Client's normalResponseTime vs. current silence | Alert: "Sarah hasn't replied in 48 hours. Her average is 4 hours. Follow up?" |

**Intelligence Skills** (surface hidden insights):

| Skill | Purpose | Trigger | Data Needed | Output |
|-------|---------|---------|-------------|--------|
| **Churn Predictor** | Early warning on client disengagement | Part of client-level analysis | Sentiment trajectory, engagement trend | Insight card: "Client X churn probability: 35%. Declining engagement over 2 weeks." |
| **Revenue Radar** | Detects deal/budget signals | On message with `dealSignal: true` or `valueSignal` | Message + client context | Insight card: "Client X showed expansion signal: 'can you also handle social media?'" |
| **Relationship Coach** | Suggests engagement strategies | Cron (daily) | Client intelligence profile | Insight card: "Best time to reach Mike: Tue 10am. His formality preference: casual. Last positive interaction: 3 days ago." |

**Productivity Skills** (save time):

| Skill | Purpose | Trigger | Data Needed | Output |
|-------|---------|---------|-------------|--------|
| **Smart Replies** | Generate 2-3 contextual reply options | When viewing a message | Message + recent thread + client style profile | 3 reply suggestions in different tones |
| **Thread Summarizer** | TL;DR for conversations | On-demand or when conversation has 5+ messages | Last N messages in conversation | Summary + open items + decisions |
| **Daily Briefing** | Morning digest | Cron (configurable time from user preferences) | Portfolio analysis | Digest: "3 urgent, 2 overdue, 1 expansion opportunity" |
| **Follow-up Coach** | Suggests when and how to follow up | Part of client-level analysis | Response patterns, silence duration | Suggestion: "Follow up with Sarah today. Use casual tone. Template ready." |

### Implementation approach

**Critical design decision:** Skills should NOT each make their own Claude API call per message. That would be cost-prohibitive and slow. Instead, skills work in two modes:

**Mode 1: Piggyback on existing analysis.** The message-level fields (`dealSignal`, `churnRisk`, `scopeCreepDetected`) are already computed in the unified analysis call. Skills like Scope Guardian and Revenue Radar simply *react* to these fields — they don't make additional AI calls. They check the field value and produce an output if triggered.

**Mode 2: Scheduled analysis.** Skills like Ghosting Detector, Churn Predictor, and Daily Briefing run on crons. They aggregate data from DB queries and make ONE Claude call for all insights for a user, not one per skill.

This means the **total additional AI cost** of the Skills system is approximately:

- 0 extra calls per message (piggyback mode)
- 1 extra call per user per day (daily cron skills)
- 1 extra call per conversation update (thread summarizer, only when triggered)
- 1 extra call per client per analysis cycle (client intelligence, every 4-8 hours)

### Schema additions

```typescript
// User skill configuration — what skills each user has enabled
user_skills: defineTable({
  userId: v.id("users"),
  skillSlug: v.string(),         // "scope_guardian", "ghosting_detector", etc.
  enabled: v.boolean(),
  config: v.optional(v.any()),   // Skill-specific settings (sensitivity, scope)
  clientScope: v.optional(v.array(v.id("clients"))), // null = all clients
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_skill", ["userId", "skillSlug"]),

// Skill outputs — insights, alerts, suggestions produced by skills
skill_outputs: defineTable({
  userId: v.id("users"),
  skillSlug: v.string(),
  clientId: v.optional(v.id("clients")),
  messageId: v.optional(v.id("messages")),
  conversationId: v.optional(v.id("conversations")),

  type: v.string(),              // "alert" | "insight" | "suggestion" | "digest"
  severity: v.optional(v.string()), // "critical" | "warning" | "info"
  title: v.string(),
  content: v.string(),
  metadata: v.optional(v.any()), // Structured data specific to the skill
  actionable: v.boolean(),       // Can the user act on this? (reply, dismiss, etc.)

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
```

### User experience

In **Settings**, a "Skills" tab shows all available skills with toggle switches. Skills produce outputs that appear in:

1. The **notification system** (sonner toasts for critical alerts)
2. A dedicated **Insights Feed** widget on the dashboard
3. **Client detail pages** (contextual insights about that client)
4. The **Daily Briefing** view (aggregated morning digest)

---

## III. Dynamic Dashboard with User Freedom

### Current state

The dashboard is a hardcoded layout: 4 stat cards → Key Insights → Priority Inbox → Action Items → Clients grid. The Pulse page is more functional but equally fixed.

### The widget-based approach

Replace the fixed layout with a **composable widget grid** where users choose what they see.

### Widget registry

Each widget type is defined by:

1. **A React component** (the visual)
2. **A Convex query binding** (the data source)
3. **A configuration schema** (what the user can tune)
4. **A default size** (grid units)

| Widget Type | Data Source | Configurable | Size |
|-------------|-----------|--------------|------|
| `stat_card` | `analytics.getDailyStats` | Which metric | 1×1 |
| `priority_inbox` | `messages.getUrgent` | Max items, min priority | 2×2 |
| `client_health_map` | `clients.getByUser` | Sort by health/recent/name | 1×2 |
| `commitment_tracker` | `commitments.getPending` | Show completed, filter by client | 1×2 |
| `ai_insights_feed` | `skill_outputs` | Which skills, severity filter | 1×2 |
| `sentiment_trends` | Computed from messages | Time range, client filter | 2×1 |
| `revenue_signals` | Filtered skill_outputs | Deals + churn + upsell | 1×1 |
| `conversation_summaries` | `conversations` with AI summaries | Client filter, status filter | 2×2 |
| `quick_actions` | Static + context | Which actions to show | 1×1 |
| `daily_briefing` | Portfolio analysis | Time of day, detail level | 2×1 |

### Layout persistence

```typescript
// Schema addition
dashboard_layouts: defineTable({
  userId: v.id("users"),
  name: v.string(),              // "Morning Focus", "Revenue View", "Custom"
  isDefault: v.boolean(),
  widgets: v.array(v.object({
    id: v.string(),              // unique within layout
    type: v.string(),            // widget type slug
    position: v.object({
      x: v.number(), y: v.number(),
      w: v.number(), h: v.number(),
    }),
    config: v.optional(v.any()), // widget-specific settings
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"]),
```

### Preset layouts

Ship 3 default layouts that users can customize or replace:

- **"Overview"** (default): Current dashboard layout converted to widgets
- **"Focus Mode"**: Priority inbox (full width) + commitment tracker. For when you need to work through the queue.
- **"Intelligence"**: AI insights feed (large) + client health map + sentiment trends + revenue signals. For when you want to understand your business.

Users can switch between presets, modify them, or create new ones. The layout editor uses drag-and-drop.

### The key UX principle

Every piece of intelligence Wire produces must have a **clear destination** on the dashboard. If the Ghosting Detector fires an alert but there's no widget showing it, the user never sees it. The dynamic dashboard ensures that as users enable more skills, they can add corresponding widgets to see the outputs. Skills and widgets are two sides of the same coin — skills produce intelligence, widgets display it.

---

## IV. Implementation Priority

### What to build first (sequential dependencies)

```
PHASE 1: Deepen the core (1-2 weeks)
├── Extend unified.ts prompt with new fields (dealSignal, churnRisk, etc.)
├── Add conversation-level AI summary action
├── Expand aiMetadata schema to hold new fields
└── Update Pulse page to display new metadata

PHASE 2: Skills foundation (2-3 weeks)
├── Add user_skills + skill_outputs tables to schema
├── Build skill runner (event dispatcher + output storage)
├── Implement 4 initial skills:
│   ├── Scope Guardian (reactive)
│   ├── Commitment Watchdog (cron)
│   ├── Ghosting Detector (cron)
│   └── Smart Replies (on-demand)
├── Build Skills settings page (toggles + config)
└── Add skill outputs to dashboard as "Insights" section

PHASE 3: Client intelligence (1-2 weeks)
├── Build client-level AI analysis action
├── Expand client communicationPattern field
├── Wire into health cron cycle
├── Display client intelligence on client detail page
└── Implement Follow-up Coach + Relationship Coach skills

PHASE 4: Dynamic dashboard (2-3 weeks)
├── Add dashboard_layouts to schema
├── Build widget component registry
├── Implement react-grid-layout integration
├── Build layout editor (add/remove/resize widgets)
├── Create 3 preset layouts
├── Build per-widget configuration panel
└── Migrate existing dashboard to widget-based rendering

PHASE 5: Advanced intelligence (2-3 weeks)
├── Portfolio-level daily analysis + Daily Briefing skill
├── Payment Sentinel + Revenue Radar skills
├── Churn Predictor skill
├── Thread Summarizer skill
└── Sentiment trajectory charting widget
```

### What this costs in AI spend

| Analysis Level | Frequency | Claude Calls/Day (10 Clients) | Model | Est. Cost/Day |
|---------------|-----------|-------------------------------|-------|---------------|
| Message-level | Per message | ~50 (unchanged) | Haiku/Sonnet mix | ~$0.10 |
| Conversation-level | Per update | ~15 | Haiku | ~$0.01 |
| Client-level | Every 4-8 hrs | ~30 | Sonnet | ~$0.15 |
| Portfolio/daily | Once/day | 1 | Sonnet | ~$0.02 |
| Smart replies | On-demand | ~10 | Haiku | ~$0.01 |
| **Total** | | **~106** | | **~$0.29/day** |

At 30 days, that's roughly **$8.70/user/month** in AI cost. At a $29/month price point, that leaves healthy margin. The model routing (Haiku for simple tasks, Sonnet for complex) is critical to keeping this affordable.

---

## V. What Makes This "Dynamic"

The word "dynamic" means different things. Here's what it means for Wire across all three pillars:

**Dynamic AI** = The system adapts its intelligence to each client relationship. It doesn't apply the same rigid analysis to every message. It knows that Sarah prefers casual communication, that Mike needs 24-hour response windows, that a "quick question" from Client A historically takes 3.5 hours. The AI **learns the shape of each relationship** and adjusts its outputs accordingly.

**Dynamic Skills** = The user controls what intelligence they receive. A designer cares about Scope Guardian. A consultant cares about Revenue Radar. A developer cares about Commitment Watchdog. Each freelancer configures Wire to match their work style. Skills are modular, toggleable, and configurable per-client.

**Dynamic Dashboard** = The user decides what their command center looks like. No two freelancers work the same way. Some want a dense data view. Others want a minimal focus view. The dashboard adapts to the user, not the other way around. Widgets are composable, resizable, and persist across sessions.

Together, these three create a tool that is genuinely different for every user — shaped by their clients, their work patterns, and their preferences. That's what "as dynamic as possible" actually means in practice.

---

# Wire AI Features — Complete Implementation Audit

## What I Verified Against Actual Code

---

## ✅ Fully Implemented (Backend + Frontend)

### 1. Unified Message Analysis — `convex/ai/unified.ts`

**Status: COMPLETE and extended beyond original spec.**

The prompt extracts 12 fields in a single Claude call:

- **Original 6:** `priorityScore`, `urgency`, `sentiment`, `extractedActions`, `scopeCreepDetected`, `topics`
- **Deep extraction 6 (Phase 1 upgrade):** `dealSignal`, `churnRisk`, `projectPhase`, `hiddenRequests`, `valueSignal`, `clientIntent`

Guard chain is intact: skips processed, outbound, trivially-short, rate-limited messages. Dead letter queue wired. Commitment extraction fires. **Skill dispatcher fires after every successful analysis.**

The NVIDIA NIM fallback in `convex/ai/llm.ts` is a production-grade resilience layer — Anthropic billing failure auto-routes to `meta/llama-3.3-70b-instruct`.

---

### 2. Batch AI Processing — `convex/ai/unified.ts`

**Status: COMPLETE.** 50 messages, 5 concurrent, allSettled error-tolerant. Runs every 15 minutes via cron.

---

### 3. Writing Assistant — `convex/ai/writing_assistant.ts`

**Status: COMPLETE.** 1 call → 4 dimensions. All 3 rewrite actions (`rewriteWithTone`, `adjustFormality`, `simplifyClarify`) are live.

---

### 4. Reply Composer — `src/components/dashboard/reply-composer.tsx`

**Status: COMPLETE and the most sophisticated UI layer in the project.**

The composer has:

- **AI Context Strip** (zero API calls): displays `clientIntent`, `sentiment`, `urgency`, `scopeCreepDetected`, `topics` from already-persisted `aiMetadata`
- **Smart phrase chips**: 5 contextual starters derived from `clientIntent` + `sentiment` + `topics` + `projectPhase` + `extractedActions` — zero API calls
- **AI Draft button**: triggers `generateSmartReplies` → returns 3 labeled options, user picks one to fill textarea
- **Writing Assistant panel**: debounced background analysis as user types, shows tone/clarity/formality/grammar
- **Grammar soft-block**: warns but doesn't prevent sending
- All 4 platform send actions wired

The phrase chip system is a particularly good zero-cost dynamic feature.

---

### 5. Skills System — `convex/skills.ts`

**Status: COMPLETE.** 8 skills in registry (4 guardian, 2 intelligence, 2 productivity). Toggle, config, scope mutations. Output CRUD with read/dismiss. `cleanupExpired` runs daily via cron.

---

### 6. Skill Dispatcher — `convex/skillDispatcher.ts`

**Status: COMPLETE.** Three reactive skills (scope_guardian, churn_predictor, revenue_radar) fire immediately after message analysis — zero Claude calls. Three cron skills (commitment_watchdog, ghosting_detector, payment_sentinel) run every 4 hours — zero Claude calls. 24-48h deduplication windows prevent alert spam.

---

### 7. On-demand Skills — `convex/ai/onDemandSkills.ts`

**Status: COMPLETE.** `generateSmartReplies` uses Haiku, checks skill-enabled, reads replyCount from config. `summarizeThread` summarizes last 50 messages, persists to `conversation_summaries` table.

---

### 8. Client Intelligence — `convex/ai/clientIntelligence.ts`

**Status: BACKEND COMPLETE — ZERO CLAUDE CALLS.** Pure aggregation of existing `aiMetadata`. Computes: sentiment trend, top topics, aggregate churn risk, dominant project phase, revenue signals, hidden requests. Stored on `clients.intelligence`. Called from `health.recalculateAll` (every 4h cron).

---

### 9. Workspace / Dynamic Dashboard — `src/app/(dashboard)/workspace/page.tsx`

**Status: PARTIALLY COMPLETE.** Bento grid with edit mode, add/remove widgets, layout persisted to DB. **5 of 10 planned widget types are built**: `stat_card`, `priority_inbox`, `skill_feed`, `client_health`, `recent_actions`. The `ClientHealthWidget` does surface `client.intelligence.sentimentTrend` as a trending icon.

---

### 10. Skills Page — `src/app/(dashboard)/skills/page.tsx`

**Status: COMPLETE.** Category grouping (guardian/intelligence/productivity), per-skill toggles, Feed tab with real-time `skill_outputs`, mark-read/dismiss, unread badge. Uses Convex `useQuery` = WebSocket subscription = live updates.

---

## ⚠️ Gaps — Implemented in Backend, Missing in Frontend

### Gap 1: Client Intelligence invisible on client detail page

**`src/app/(dashboard)/clients/[id]/page.tsx`** — There is **no `client.intelligence` rendering at all**. The page shows: connected accounts, basic details, commitments panel, contracts panel, message timeline. The rich intelligence object (`sentimentTrend`, `topTopics`, `aggregateChurnRisk`, `dominantPhase`, `dealSignalCount`, `expansionSignals`, `contractionSignals`, `hiddenRequests`) computed every 4 hours is **completely dark to the user on the most important page**.

This is the most significant gap. The data exists — it just has no UI surface.

---

### Gap 2: Skill outputs not surfaced on client detail page

`skill_outputs` has a `by_client` index. When the Scope Guardian fires on Client X, the alert is visible in the global skills feed (`/skills`) but **not on `/clients/X`**. The client detail page has no "AI Alerts for this client" section. A user visiting a client page has no idea that the ghosting detector flagged them.

---

### Gap 3: Thread Summarizer has no UI entry point

`summarizeThread` is a complete Convex action that persists to `conversation_summaries`. But there is **no button anywhere in the client detail page** to trigger it, and no component to display cached summaries. The `conversation_summaries` table exists and has the right indexes but is invisible.

---

### Gap 4: Skill config is view-only — no editing UI

The SkillCard shows `JSON.stringify(skill.config)` — raw JSON as text. The `updateConfig` mutation exists but there are no input controls. A user can't change the Ghosting Detector's `silenceMultiplier` (default: 3×), or Smart Replies' `replyCount` (default: 3), or the `warningDaysBeforeDue` on Commitment Watchdog. The toggle-only UX contradicts the "dynamic" goal.

---

### Gap 5: clientScope filtering is a schema stub — not enforced

The `user_skills` table has `clientScope`, `getSkillConfig` returns it, and the settings UI description mentions "Apply to: [All clients ▼]" — but the **dispatcher never checks it**. In `runScopeGuardian`, `runChurnPredictor`, `runRevenueRadar`, `runGhostingDetector`, there is no `if (clientScope && !clientScope.includes(clientId)) return;` guard. Every skill runs on every client regardless of scope setting.

---

### Gap 6: Workspace missing 5 widgets

Only 5 of the 10 planned widgets are implemented:

| Widget | Data Available? | Status |
|--------|----------------|--------|
| `sentiment_trends` | Yes | Not built |
| `revenue_signals` | Yes | Not built |
| `conversation_summaries` | Yes | Not built |
| `quick_actions` | Yes | Not built |
| `daily_briefing` | No | Backend also not built |

---

### Gap 7: Daily Briefing (Scale 4 Portfolio Analysis) — unbuilt

The skill registry has no `daily_briefing` skill. There is no portfolio-level cron. This was the most complex planned feature and is entirely absent.

---

## 🔍 Specific Implementation Issues

### Issue A: Writing assistant formality recommendation is generic

`analyzeWriting` fetches the client to get `client.name` only. It ignores `client.intelligence.topTopics`, `client.communicationPattern`, and `client.intelligence.aggregateChurnRisk`. The formality recommendation comes from Claude's general reasoning, not from the client's actual communication history. This is a **missed dynamicity opportunity** — formality should be auto-tuned per client.

### Issue B: Smart replies don't use client intelligence

`generateSmartReplies` fetches the client and uses `aiMetadata.sentiment/intent/urgency` as context (good), but ignores `client.intelligence` entirely. If the client's `dominantPhase` is "closing" and their `sentimentTrend` is "declining", the reply suggestions should reflect this — they currently don't.

### Issue C: Rich fields invisible at inbox list level

The inbox page correctly displays `clientIntent` in the AI context strip, but the inbox list view likely shows only `urgency`/`sentiment`. The richer fields (`dealSignal`, `hiddenRequests`, `churnRisk`) are not visible at the message list level — they're computed but invisible until you open the reply composer.

---

## 📋 Additional AI Features From Read.md — Fit Assessment

| Feature | Infra Needed | Fit | Priority |
|---------|-------------|-----|----------|
| **Client Intelligence Panel UI** | None — data exists | Perfect | P0 |
| **Per-client skill outputs panel** | None — index exists | Perfect | P0 |
| **Thread Summarizer UI trigger** | None — action exists | Perfect | P0 |
| **Skill config editing UI** | None — mutation exists | Perfect | P0 |
| **Sentiment trajectory chart widget** | None — trend computed | High | P1 |
| **Revenue signals widget** | None — filter existing outputs | High | P1 |
| **clientScope enforcement** | None — logic fix in dispatcher | High | P1 |
| **Daily briefing (Portfolio cron)** | None — 1 new Convex action | High | P1 |
| **Auto-summarize conversations cron** | None — wire into health cron | Medium | P2 |
| **Formality personalized from client intel** | None — pass intel to writing_assistant | Medium | P2 |
| **Calendar integration (lightweight)** | Google Calendar link gen only | High | P2 |
| **Calendar integration (full)** | `calendar.readonly` OAuth scope expansion | Medium | P3 |
| **Voice transcription (Whisper)** | Whisper API key | Medium | P3 |
| **RAG/semantic search** | Pinecone or Convex vector | Low (needs infra) | Defer |

---

## 🗓️ Calendar Tool — Detailed Assessment

**Read.md rates this P3** due to OAuth scope expansion. Here's the actual complexity breakdown:

**Lightweight (no OAuth, high value):**  
The AI already detects meeting-type commitments in `extractedActions` (e.g., "schedule call", "set up meeting"). When `projectPhase === "closing"` or an extracted action contains "meeting/call/schedule", the reply composer or client detail page can surface a **Google Calendar deep link** (`https://calendar.google.com/calendar/r/eventedit?text=...&details=...`) — no OAuth needed, opens in browser, pre-fills event name from the message context. This is 1 day of work.

**Full integration:**  
Wire already has Gmail OAuth. Expanding to include `https://www.googleapis.com/auth/calendar.readonly` requires:

1. Adding the scope to the OAuth consent screen
2. A new `convex/sync/calendar.ts` action to fetch free/busy slots
3. UI in the reply composer: "📅 Schedule meeting" button when scheduling intent detected
4. The AI's `clientIntent === "requesting"` + action items containing scheduling terms = trigger

The prerequisite is already partially there — `commitments` with `type: "meeting"` are already extracted and stored.

---

## Summary of Dynamicity Status

| Layer | Dynamic? | Gap |
|-------|---------|-----|
| Message analysis | ✅ Real-time on arrival | None |
| Skill triggering | ✅ Reactive + cron | None |
| Client health | ✅ Every 4 hours | None |
| Client intelligence | ✅ Computed every 4h | **Not displayed on client page** |
| Workspace layout | ✅ User-customizable | 5 widgets missing |
| Skill configuration | ❌ Toggle-only | No config editing UI |
| Per-client skill scope | ❌ Stored not enforced | Dispatcher doesn't filter |
| Daily briefing | ❌ Not built | Scale 4 entirely absent |
| Writing assistant personalization | ❌ Generic | Doesn't use client intel |
| Thread summaries | ❌ On-demand but no UI | No trigger or display |

The core engine — analysis, dispatching, intelligence aggregation, health scoring — is production-ready. The dynamicity gap is almost entirely in the **presentation layer**: computed intelligence isn't reaching the user on the pages where they'd act on it (client detail, inbox, workspace).

---

# Wire: Project Analysis

## 1. What Wire Aims to Achieve

Wire is an **AI-powered client communication command center for freelancers**. Its purpose breaks into three interlocking goals:

**Aggregation** — Pull messages from Gmail, Slack, WhatsApp, and Discord into one unified inbox, eliminating platform-switching and context loss.

**Intelligence** — Apply AI to every inbound message to produce a 13-field intelligence packet: priority score, sentiment, extracted actions with due dates, scope creep detection, churn risk, deal signals, project phase, hidden requests, and more — all from a single API call.

**Protection & Opportunity** — Translate that intelligence into actionable skill alerts that protect the freelancer from scope creep, ghosting, missed deadlines, and late payments, while also surfacing deal signals, upsell opportunities, and budget changes.

The thesis is: freelancers lose business not because they're bad at the work, but because client communication is fragmented, unstructured, and mentally taxing. Wire turns it into a managed, AI-watched system.

---

## 2. How Well It Achieves That Purpose

### Architecture: Near-Production Quality

The 6-layer architecture (Foundation → Integration → AI → Business Logic → API Gateway → Presentation) is properly implemented, not just planned. The schema alone (`convex/schema.ts`) tells the story — 13 tables, all properly indexed, covering every domain concept including cross-platform conversation threads, platform identity resolution, commitment tracking, AI metadata, contracts, rate limits, DLQ, webhook idempotency, and skill outputs.

| Layer | Status | Assessment |
|-------|--------|-------------|
| Database schema | Complete | Exceptionally thorough — deeply normalized with correct indexes |
| Authentication | Complete | Clerk + Convex webhook sync |
| Platform adapters | Gmail + Slack live, WhatsApp/Discord stubs | Core 2 of 4 platforms functional |
| AI pipeline | Complete | Production-grade: routing, caching, rate limits, DLQ, fallbacks |
| Business logic | Complete | Skills system, health calculator, commitment tracker, client intelligence |
| UI | Complete | Dashboard, inbox, client detail, workspace, onboarding — all present |

### AI Engine: Sophisticated and Cost-Efficient

The unified analyzer (`convex/ai/unified.ts`) is the project's strongest piece. A single Claude call produces 13 intelligence fields, with:

- **Model routing**: short non-urgent messages → Haiku (10× cheaper); complex/urgent → Sonnet
- **Prompt caching**: `cache_control: ephemeral` on the system prompt — saves ~90% of system-prompt tokens across all calls
- **Rate limiting**: 30 analyses/user/minute guard against sync floods
- **Dead Letter Queue**: failed analyses captured for manual retry
- **Temporal extraction**: AI resolves relative dates ("by Thursday") to absolute timestamps anchored to message time

The skills system is architecturally elegant: 6 of 8 skills fire with **zero additional Claude calls** by reading already-persisted `aiMetadata`. Only `smart_replies` and `thread_summarizer` make on-demand Haiku calls. The daily briefing costs ~$0.0001/user/day. This is cost architecture done right.

### Platform Coverage: Gap Exists

Gmail and Slack are fully operational with webhook support, token refresh, OAuth, real sync, and send capability. WhatsApp and Discord have adapter files and schema support but are stubs — no real sync or OAuth flows. This is the most significant functional gap relative to the stated 4-platform promise.

### Data Model Integrity: Excellent

The `platform_identities` table with `isSelected`, `clientId` FK, and smart delete/soft-deactivate logic is a strong design. The transient import pattern (discover contacts → user picks → persist only selected) prevents DB pollution. Cross-platform conversation grouping via `conversations` with `threadRefs` array is implemented correctly.

The `intelligence` object on `clients` (aggregated from message AI metadata with zero additional AI calls) is the right approach for client-level insights at scale.

### UI: Functional, Not Just Scaffolding

The dashboard shows real data — priority-sorted urgent messages with AI metadata badges, live commitment countdowns updated client-side every 60 seconds, relationship health bars. The workspace page is a fully custom Bento grid with 8 widget types, editable layouts persisted to DB. The client detail page composes 6+ panels (commitments, contracts, intelligence, skill alerts, thread summaries, reply composer).

---

## 3. Workflow & Feature Cohesion

Here is how the pieces form a complete system:

```
User connects Gmail/Slack
         ↓
Onboarding wizard (5 steps) — discover contacts → select → link to clients
         ↓
Cron syncs messages every 15 min + webhooks for real-time
         ↓
AI unified analyzer: 1 call → 13 fields (priority, sentiment, scope, churn, deal signals...)
         ↓
Reactive skills fire (zero cost): scope_guardian, churn_predictor, revenue_radar
Cron skills fire every 4h: commitment_watchdog, ghosting_detector, payment_sentinel
Daily briefing at 7am UTC: 1 Haiku call → portfolio summary
         ↓
Client intelligence aggregated from message metadata → health score recalculated every 4h
         ↓
Surfaces in: Dashboard (priority inbox, action items), Workspace (bento widgets), Client detail (panels), Inbox (full message list)
```

Every component serves the core loop. The onboarding brings data in. The sync keeps it current. The AI enriches it. The skills translate it into actionable alerts. The UI surfaces it in context. The reply composer closes the loop (with AI writing assistance). Nothing is decorative — every table, cron, and component connects.

---

## 4. Identified Gaps & Weaknesses

**1. WhatsApp & Discord — No Real Implementation**

The two platforms are in the schema, in the onboarding UI, and have stub files. But they have no working sync, OAuth, or webhook processing. This is a promise-vs-reality gap for users who need these channels.

**2. Sync Frequency — Cron is Set to 15 Minutes (Dev Mode)**

`crons.ts` explicitly notes the 15-minute interval is for dev and should return to 3 minutes for prod. The webhook infrastructure for Gmail exists but Gmail push notifications require active deployment. This affects the "near-real-time" value proposition.

**3. No Billing / Stripe Integration**

The schema has `plan`, `stripeCustomerId`, `subscriptionEndsAt`, and a 3-tier plan structure (`free`/`pro`/`agency`), but no Stripe integration exists. The product cannot currently monetize.

**4. No Push / Email Notifications**

Notifications are toast-based (sonner) only. The user preferences object supports email/push notification settings, and there's a `use-urgent-notifications` hook, but no actual email delivery or push subscription system exists.

**5. No Public Landing Page**

`src/app/page.tsx` is a Next.js default. There is no marketing/landing page. The product has no acquisition funnel.

**6. Contract Creation UI is Incomplete**

The `contracts` table and `ContractsPanel` component exist, and the scope guardian skill reads contracts. But the UI for creating and managing contracts may be rudimentary — this is critical for the scope guardian to be maximally useful.

**7. Skill Configuration UI is Basic**

Users can toggle skills on/off, but per-skill configuration (e.g. ghosting detector's `silenceMultiplier`, scope guardian's sensitivity) may not be editable through UI — limiting the skills' adaptability to individual freelancer patterns.

**8. No Mobile Experience**

No mention of mobile responsiveness or PWA support. Freelancers frequently check messages on mobile.

---

## 5. Next Step / Recommended Forward Path

Given the project is at Phase 7 (Skills System) in progress, with Phases 0–6 complete, the logical next move is:

### Phase 8: Production Readiness + Monetization

This is the highest-leverage step because the core product is functionally complete and the remaining gaps are what separate a demo from a shippable SaaS.

**Priority order:**

1. **Stripe billing** — Implement plan gating (free tier: 2 clients, 2 platforms; pro: unlimited). The schema is ready. Revenue-blocking.

2. **WhatsApp integration** — Use the WhatsApp Business Cloud API (free tier available). This is the most-used client communication channel for freelancers globally. Highest impact platform addition.

3. **Switch to production sync intervals** — Flip `{ minutes: 15 }` → `{ minutes: 3 }` in `crons.ts`. Activate Gmail push notifications with a real deployment URL. This makes the "real-time" positioning true.

4. **Email digest delivery** — Use Resend or similar to deliver the daily briefing to the user's email. High-value touchpoint that keeps users coming back even when not logged in.

5. **Contract creation UI** — Add a proper form to create/edit contracts with deliverable line items. This directly powers the Scope Guardian skill — currently the skill can detect scope creep but has no contract to compare against if none were created.

6. **Landing page** — Build a conversion-focused landing page targeting freelancers. The product story is compelling: "Wire watches your client communications so you don't miss a deadline, a deal signal, or a client going cold."

7. **Skill config UI** — Expose the threshold/sensitivity settings per skill through the settings page. This differentiates Wire from a blunt tool into a personalized assistant.

### Optional Phase 9: Discord + Mobile

Discord Gateway bot for real-time Discord messages. A mobile-responsive pass on the dashboard. A PWA manifest.

---

## Summary Assessment

Wire is **exceptionally well-engineered** for a project at this stage. The AI cost architecture is production-smart, not toy-smart. The data model anticipates real-world complexity (identity resolution across platforms, cross-platform conversations, scope guardian needing contract context). The skills system is modular and extensible. The UI renders real intelligence, not placeholder data.

The gap between what it does and what it claims is narrow: WhatsApp/Discord are missing, billing doesn't exist, and sync is in dev mode. Close those three gaps and Wire is a shippable B2B SaaS product. Everything else is polish.
