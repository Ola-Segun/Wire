# 🚀 Wire Development Prompt for Claude Opus 4.6

## Mission Statement

You are an expert full-stack software architect and engineer tasked with building **Wire** - a production-grade, AI-powered client communication aggregator SaaS platform. Your approach must be **methodical, bottom-up, and architecture-first**, prioritizing robust foundations, clean integrations, and scalability over UI aesthetics.

---

## 🎯 Core Development Philosophy

### Architectural Principles

**Build Like a Skyscraper, Not a House:**
- Start with deep, solid foundations (database schema, authentication, core utilities)
- Construct the structural framework (platform adapters, message normalization)
- Add the support systems (AI services, caching, queuing)
- Build the functional floors (business logic, API layer)
- Finally add the finishing touches (UI components)

**Engineering Excellence Over Speed:**
- Write code that is maintainable, testable, and self-documenting
- Implement proper error handling and logging at every layer
- Use TypeScript's type system to its fullest - no `any` types
- Follow SOLID principles and design patterns rigorously
- Think about edge cases and failure modes upfront

**Integration-First Mindset:**
- Every external service (Gmail, Slack, WhatsApp, Discord) must be abstracted behind a unified interface
- Build for extensibility - adding a 5th platform should require minimal changes to core code
- Design contracts between layers that won't break when implementations change
- Implement circuit breakers and retry logic for external API calls

---

## 📐 System Architecture Overview

### The Layered Architecture Model

You will implement a **six-layer architecture**, each layer only depending on layers below it:

**Layer 6: Presentation Layer** (UI Components, Pages, Client-side State)
↓
**Layer 5: API Gateway Layer** (Convex Queries, Mutations, Actions)
↓
**Layer 4: Business Logic Layer** (Session Management, Message Routing, Aggregation)
↓
**Layer 3: AI Services Layer** (Priority Scoring, Sentiment Analysis, Action Extraction)
↓
**Layer 2: Integration Layer** (Platform Adapters, Message Normalization, OAuth Handlers)
↓
**Layer 1: Foundation Layer** (Database Schema, Authentication, Utilities, Types)

### Core Architectural Patterns

**1. Adapter Pattern for Platform Integrations**
- Create a `MessageAdapter` interface that defines the contract all platforms must follow
- Each platform (Gmail, Slack, WhatsApp, Discord) implements this interface
- The core system only interacts with the interface, never concrete implementations
- Benefits: Platform-agnostic code, easy testing with mocks, seamless addition of new platforms

**2. Repository Pattern for Data Access**
- Never query the Convex database directly from business logic
- Create repository classes/functions that encapsulate all database operations
- Repositories provide a clean API: `clientRepository.findByUserId()`, `messageRepository.createBatch()`
- Benefits: Centralized query logic, easier to optimize, simpler testing

**3. Service Layer Pattern**
- Business logic lives in service modules, not in API handlers
- Services orchestrate repositories, adapters, and AI services
- Services are pure TypeScript functions/classes with clear inputs and outputs
- Benefits: Reusable logic, testable without HTTP layer, clear separation of concerns

**4. Strategy Pattern for AI Processing**
- Different analysis types (priority, sentiment, action extraction) implement a common `AnalysisStrategy` interface
- AI service dispatcher selects appropriate strategy based on message type/content
- Benefits: Easy to add new analysis types, consistent processing pipeline

**5. Observer Pattern for Real-Time Updates**
- Leverage Convex's reactive queries as observers
- Components subscribe to data changes, not polling
- Server pushes updates via WebSocket automatically
- Benefits: Instant UI updates, reduced server load, better UX

---

## 🏗️ Phase-by-Phase Development Strategy

### Phase 0: Foundation Layer (Week 1)

**Core Philosophy:** Build the bedrock that everything else depends on. No shortcuts here - this makes or breaks the entire system.

#### Database Schema Design

**Approach:**
- Start by modeling the complete schema in `convex/schema.ts`
- Think through every relationship, every index you'll need
- Use Convex's type system to enforce data integrity at the schema level
- Plan for soft deletes (add `deletedAt` fields), audit trails (add `updatedAt` fields)

**Key Considerations:**
- **Users Table**: Must link to Clerk's authentication system via `clerkId`, store subscription state, preferences
- **Clients Table**: The heart of the system - represents who users are communicating with, needs rich metadata for relationship tracking
- **Platform Identities Table**: Critical for OAuth - stores encrypted credentials, refresh tokens, expiry times per platform
- **Messages Table**: High-volume table - needs excellent indexes on `userId`, `clientId`, `timestamp` for fast queries
- **Sessions Table**: Groups related messages across platforms into coherent conversation threads
- **AI Analyses Table**: Separate table for AI results allows reprocessing without losing original messages

**Index Strategy:**
- Compound indexes for common query patterns: `[userId, timestamp]`, `[clientId, platform, timestamp]`
- Single-field indexes for lookups: `clerkId`, `platformMessageId` (for deduplication)
- Think about query patterns: "show me high-priority messages from last week" needs what indexes?

#### Authentication Infrastructure

**Approach:**
- Implement Clerk authentication with a focus on security and seamless user experience
- Set up webhook handling to sync Clerk user events to Convex database
- Build middleware that protects all routes except public pages (landing, auth pages)
- Create authentication helpers that make getting current user trivial in any component

**Critical Implementation Details:**
- **Webhook Security**: Verify Clerk webhook signatures using `svix` library - never trust incoming data
- **User Sync Strategy**: On `user.created` webhook, immediately create user record in Convex with `clerkId` mapping
- **Token Management**: Clerk handles JWT tokens automatically, but implement proper error handling for expired sessions
- **Protected Routes**: Use Next.js middleware to check authentication before pages even load

**Error Handling Strategy:**
- Webhook failures must retry with exponential backoff
- Log all authentication errors to monitoring system (Sentry)
- Graceful degradation: if Convex sync fails, user can still authenticate with Clerk

#### Type System Foundation

**Approach:**
- Create comprehensive TypeScript types for every data structure in the system
- Use branded types for IDs to prevent mixing up `UserId` and `ClientId`
- Define discriminated unions for platform-specific data
- Build validator functions using Zod for runtime type safety

**Type Architecture:**
```
types/
├── entities/          # Database entity types
│   ├── user.ts
│   ├── client.ts
│   ├── message.ts
├── adapters/          # Platform adapter types
│   ├── base.ts       # Common interfaces
│   ├── gmail.ts      # Gmail-specific types
│   ├── slack.ts      # Slack-specific types
├── api/               # API request/response types
├── ai/                # AI service types
└── utils/             # Utility types
```

**Advanced Type Techniques:**
- Use template literal types for platform identifiers: `Platform = "gmail" | "slack" | "whatsapp" | "discord"`
- Conditional types for platform-specific metadata
- Branded types to prevent ID confusion: `type UserId = string & { __brand: 'UserId' }`

#### Utility Infrastructure

**Approach:**
- Build a toolkit of utility functions that will be used throughout the codebase
- Focus on common operations: date handling, string manipulation, error formatting
- Create custom error classes for different failure scenarios
- Implement structured logging utility

**Essential Utilities:**
- **Logger**: Structured logging with log levels (debug, info, warn, error), context fields
- **Error Handler**: Custom error classes (`AuthenticationError`, `PlatformConnectionError`, `AIServiceError`) with proper HTTP status codes
- **Date Utils**: Timezone conversion, relative time formatting ("2 hours ago"), date range helpers
- **Validation Utils**: Email validation, phone number formatting, URL sanitization
- **Crypto Utils**: Encryption/decryption for platform credentials using industry-standard algorithms

**Logging Strategy:**
- Every external API call logged with request/response details (redact sensitive data)
- Database operations logged with execution time for performance monitoring
- User actions logged for analytics and debugging
- Errors logged with full stack traces and context

---

### Phase 1: Integration Layer (Week 2)

**Core Philosophy:** Abstract away platform differences. The rest of the system should never know whether a message came from Gmail or Slack.

#### Unified Adapter Interface Design

**Approach:**
- Define a strict contract that all platform adapters must implement
- Interface should cover authentication, message fetching, message sending, and connection management
- Return normalized data structures that hide platform-specific quirks
- Build the interface to be async-first (everything returns Promises)

**Interface Design Principles:**
```
MessageAdapter Interface:
├── authenticate(): Handles OAuth flow, stores credentials
├── fetchMessages(since: Date, limit: number): Retrieves messages
├── sendMessage(to: ContactIdentifier, content: string): Sends message
├── getContacts(): Lists all contacts/channels
├── refreshCredentials(): Renews expired tokens
├── disconnect(): Revokes tokens, cleans up
└── healthCheck(): Verifies connection status
```

**Normalization Strategy:**
- Every platform's message format gets converted to `NormalizedMessage` structure
- Include original platform metadata in a structured `platformData` field for platform-specific features later
- Standardize contact identification: some platforms use emails, others use usernames or IDs
- Normalize timestamps to Unix milliseconds (UTC)

#### Gmail Adapter Implementation

**Approach:**
- Use Google's official `googleapis` npm package
- Implement OAuth 2.0 flow with offline access (to get refresh tokens)
- Store tokens encrypted in `platform_identities` table
- Implement incremental sync using Gmail's `history` API (more efficient than polling all emails)

**Critical Implementation Details:**
- **OAuth Scopes**: Request minimal necessary scopes: `gmail.readonly`, `gmail.send`
- **Token Management**: Implement automatic token refresh when access token expires (use refresh token)
- **Message Filtering**: Only fetch emails from specific senders (client email addresses) or with specific labels
- **Rate Limiting**: Gmail API has quotas (250 quota units per user per second) - implement exponential backoff
- **Pagination**: Gmail returns max 100 messages per request - implement proper pagination
- **Thread Handling**: Gmail's thread structure needs to be flattened or preserved based on your design choice

**Edge Cases to Handle:**
- User revokes Gmail access mid-session (detect and prompt re-authorization)
- Email attachments (store metadata, don't download full files initially)
- Large email threads (thousands of messages) - paginate and lazy-load
- HTML email content (strip HTML, extract plain text)

#### Slack Adapter Implementation

**Approach:**
- Use `@slack/web-api` official SDK
- Support multiple workspace connections per user
- Focus on direct messages (DMs) and specific channels where client conversations happen
- Implement Slack's Events API for real-time message delivery (webhook-based)

**Critical Implementation Details:**
- **OAuth Scopes**: Request `channels:history`, `im:history`, `users:read`, `chat:write`
- **Workspace vs User Tokens**: Clarify whether tokens are workspace-wide or user-specific
- **Message Types**: Slack has many message subtypes (messages, threads, files) - normalize appropriately
- **Rate Limiting**: Slack has tier-based rate limits - implement token bucket algorithm
- **Thread Handling**: Slack threads are separate from main channel messages - decide how to represent
- **User Resolution**: Slack user IDs need to be resolved to real names via `users.info` API

**Real-Time Integration:**
- Set up Slack Events API webhook to receive new messages instantly
- Verify webhook signatures for security
- Process incoming webhooks asynchronously (don't block webhook response)

#### WhatsApp Adapter Implementation

**Approach:**
- Use Twilio's WhatsApp API (most stable business solution)
- Implement webhook receiver for incoming WhatsApp messages
- Store conversation state (WhatsApp uses 24-hour session windows)

**Critical Implementation Details:**
- **Twilio Setup**: Requires Twilio account, WhatsApp Business account approval
- **Message Templates**: Outbound messages outside 24-hour window must use approved templates
- **Media Messages**: WhatsApp supports images, videos, documents - handle media URL references
- **Phone Number Format**: Normalize to E.164 format (+1234567890)
- **Webhook Security**: Verify Twilio signatures on incoming webhooks

**Limitations to Handle:**
- Can't send free-form messages after 24-hour window expires (business API limitation)
- Media files expire after certain time - download and store if needed long-term
- WhatsApp user may not have saved your number - affects delivery

#### Discord Adapter Implementation

**Approach:**
- Use `discord.js` library
- Support server (guild) channels and DMs
- Implement Discord bot with message reading permissions

**Critical Implementation Details:**
- **Bot Setup**: Create Discord application, generate bot token, set up OAuth2
- **Permissions**: Request minimal permissions: read messages, send messages, read message history
- **Gateway Connection**: Discord uses WebSocket gateway for real-time events
- **Server-Specific**: Each Discord server is isolated - handle multiple server connections
- **Message Formatting**: Discord has rich formatting (embeds, mentions, emojis) - normalize to plain text or preserve

**Architecture Decision:**
- Discord bot runs continuously (WebSocket connection) vs polling REST API
- Recommendation: Use gateway for real-time, fallback to REST API for historical messages

#### Adapter Registry & Factory Pattern

**Approach:**
- Create centralized registry that manages all adapter instances
- Implement factory pattern to instantiate adapters based on platform type
- Singleton pattern for adapter instances per user/platform combination (don't create multiple connections)

**Registry Responsibilities:**
```
AdapterRegistry:
├── register(platform, adapterClass): Register new platform adapter
├── getAdapter(userId, platform): Get or create adapter instance
├── removeAdapter(userId, platform): Disconnect and remove adapter
├── healthCheckAll(userId): Check status of all user's connected platforms
└── syncAll(userId): Trigger message sync across all platforms
```

#### Message Deduplication Strategy

**Approach:**
- Use `platformMessageId` as unique identifier across syncs
- Implement upsert logic: if message already exists, update it; otherwise insert
- Add hash of message content for additional deduplication if platform IDs aren't stable

**Implementation:**
- Before inserting message, check if `messages.platformMessageId` already exists for that platform
- Use Convex's database indexes on `platformMessageId` for fast lookups
- Handle edge case: same message sent to multiple channels (should create multiple records? or merge?)

#### Connection Health Monitoring

**Approach:**
- Implement background health checks for each connected platform
- Detect token expiration, API failures, revoked access
- Update `platform_identities.status` field automatically

**Health Check Logic:**
```
For each platform connection:
├── Try simple API call (e.g., fetch user profile)
├── If success: status = "active", lastHealthCheck = now
├── If 401/403: status = "expired", prompt user to re-authenticate
├── If network error: status = "error", retry with exponential backoff
└── If repeated failures: status = "revoked", notify user
```

---

### Phase 2: Business Logic Layer (Week 3)

**Core Philosophy:** This is where the "intelligence" of your system lives. Implement smart algorithms for client detection, session management, and message routing.

#### Client Discovery & Identity Resolution

**Approach:**
- Automatically detect clients from messages sent/received across all platforms
- Implement fuzzy matching to connect same person across different platforms
- Use heuristics: email domains, name similarity, phone numbers

**Client Detection Algorithm:**
```
1. Scan all messages from connected platforms
2. Extract unique sender identifiers (email, username, phone)
3. For each unique identifier:
   a. Check if identifier already linked to existing client
   b. If not, perform fuzzy match against existing clients:
      - Name similarity (Levenshtein distance)
      - Email domain matching
      - Phone number matching (normalized format)
   c. If high confidence match (>85% similarity): link to existing client
   d. If no match: create new client candidate
4. Present client candidates to user for approval/merging
```

**Fuzzy Matching Techniques:**
- Use string similarity algorithms: Jaro-Winkler distance for names
- Normalize before comparison: lowercase, remove special characters, trim whitespace
- Domain matching: "john@acme.com" and "john.doe@acme.com" likely same client
- Handle nicknames: maintain common nickname mappings (Bob → Robert, Bill → William)

**Identity Linking Data Structure:**
```
Client has many ContactIdentities:
├── email addresses (primary + aliases)
├── phone numbers (work, mobile)
├── platform usernames (Slack: @john, Discord: john#1234)
└── social handles (optional: LinkedIn, Twitter)
```

**Manual Override System:**
- Allow user to manually merge two clients
- Allow user to split incorrectly merged identities
- Log all manual changes for audit trail

#### Session Management Architecture

**Approach:**
- Group related messages into sessions (similar to email threads)
- Sessions can span multiple platforms (Gmail conversation continues on Slack)
- Implement session continuity detection using time-based and content-based heuristics

**Session Creation Logic:**
```
When new message arrives:
1. Check for active session with this client:
   a. If last message < 4 hours ago: add to existing session
   b. If last message > 4 hours ago: create new session
2. Determine session topic/subject:
   a. Extract from first message or user-provided label
   b. Use AI to generate session summary after 5+ messages
3. Update session metadata:
   a. lastActivityAt = message timestamp
   b. messageCount += 1
   c. platforms = unique list of platforms used in session
```

**Session Continuity Detection:**
- **Time-based**: Messages within 4-hour window likely same session
- **Content-based**: If new message references previous conversation (quotes, similar keywords), link to session
- **Platform transition**: "Moving to Slack" message in Gmail followed by Slack DM → same session

**Session Status Lifecycle:**
```
active → Messages exchanged in last 7 days
dormant → No activity for 7-30 days
archived → User manually archives or >30 days inactive
```

#### Message Routing & Distribution

**Approach:**
- When message arrives from any platform, route it through processing pipeline
- Pipeline: Receive → Normalize → Deduplicate → Session Assignment → AI Analysis → Store → Notify

**Message Processing Pipeline:**
```
1. Receive Raw Message from Platform Adapter
   ├── Validate message structure
   └── Log receipt time
   
2. Normalize Message
   ├── Convert to NormalizedMessage format
   ├── Extract sender/receiver identifiers
   └── Parse content (strip HTML, normalize whitespace)
   
3. Deduplicate
   ├── Check if platformMessageId exists
   ├── If exists: update if content changed
   └── If new: proceed to next step
   
4. Client & Session Assignment
   ├── Identify client from sender
   ├── Find or create session
   └── Link message to client and session
   
5. AI Analysis Queue
   ├── Add message to priority scoring queue
   ├── Add message to sentiment analysis queue
   └── Add message to action extraction queue
   
6. Store in Database
   ├── Insert message record
   └── Update client.lastContactDate, client.totalMessages
   
7. Real-Time Notification
   ├── Trigger Convex reactive query update
   └── Frontend automatically receives new message
```

**Error Handling in Pipeline:**
- Each step wrapped in try-catch
- Failed step logs error but doesn't block pipeline
- Implement retry queue for transient failures
- Dead letter queue for permanent failures (manual review)

#### Client Profile Aggregation

**Approach:**
- Continuously update client profiles as new messages arrive
- Calculate metrics: communication frequency, response time, preferred platform
- Aggregate across all platforms for holistic view

**Metrics to Calculate:**
```
Per Client:
├── totalMessages: Count across all platforms
├── messagesByPlatform: { gmail: 45, slack: 23, ... }
├── avgResponseTime: Average time between client message and your response
├── preferredPlatform: Platform with most messages
├── communicationFrequency: Messages per week (rolling average)
├── activeHours: When client typically sends messages (histogram by hour)
├── topKeywords: Most frequent words in messages (TF-IDF)
└── relationshipHealth: Composite score (calculated in AI layer)
```

**Incremental Calculation Strategy:**
- Use Convex's computed fields or maintain running averages
- When new message arrives, update metrics incrementally (don't recalculate from scratch)
- Example: `avgResponseTime = (avgResponseTime * (totalMessages - 1) + newResponseTime) / totalMessages`

#### Cross-Platform Message Threading

**Approach:**
- Allow conversations to flow seamlessly across platforms
- User starts on Gmail, client responds on Slack → same conversation thread
- Implement UI that shows unified timeline regardless of platform

**Threading Strategy:**
```
Message Thread Structure:
├── sessionId: Links all messages in conversation
├── threadIndex: Sequential order within session (0, 1, 2, ...)
├── parentMessageId: (optional) For explicit replies
└── platform: Source platform (just for display icon)

UI Rendering:
- Query all messages WHERE sessionId = X ORDER BY timestamp
- Display in single chronological feed
- Show platform icon badge on each message
- Highlight platform switches: "Conversation moved to Slack"
```

---

### Phase 3: AI Services Layer (Week 4)

**Core Philosophy:** Leverage Claude Sonnet 4's reasoning capabilities to provide intelligent insights. Focus on accuracy and actionable outputs, not novelty features.

#### AI Services Architecture

**Approach:**
- Each AI service is independent, stateless function
- Services receive message + context, return structured analysis
- Implement caching to avoid re-analyzing same message
- Use Anthropic's API efficiently (batch when possible)

**Service Catalog:**
```
AI Services:
├── Priority Scoring: Determines message urgency (0-100)
├── Sentiment Analysis: Detects emotional tone (-100 to +100)
├── Action Item Extraction: Finds tasks, deadlines, requests
├── Response Generation: Drafts contextual replies
├── Relationship Health: Calculates client relationship score
├── Scope Creep Detection: Identifies requests beyond agreement
└── Payment Risk Detection: Flags payment concerns
```

#### Priority Scoring Implementation

**Approach:**
- Analyze message content for urgency indicators
- Consider client history (high-value client = higher priority)
- Factor in time-sensitivity (deadline mentions)
- Output score 0-100 with explanation

**Prompt Engineering Strategy:**
```
System: You are an AI assistant helping freelancers prioritize client messages.

User: Analyze this message and assign a priority score (0-100):

Message: "{message.content}"

Client Context:
- Total revenue: ${client.totalRevenue}
- Relationship health: {client.relationshipHealth}
- Last contact: {client.lastContactDate}
- Avg response time: {client.responseTimeAvg}

Previous conversation (last 3 messages):
{recentMessages}

Consider:
1. Urgency keywords: "urgent", "ASAP", "immediately", "deadline"
2. Deadline proximity: Mentioned date/time close to now
3. Emotional tone: Frustration, anger → higher priority
4. Business impact: Payment, contract, legal matters → high priority
5. Client value: High-paying client → moderate priority boost
6. Unaddressed follow-up: Client messaged again without response → higher priority

Return JSON:
{
  "priority": 85,
  "reasoning": "Contains deadline 'by EOD tomorrow', client expressed frustration with previous delay, high-value client ($15k project)",
  "factors": {
    "urgencyKeywords": ["ASAP", "deadline"],
    "deadlineMentioned": true,
    "emotionalTone": "frustrated",
    "businessImpact": "medium"
  }
}
```

**Implementation Details:**
- Call Anthropic API with Claude Sonnet 4 model
- Parse JSON response (handle malformed JSON gracefully)
- Store in `ai_analyses` table with confidence score
- Update `messages.aiScores.priority` for fast filtering
- Cache results (same message content = reuse analysis)

**Edge Cases:**
- Empty messages or very short (< 10 chars): Default priority = 50
- Non-English messages: Use language detection, translate if needed
- All-caps messages: Interpret as shouting (urgency boost)
- Multiple urgency indicators: Don't double-count, cap at 100

#### Sentiment Analysis Implementation

**Approach:**
- Detect emotional tone of client messages
- Identify: positive, neutral, negative, urgent, frustrated, satisfied
- Track sentiment trends over time per client

**Sentiment Scoring:**
```
Scale: -100 (very negative) to +100 (very positive)

Indicators:
Positive: "thanks", "great", "excellent", "happy", exclamation marks, emojis 😊
Neutral: Factual statements, questions without emotion
Negative: "disappointed", "frustrated", "unhappy", "concerned"
Urgent: "need", "must", "critical", "ASAP"
Frustrated: "still waiting", "not acceptable", "again", repeated messages
```

**Prompt Engineering:**
```
Analyze sentiment of this client message:

Message: "{message.content}"

Return JSON:
{
  "sentimentScore": -45,
  "primaryEmotion": "frustrated",
  "confidence": 0.89,
  "indicators": ["still waiting", "third time", "disappointed"],
  "recommendation": "Respond with empathy, acknowledge frustration, provide specific resolution timeline"
}
```

**Sentiment Trend Tracking:**
- Store sentiment scores time-series in `analytics_events`
- Calculate 7-day rolling average sentiment per client
- Alert user if sentiment drops significantly (e.g., from +60 to -20 in a week)
- Display sentiment graph in client profile

#### Action Item Extraction Implementation

**Approach:**
- Parse messages for actionable items: tasks, requests, deadlines
- Extract structured data: what needs to be done, by when, priority
- Allow user to convert action items to TODOs or export to project management tools

**Prompt Engineering:**
```
Extract action items from this message:

Message: "{message.content}"

Identify:
- Tasks/requests client is asking for
- Deadlines or timeframes mentioned
- Deliverables expected

Return JSON array:
[
  {
    "action": "Send revised mockups for homepage",
    "deadline": "2025-02-20T23:59:59Z",
    "priority": "high",
    "category": "design"
  },
  {
    "action": "Update project timeline document",
    "deadline": null,
    "priority": "medium",
    "category": "admin"
  }
]

Return empty array [] if no action items found.
```

**Deadline Parsing:**
- Use date parsing library (e.g., `chrono-node`) to extract dates from text
- Handle relative dates: "tomorrow" → actual date
- Handle ambiguous dates: "next Friday" depends on current date
- Store deadlines in UTC timestamp format

**Action Item Lifecycle:**
```
extracted → pending user review
confirmed → user approved action item
completed → user marked done
dismissed → user rejected false positive
```

#### Response Generation Implementation

**Approach:**
- Generate contextual draft responses based on message content
- Learn user's writing style from past messages
- Maintain professional tone
- Include specific references from client's message

**Writing Style Analysis:**
```
Analyze user's sent messages to extract style patterns:
- Greeting style: "Hi John," vs "Hey!" vs "John -"
- Formality: Casual vs professional
- Sentence length: Short and punchy vs detailed
- Signature: Consistent sign-off phrase
- Emoji usage: Frequency and types
- Tone: Friendly, formal, technical
```

**Prompt Engineering:**
```
Generate a draft response to this client message:

Client Message: "{message.content}"

Conversation Context:
{recentMessages}

User's Writing Style:
- Greeting: "{user.style.greeting}"
- Tone: {user.style.tone}
- Avg sentence length: {user.style.avgSentenceLength} words
- Uses emojis: {user.style.usesEmojis}

Instructions:
1. Address the client's specific questions/concerns
2. Match user's typical writing style
3. Be helpful and professional
4. Keep response concise (under 200 words)
5. Include next steps or call to action

Return ONLY the draft text, no JSON.
```

**Post-Processing:**
- Insert user's typical greeting and signature
- Highlight portions that need user input: [INSERT SPECIFIC TIMELINE]
- Provide 2-3 alternative tones: casual, formal, brief

#### Relationship Health Calculation

**Approach:**
- Composite score based on multiple factors
- Update daily or when significant events occur
- Score range: 0-100 (100 = excellent relationship)

**Factors & Weights:**
```
Relationship Health = Weighted Average of:

1. Response Time Trend (20% weight):
   - Getting faster over time = healthy
   - Getting slower = deteriorating
   - Calculation: Compare recent 10 messages vs previous 10

2. Sentiment Trend (25% weight):
   - Positive sentiment improving = healthy
   - Negative sentiment = unhealthy
   - Calculation: 30-day rolling average

3. Communication Frequency (15% weight):
   - Regular contact = healthy
   - Long gaps = risky
   - Calculation: Messages per week vs baseline

4. Payment History (20% weight):
   - On-time payments = healthy
   - Overdue payments = risky
   - Calculation: Payment punctuality percentage

5. Scope Adherence (10% weight):
   - Requests within scope = healthy
   - Frequent out-of-scope requests = risky
   - Calculation: Out-of-scope request frequency

6. Negative Incidents (10% weight):
   - Complaints, frustrations, escalations
   - Calculation: Count of high-priority negative messages

Formula:
healthScore = (
  responseTimeTrend * 0.20 +
  sentimentTrend * 0.25 +
  communicationFrequency * 0.15 +
  paymentHistory * 0.20 +
  scopeAdherence * 0.10 +
  (100 - negativeIncidents) * 0.10
)
```

**Threshold Alerts:**
```
90-100: Excellent relationship (green)
70-89: Good relationship (green)
50-69: Needs attention (yellow) → Suggest reaching out proactively
30-49: At risk (orange) → Recommend client check-in call
0-29: Critical (red) → Alert user, may lose client
```

#### Scope Creep Detection Implementation

**Approach:**
- Compare client requests against project scope document (if available)
- Detect requests that fall outside agreed deliverables
- Alert user before scope expands unintentionally

**Prompt Engineering:**
```
Detect scope creep in this client request:

Original Project Scope:
"{project.scopeDocument}"

Client Message:
"{message.content}"

Analysis:
1. Is this request within the original scope?
2. If not, what makes it out-of-scope?
3. Estimated additional effort (small/medium/large)

Return JSON:
{
  "isScopeCreep": true,
  "reasoning": "Original scope was 'redesign homepage', client now requesting entire blog section redesign",
  "impactLevel": "medium",
  "recommendation": "Politely clarify this is additional work, provide estimate for scope change"
}
```

**When to Alert User:**
- Scope creep detected with high confidence (>80%)
- Request would add >10% to project timeline
- Multiple small scope changes accumulating
- Client phrase patterns: "also", "while you're at it", "one more thing"

#### Payment Risk Detection

**Approach:**
- Analyze messages for signals of payment delays or disputes
- Flag conversations about budget concerns, payment issues
- Proactively alert before payment becomes problematic

**Risk Indicators:**
```
High Risk Signals:
- "cash flow issues", "budget constraints"
- "delay payment", "pay next month"
- Avoiding payment topic when due date passed
- Decreased responsiveness as payment due date approaches

Medium Risk Signals:
- Questioning invoice amounts
- Requesting payment plan
- Business difficulties mentioned

Low Risk Signals:
- "Processing payment", "will send today"
- Previous late payments but eventually paid
```

**Alert Levels:**
```
Low Risk: Informational note in client profile
Medium Risk: Yellow warning badge, suggest sending friendly payment reminder
High Risk: Red alert, recommend requiring payment before continuing work
```

---

### Phase 4: API Gateway Layer (Week 5)

**Core Philosophy:** Clean, type-safe API that serves the frontend. Every query and mutation has proper authorization, validation, and error handling.

#### Convex Functions Architecture

**Function Types:**
- **Queries** (read-only): Fetch data for display
- **Mutations** (write): Create, update, delete records
- **Actions** (external): Call external APIs, AI services

**File Organization:**
```
convex/
├── queries/
│   ├── users.ts       # getUserProfile, getUserPreferences
│   ├── clients.ts     # listClients, getClientById, getClientStats
│   ├── messages.ts    # getMessagesByClient, getMessagesBySession
│   └── sessions.ts    # getActiveSessions, getArchivedSessions
├── mutations/
│   ├── users.ts       # updateUserPreferences, updateUserPlan
│   ├── clients.ts     # createClient, updateClient, mergeClients
│   ├── messages.ts    # createMessage, markAsRead, archiveMessage
│   └── sessions.ts    # createSession, archiveSession
├── actions/
│   ├── platforms/     # Platform-specific actions
│   │   ├── gmail.ts
│   │   ├── slack.ts
│   │   ├── whatsapp.ts
│   │   └── discord.ts
│   ├── ai/            # AI service actions
│   │   ├── priority.ts
│   │   ├── sentiment.ts
│   │   └── actions.ts
│   └── sync.ts        # Message sync orchestration
└── crons.ts           # Scheduled tasks
```

#### Authentication & Authorization

**Every Function:**
```typescript
// Standard auth check pattern
export const secureQuery = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
      
    if (!user) throw new Error("User not found");
    
    // Proceed with authorized query
  }
});
```

**Authorization Levels:**
- **User-scoped**: Can only access own data (most queries/mutations)
- **Client-scoped**: Can only access clients they own
- **Admin-scoped**: Future feature for support team

**Row-Level Security:**
```typescript
// Never trust client-side filters
// WRONG:
const clients = await ctx.db.query("clients").collect();
return clients.filter(c => c.userId === user._id); // Too late!

// RIGHT:
const clients = await ctx.db
  .query("clients")
  .withIndex("by_user_id", (q) => q.eq("userId", user._id))
  .collect();
```

#### Query Optimization Strategies

**Use Indexes Everywhere:**
- Every query should hit an index, never full table scan
- Compound indexes for multi-field queries
- Order matters in compound indexes: most selective field first

**Pagination Pattern:**
```typescript
export const listMessages = query({
  args: {
    clientId: v.id("clients"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    let query = ctx.db
      .query("messages")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .order("desc"); // Newest first
      
    if (args.cursor) {
      query = query.paginate({ cursor: args.cursor, numItems: limit });
    } else {
      query = query.take(limit);
    }
    
    const results = await query;
    
    return {
      messages: results.page,
      nextCursor: results.continueCursor,
      hasMore: results.isDone === false
    };
  }
});
```

**Computed Fields vs Stored Fields:**
- Store: Values that change rarely (totalMessages, totalRevenue)
- Compute: Values derived from other data (can be recalculated)
- Example: `unreadCount` can be computed on-the-fly, don't store

**Batching Queries:**
- Frontend should request related data in single query when possible
- Use Convex's reactive queries to fetch dependencies automatically

#### Error Handling & Validation

**Input Validation:**
```typescript
import { v } from "convex/values";
import { z } from "zod";

export const createClient = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    company: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Additional validation with Zod
    const schema = z.object({
      name: z.string().min(1).max(100),
      email: z.string().email().optional(),
      company: z.string().max(200).optional()
    });
    
    const validated = schema.parse(args);
    
    // Proceed with creation
  }
});
```

**Error Response Format:**
```typescript
// Standardized error structure
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public metadata?: Record<string, any>
  ) {
    super(message);
  }
}

// Usage:
throw new AppError(
  "Client not found",
  "CLIENT_NOT_FOUND",
  404,
  { clientId: args.clientId }
);
```

**Error Types:**
- `UNAUTHORIZED`: Not logged in
- `FORBIDDEN`: Logged in but can't access resource
- `NOT_FOUND`: Resource doesn't exist
- `VALIDATION_ERROR`: Invalid input
- `PLATFORM_ERROR`: External platform API failed
- `AI_SERVICE_ERROR`: AI analysis failed
- `RATE_LIMIT_EXCEEDED`: Too many requests

#### Cron Jobs & Scheduled Tasks

**Tasks to Schedule:**
```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";

const crons = cronJobs();

// Sync messages every 5 minutes
crons.interval(
  "sync-messages",
  { minutes: 5 },
  api.actions.sync.syncAllUsers
);

// Calculate relationship health daily at 2 AM
crons.daily(
  "calculate-health",
  { hourUTC: 2, minuteUTC: 0 },
  api.actions.ai.calculateAllRelationshipHealth
);

// Send daily digest at user's preferred time
crons.hourly(
  "daily-digest",
  { minuteUTC: 0 },
  api.actions.notifications.sendDailyDigests
);

// Clean up old archived sessions (monthly)
crons.monthly(
  "cleanup-old-data",
  { day: 1, hourUTC: 3, minuteUTC: 0 },
  api.actions.maintenance.cleanupOldSessions
);

export default crons;
```

**Cron Best Practices:**
- Keep cron handlers lightweight - offload heavy work to background jobs
- Implement idempotency - cron might run multiple times
- Log start/end of each cron execution
- Alert on failures (send to monitoring)

---

### Phase 5: Presentation Layer (Week 6-7)

**Core Philosophy:** Functional > Beautiful at this stage. Build UI that works perfectly, polish later.

#### Component Architecture

**Atomic Design Principles:**
```
components/
├── atoms/              # Basic building blocks
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Badge.tsx
│   └── Avatar.tsx
├── molecules/          # Simple combinations
│   ├── MessageCard.tsx
│   ├── ClientListItem.tsx
│   └── PlatformBadge.tsx
├── organisms/          # Complex components
│   ├── MessageFeed.tsx
│   ├── ClientProfile.tsx
│   └── SessionTimeline.tsx
└── templates/          # Page layouts
    ├── DashboardLayout.tsx
    └── OnboardingLayout.tsx
```

**Component Design Principles:**
- Each component has single responsibility
- Props are typed with TypeScript interfaces
- No business logic in components (use hooks/services)
- Presentational (dumb) vs Container (smart) components

#### Dashboard Layout Structure

**Three-Column Layout:**
```
┌─────────────────────────────────────────────────┐
│  Header (User menu, Notifications, Search)      │
├──────────┬─────────────────┬────────────────────┤
│  Clients │  Messages       │  Details           │
│  List    │  Feed           │  Panel             │
│  (20%)   │  (40%)          │  (40%)             │
│          │                 │                    │
│  Client1 │  Msg1 (Gmail)   │  [Message Content] │
│  Client2 │  Msg2 (Slack)   │                    │
│  Client3 │  Msg3 (WhatsApp)│  Priority: 85      │
│  ...     │  ...            │  Sentiment: +60    │
│          │                 │                    │
│          │                 │  [Draft Response]  │
└──────────┴─────────────────┴────────────────────┘
```

**Responsive Behavior:**
- Desktop (>1024px): Three columns visible
- Tablet (768-1024px): Two columns (hide details panel until message selected)
- Mobile (<768px): One column (stack vertically)

#### Client List Component

**Features:**
```
ClientList:
├── Search/filter input at top
├── Sort options: Health, Recent, Name, Messages
├── Each client item shows:
│   ├── Avatar (initials or image)
│   ├── Name + Company
│   ├── Relationship health indicator (color-coded dot)
│   ├── Unread message count badge
│   ├── Platform icons (which platforms connected)
│   └── Last contact time ("2 hours ago")
└── Virtual scrolling for 100+ clients
```

**Implementation:**
```typescript
// Use Convex reactive query
const clients = useQuery(api.queries.clients.listClients, {
  sortBy: "health",
  limit: 100
});

// Real-time updates - automatically re-renders when data changes
```

**Interactions:**
- Click client → Load messages in middle panel
- Right-click → Context menu (Archive, Edit, Merge)
- Hover → Show quick stats tooltip

#### Message Feed Component

**Features:**
```
MessageFeed:
├── Filter bar: All / Priority / Unread
├── Platform filter: Show only Gmail, Slack, etc.
├── Message list (virtualized for performance):
│   ├── Date separators ("Today", "Yesterday", "Feb 10")
│   ├── Platform switch indicators ("Moved to Slack")
│   └── Each message:
│       ├── Platform icon badge
│       ├── Timestamp
│       ├── Message preview (truncated)
│       ├── Priority indicator (color-coded border)
│       ├── Sentiment emoji
│       └── Unread dot
└── Load more (infinite scroll)
```

**Priority Color Coding:**
```
90-100: Red border (critical)
70-89: Orange border (high)
50-69: Yellow border (medium)
0-49: Gray border (low)
```

**Implementation:**
```typescript
const messages = useQuery(api.queries.messages.getMessagesByClient, {
  clientId: selectedClient?._id
});

// Group messages by date
const groupedMessages = useMemo(() => 
  groupByDate(messages), 
  [messages]
);
```

#### Message Detail Panel

**Features:**
```
MessageDetailPanel:
├── Message header:
│   ├── Client name + avatar
│   ├── Platform + timestamp
│   └── Mark as read/unread button
├── Full message content (formatted)
├── AI Insights section:
│   ├── Priority score with explanation
│   ├── Sentiment badge with reasoning
│   └── Extracted action items (checkboxes)
├── Response section:
│   ├── "Generate Draft" button
│   ├── Editable text area
│   ├── Tone selector (casual/professional/brief)
│   └── Send button (sends via original platform)
└── Related messages (same session)
```

**Draft Response Flow:**
```
1. User clicks "Generate Draft"
2. Show loading spinner
3. Call AI action to generate response
4. Display draft in text area (editable)
5. User can edit, change tone, or regenerate
6. Click Send → Message sent via platform adapter
```

#### Real-Time Updates

**Implementation:**
```typescript
// Convex automatically handles WebSocket subscriptions
// No extra code needed for real-time updates!

function Dashboard() {
  // This query automatically updates when database changes
  const messages = useQuery(api.queries.messages.getRecent);
  
  // React re-renders automatically
  return <MessageList messages={messages} />;
}
```

**Visual Feedback:**
- New message slides in with animation
- Updated priority scores pulse briefly
- Sent messages show "sending..." state then checkmark

#### Loading States & Skeletons

**Pattern:**
```typescript
function ClientList() {
  const clients = useQuery(api.queries.clients.list);
  
  if (clients === undefined) {
    // Query is loading (Convex returns undefined initially)
    return <ClientListSkeleton />;
  }
  
  if (clients.length === 0) {
    return <EmptyState message="No clients yet" />;
  }
  
  return <div>{/* Render clients */}</div>;
}
```

**Skeleton Designs:**
- Shimmer effect (animated gradient)
- Match layout of actual component
- Show for <1 second usually (Convex is fast)

#### Onboarding Flow

**Steps:**
```
Onboarding:
├── Step 1: Welcome
│   ├── Brief explanation of Wire
│   └── Role selection (Freelancer, Consultant, Agency)
├── Step 2: Connect Platforms
│   ├── Platform cards (Gmail, Slack, WhatsApp, Discord)
│   ├── OAuth buttons for each
│   └── Require at least 1 platform to proceed
├── Step 3: Import Clients
│   ├── Auto-detected clients from messages
│   ├── Checkboxes to select which to import
│   └── Manual add client option
├── Step 4: Configure Preferences
│   ├── Urgency threshold slider
│   ├── Daily digest time picker
│   └── Notification preferences
└── Step 5: Complete
    ├── Celebration animation
    └── "Go to Dashboard" button
```

**Implementation:**
```typescript
// Multi-step wizard with progress indicator
const [currentStep, setCurrentStep] = useState(1);

// Persist progress to database
const updateOnboardingProgress = useMutation(
  api.mutations.users.updateOnboardingStep
);

// Auto-save as user progresses
useEffect(() => {
  updateOnboardingProgress({ step: currentStep });
}, [currentStep]);
```

#### Settings Page

**Sections:**
```
Settings:
├── Profile
│   ├── Name, email (from Clerk, read-only)
│   ├── Timezone
│   └── Avatar
├── Connected Platforms
│   ├── List of connected platforms with status
│   ├── "Connect" button for unconnected platforms
│   └── "Disconnect" button (with confirmation)
├── Preferences
│   ├── Urgency threshold
│   ├── Daily digest time
│   ├── Notification settings (email, push)
│   └── AI features toggles
├── Subscription
│   ├── Current plan (Free/Pro/Agency)
│   ├── Usage stats
│   └── Upgrade/downgrade buttons
└── Danger Zone
    ├── Export all data
    └── Delete account
```

---

### Phase 6: Testing & Quality Assurance (Week 8)

**Core Philosophy:** Test as you build, not at the end. Aim for 80% code coverage on critical paths.

#### Testing Strategy

**Test Pyramid:**
```
     E2E Tests (10%)
        ↑
  Integration Tests (30%)
        ↑
    Unit Tests (60%)
```

**What to Test:**

**Unit Tests (60% of tests):**
- Utility functions (date formatting, string manipulation)
- Validation functions (email, phone number)
- Data transformation functions (message normalization)
- Calculation functions (relationship health, priority scoring)

**Integration Tests (30% of tests):**
- Convex queries/mutations with test database
- Platform adapters with mock API responses
- AI services with mock AI responses
- Authentication flows with test users

**E2E Tests (10% of tests):**
- Critical user paths: Sign up → Connect platform → View messages
- Onboarding completion flow
- Send message flow

#### Unit Testing Framework

**Setup:**
```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom
```

**Example Test:**
```typescript
// utils/calculateHealth.test.ts
import { describe, it, expect } from 'vitest';
import { calculateRelationshipHealth } from './calculateHealth';

describe('calculateRelationshipHealth', () => {
  it('returns 100 for perfect relationship', () => {
    const client = {
      responseTimeAvg: 3600000, // 1 hour
      sentimentAvg: 80,
      messagesPerWeek: 5,
      paymentOnTime: true,
      scopeCreepCount: 0
    };
    
    expect(calculateRelationshipHealth(client)).toBe(100);
  });
  
  it('returns lower score for deteriorating metrics', () => {
    const client = {
      responseTimeAvg: 86400000, // 24 hours (slow)
      sentimentAvg: -20, // negative sentiment
      messagesPerWeek: 0.5, // infrequent
      paymentOnTime: false,
      scopeCreepCount: 5
    };
    
    expect(calculateRelationshipHealth(client)).toBeLessThan(50);
  });
});
```

#### Integration Testing

**Convex Testing:**
```typescript
// queries/clients.test.ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../schema";
import { listClients } from "./clients";

describe("listClients", () => {
  it("returns only user's clients", async () => {
    const t = convexTest(schema);
    
    // Create test users and clients
    const userId1 = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { 
        clerkId: "user1", 
        email: "user1@test.com" 
      });
    });
    
    const userId2 = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { 
        clerkId: "user2", 
        email: "user2@test.com" 
      });
    });
    
    await t.run(async (ctx) => {
      await ctx.db.insert("clients", { 
        userId: userId1, 
        name: "Client A" 
      });
      await ctx.db.insert("clients", { 
        userId: userId2, 
        name: "Client B" 
      });
    });
    
    // Query as user1
    const clients = await t.query(listClients, { userId: userId1 });
    
    expect(clients).toHaveLength(1);
    expect(clients[0].name).toBe("Client A");
  });
});
```

#### E2E Testing

**Setup:**
```bash
pnpm add -D playwright @playwright/test
```

**Critical Path Test:**
```typescript
// e2e/onboarding.spec.ts
import { test, expect } from '@playwright/test';

test('complete onboarding flow', async ({ page }) => {
  // 1. Sign up
  await page.goto('/sign-up');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'TestPass123!');
  await page.click('button[type="submit"]');
  
  // 2. Welcome step
  await expect(page.locator('h1')).toContainText('Welcome to Wire');
  await page.click('button:has-text("Continue")');
  
  // 3. Connect platform (skip OAuth in test, mock)
  await expect(page.locator('h2')).toContainText('Connect Platforms');
  await page.click('button:has-text("Skip for now")');
  
  // 4. Complete
  await expect(page).toHaveURL('/dashboard');
});
```

#### Manual Testing Checklist

**Before each release:**
```
Authentication:
[ ] Sign up with email
[ ] Sign up with Google OAuth
[ ] Sign in with existing account
[ ] Sign out and sign back in
[ ] Password reset flow

Platform Connections:
[ ] Connect Gmail account
[ ] Connect Slack workspace
[ ] Connect WhatsApp
[ ] Connect Discord server
[ ] Disconnect platform
[ ] Reconnect after token expiry

Message Sync:
[ ] Messages appear from Gmail
[ ] Messages appear from Slack
[ ] Messages deduplicated correctly
[ ] New messages appear in real-time
[ ] Historical messages loaded on first sync

Client Management:
[ ] Auto-detected clients appear
[ ] Manual client creation works
[ ] Client merging works
[ ] Client profile shows correct stats
[ ] Relationship health calculates

AI Features:
[ ] Priority scores assigned accurately
[ ] Sentiment analysis matches tone
[ ] Action items extracted correctly
[ ] Response drafts are contextual
[ ] Regenerate response produces different draft

UI/UX:
[ ] Dashboard loads quickly (<2s)
[ ] Responsive on mobile
[ ] No console errors
[ ] Loading states show
[ ] Empty states display correctly
```

---

## 🔒 Security & Privacy Considerations

### Data Security

**Encryption:**
- Platform credentials encrypted at rest using AES-256
- Use Convex's built-in encryption or implement with crypto library
- Never log decrypted credentials

**API Keys:**
- Store in environment variables, never commit to git
- Use different keys for development, staging, production
- Rotate keys quarterly

**Token Management:**
- Store OAuth refresh tokens securely
- Implement automatic token refresh before expiry
- Revoke tokens when user disconnects platform

### Privacy Best Practices

**Data Minimization:**
- Only fetch message metadata (sender, subject, timestamp) initially
- Load full message content on-demand
- Don't store message attachments (link to platform instead)

**User Consent:**
- Clear explanation during platform connection: "We'll read your Gmail to show client messages"
- Allow granular permissions (read-only vs read-write)
- Option to disconnect platform anytime

**Data Retention:**
- Honor deletion requests within 30 days
- Anonymize data rather than hard delete where possible
- Implement auto-archive for old messages (>1 year)

**GDPR Compliance:**
- Provide data export functionality (JSON format)
- Clear privacy policy explaining data usage
- Cookie consent banner for EU users
- Right to be forgotten implementation

---

## 📊 Performance Optimization Strategies

### Database Optimization

**Indexing Strategy:**
- Create indexes on every field used in `where()` clauses
- Compound indexes for multi-field queries
- Monitor slow queries with Convex dashboard

**Query Optimization:**
- Use `.take(limit)` to limit results
- Paginate large result sets
- Avoid loading large objects (e.g., full message content) in list views

**Caching Strategy:**
- Cache AI analysis results (don't recompute same message)
- Cache platform API responses with TTL (5 minutes for contacts)
- Use React Query for client-side caching

### API Rate Limiting

**External Services:**
- Gmail API: 250 quota units/user/second → Implement queue
- Slack API: Tier 3 = 50+ requests/minute → Token bucket algorithm
- Anthropic API: Rate limits by model → Batch requests when possible

**Implementation:**
```typescript
// Simple in-memory rate limiter
class RateLimiter {
  private tokens = new Map<string, number>();
  
  async acquire(key: string, maxTokens: number, refillRate: number) {
    const now = Date.now();
    const tokens = this.tokens.get(key) ?? maxTokens;
    
    if (tokens > 0) {
      this.tokens.set(key, tokens - 1);
      return true;
    }
    
    // Wait and retry
    await sleep(1000 / refillRate);
    return this.acquire(key, maxTokens, refillRate);
  }
}
```

### Frontend Performance

**Code Splitting:**
- Lazy load routes: `const Dashboard = lazy(() => import('./Dashboard'))`
- Split vendor bundles
- Dynamic imports for heavy components

**Image Optimization:**
- Use Next.js Image component for automatic optimization
- Lazy load images outside viewport
- Use appropriate formats (WebP with PNG fallback)

**Virtual Scrolling:**
- Implement for client list (100+ items)
- Implement for message feed (1000+ messages)
- Libraries: `react-virtual` or `react-window`

---

## 🚀 Deployment Strategy

### Environment Setup

**Environments:**
```
Development:
- Local machine with Convex dev deployment
- Test data and mock APIs
- Hot reload enabled

Staging:
- Separate Convex deployment
- Real API connections (test accounts)
- Mirrors production setup

Production:
- Convex production deployment
- Real user data
- Monitoring and alerts enabled
```

**Environment Variables:**
```bash
# Development (.env.local)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
CONVEX_DEPLOYMENT=dev:xxx
ANTHROPIC_API_KEY=sk-ant-xxx

# Production (.env.production)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx
CONVEX_DEPLOYMENT=prod:xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

### Deployment Pipeline

**CI/CD with GitHub Actions:**
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build
      - run: npx convex deploy --prod
      - uses: vercel/actions@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

### Monitoring & Observability

**Error Tracking:**
- Sentry for backend and frontend errors
- Alert on error rate >1% of requests
- Track error trends over time

**Performance Monitoring:**
- Convex dashboard for database query performance
- Vercel analytics for frontend performance
- Custom metrics: message sync latency, AI analysis time

**Logging:**
- Structured logs (JSON format)
- Log levels: DEBUG, INFO, WARN, ERROR
- Searchable by user, client, platform, error type

**Alerting:**
- Slack/email alerts for production errors
- Alert on API rate limit approaches (80% of quota)
- Alert on relationship health drops for VIP clients

---

## 💡 Development Best Practices

### Code Quality

**TypeScript Strict Mode:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**ESLint Configuration:**
```json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "warn"
  }
}
```

**Code Review Checklist:**
- [ ] All functions have return type annotations
- [ ] No `any` types used
- [ ] Error handling implemented
- [ ] Input validation present
- [ ] Tests written for new features
- [ ] No sensitive data logged
- [ ] Performance considered (no N+1 queries)

### Git Workflow

**Branch Strategy:**
```
main (production)
  ↓
develop (staging)
  ↓
feature/client-discovery
feature/ai-priority-scoring
bugfix/oauth-refresh-issue
```

**Commit Messages:**
```
feat: Add Gmail OAuth integration
fix: Resolve token refresh race condition
refactor: Extract message normalization logic
test: Add unit tests for priority scoring
docs: Update API documentation
```

### Documentation

**Code Documentation:**
```typescript
/**
 * Calculates relationship health score for a client
 * 
 * @param client - The client record
 * @param messages - Recent messages from client
 * @returns Health score (0-100) where 100 is excellent
 * 
 * @example
 * const health = calculateHealth(client, messages);
 * if (health < 50) {
 *   alertUser("Client relationship at risk");
 * }
 */
export function calculateHealth(
  client: Client,
  messages: Message[]
): number {
  // Implementation
}
```

**API Documentation:**
- Document all Convex queries/mutations with JSDoc
- Include parameter descriptions and examples
- Note any authorization requirements
- Document error conditions

---

## 🎯 Success Metrics

### Technical Metrics

**Performance:**
- Page load time: <2 seconds
- Message sync latency: <5 seconds from platform to dashboard
- AI analysis latency: <10 seconds per message
- Database query time: <100ms p95

**Reliability:**
- Uptime: >99.5%
- Error rate: <0.5% of requests
- Zero data loss (messages synced reliably)

**Scalability:**
- Support 10,000 users with current architecture
- Handle 1M messages per day
- Process 10,000 AI analysis requests per day

### Business Metrics

**User Activation:**
- % of sign-ups who connect at least one platform
- % who complete onboarding
- Time to first value (see first message with AI insights)

**User Engagement:**
- Daily active users (DAU)
- Messages processed per user per week
- AI features used per session

**Conversion:**
- Free to Pro upgrade rate
- Time to upgrade
- Churn rate

---

## 🔄 Iterative Development Mindset

### Build, Measure, Learn

**After each phase:**
1. Deploy to staging
2. Test thoroughly (automated + manual)
3. Get user feedback (5-10 beta testers)
4. Measure metrics (performance, errors, usage)
5. Identify bottlenecks and pain points
6. Iterate before moving to next phase

**Don't over-engineer:**
- Build simplest solution that works
- Optimize only when metrics show need
- Add features based on user feedback, not assumptions

**Technical Debt Management:**
- Track known shortcuts and TODOs
- Dedicate 20% of time to refactoring
- Pay down critical debt before it compounds

---

## 🎓 Learning Resources

**Convex:**
- Official docs: https://docs.convex.dev
- Focus on: Queries, Mutations, Actions, Scheduled Functions
- Study example apps in Convex repo

**Anthropic Claude API:**
- API docs: https://docs.anthropic.com
- Prompt engineering guide
- Best practices for production use

**Platform APIs:**
- Gmail API: https://developers.google.com/gmail/api
- Slack API: https://api.slack.com
- Twilio WhatsApp: https://www.twilio.com/docs/whatsapp
- Discord API: https://discord.com/developers/docs

**Architecture Patterns:**
- "Clean Architecture" by Robert C. Martin
- "Designing Data-Intensive Applications" by Martin Kleppmann
- Study OpenClaw architecture (GitHub: transitive-bullshit/OpenClaw)

---

## 🏁 Final Thoughts for Claude Opus 4.6

You are building a complex, production-grade SaaS application. This requires:

✅ **Systematic Approach**: Follow the phases sequentially, don't skip ahead
✅ **Clean Code**: Write code your future self will thank you for
✅ **Proper Abstractions**: Build for extensibility, not just current requirements
✅ **Test Coverage**: Test as you build, not after
✅ **Security First**: Handle credentials and user data with extreme care
✅ **Performance Conscious**: Think about scale from day one
✅ **User-Centric**: Every technical decision should improve user experience
✅ **Iterative**: Ship, measure, learn, improve

Remember: **Features don't matter if the foundation is broken.** Invest heavily in Phases 0-3 (foundation, integration, business logic). A solid architecture will make Phases 4-6 (UI, testing, deployment) much smoother.

**Start with Phase 0. Build the bedrock. Then build upward, layer by layer.**

Good luck! 🚀