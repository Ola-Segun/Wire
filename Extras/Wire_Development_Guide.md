# Wire - Complete Development Guide

> **AI-Powered Client Communication Aggregator for Freelancers**
> 
> A SaaS platform that unifies client communications across Gmail, Slack, WhatsApp, and Discord with intelligent AI features including priority scoring, sentiment analysis, and relationship health tracking.

---

## 📋 Table of Contents

1. [Product Overview](#product-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [MVP Development Plan](#mvp-development-plan)
6. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
7. [Feature Specifications](#feature-specifications)
8. [API Integration Guides](#api-integration-guides)
9. [AI Implementation](#ai-implementation)
10. [Deployment Strategy](#deployment-strategy)
11. [Testing & Quality Assurance](#testing--quality-assurance)
12. [Security & Privacy](#security--privacy)

---

## Product Overview

### The Problem
Freelancers and solo entrepreneurs communicate with clients across multiple platforms (Gmail, Slack, WhatsApp, Discord), leading to:
- Scattered conversations across 5+ apps
- Missed urgent messages buried in different channels
- Lost context when switching between platforms
- Manual tracking of client relationships
- Scope creep going undetected
- No centralized view of client communication health

### The Solution
Wire provides a unified inbox with AI-powered intelligence that:
- Aggregates all client messages in one place
- Prioritizes messages by urgency and importance
- Analyzes sentiment to detect frustrated clients
- Extracts action items automatically
- Tracks relationship health per client
- Generates draft responses in your writing style
- Detects scope creep and payment risks

### Target Users
- **Primary**: Solo freelancers (developers, designers, writers, consultants)
- **Secondary**: Small agencies (2-5 people)
- **Markets**: Global, English-speaking initially

### Business Model
**Freemium SaaS**
- **Free**: 1 platform, 5 clients, basic features
- **Pro ($29/month)**: Unlimited platforms/clients, all AI features
- **Agency ($79/month)**: Team features, shared clients, advanced analytics

---

## Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  React/Next.js Application                         │  │
│  │  • Onboarding Flow    • Dashboard                  │  │
│  │  • Client Profiles    • Settings                   │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────┬─────────────────────────────────────────┘
                 │ Convex React Client (WebSocket)
                 ▼
┌──────────────────────────────────────────────────────────┐
│                   CONVEX BACKEND                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  API Layer (Convex Functions)                      │  │
│  │  • Queries (Read)  • Mutations (Write)             │  │
│  │  • Actions (External APIs)                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Channel Adapters (Convex Actions)                 │  │
│  │  • Gmail Adapter    • Slack Adapter                │  │
│  │  • WhatsApp Adapter • Discord Adapter              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AI Services (Convex Actions)                      │  │
│  │  • Priority Scoring    • Sentiment Analysis        │  │
│  │  • Action Extraction   • Response Generation       │  │
│  │  • Relationship Health • Scope Creep Detection     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Convex Database (Serverless)                      │  │
│  │  • users  • clients  • platform_identities         │  │
│  │  • messages  • sessions  • analytics               │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│              EXTERNAL SERVICES                            │
│  • Gmail API          • Slack API                         │
│  • WhatsApp API       • Discord API                       │
│  • Anthropic API      • Pinecone (Vector DB)              │
└──────────────────────────────────────────────────────────┘
```

### Architecture Patterns (Inspired by OpenClaw)

#### 1. **Hub-and-Spoke Gateway Pattern**
- **Convex Backend** acts as central control plane
- All platform adapters connect through this hub
- Unified message routing and session management

#### 2. **Channel Adapter Pattern**
- Each messaging platform gets dedicated adapter
- Adapters normalize platform-specific data formats
- Consistent interface: `fetchMessages()`, `sendMessage()`, `authenticate()`

#### 3. **Session-Based Architecture**
- Each client = persistent session
- Sessions maintain conversation history and state
- Cross-platform message threading per session

#### 4. **Real-Time WebSocket Communication**
- Convex provides WebSocket layer automatically
- Live message updates without polling
- Instant AI insights as they're computed

---

## Tech Stack

### Frontend
```json
{
  "framework": "Next.js 15+ (App Router)",
  "language": "TypeScript",
  "styling": "TailwindCSS",
  "ui-components": "radix-ui",
  "state": "Convex React hooks",
  "animations": "Framer Motion",
  "forms": "React Hook Form + Zod",
  "auth-ui": "Clerk Components"
}
```

### Backend
```json
{
  "platform": "Convex",
  "language": "TypeScript",
  "database": "Convex DB (serverless)",
  "realtime": "Convex WebSocket",
  "auth": "Clerk (OAuth + Session Management)",
  "serverless-functions": "Convex Actions"
}
```

### AI & ML
```json
{
  "llm": "Anthropic Claude Sonnet 4",
  "embeddings": "OpenAI text-embedding-3-small",
  "vector-db": "Pinecone",
  "semantic-search": "Pinecone + Convex"
}
```

### Platform APIs
```json
{
  "email": "Gmail API (Google APIs Node.js)",
  "slack": "@slack/web-api",
  "whatsapp": "Twilio WhatsApp API",
  "discord": "discord.js"
}
```

### Development Tools
```json
{
  "package-manager": "pnpm",
  "linting": "ESLint + Prettier",
  "testing": "Vitest + Testing Library",
  "ci-cd": "GitHub Actions",
  "monitoring": "Sentry",
  "analytics": "PostHog"
}
```

---

## Database Schema

### Complete Convex Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // USER MANAGEMENT
  // ============================================
  
  users: defineTable({
    // Clerk Authentication
    clerkId: v.string(), // Clerk user ID (primary identifier)
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
    preferences: v.optional(v.object({
      dailyDigestTime: v.optional(v.string()), // "09:00"
      urgencyThreshold: v.optional(v.number()), // 80
      notifications: v.optional(v.object({
        email: v.optional(v.boolean()),
        push: v.optional(v.boolean()),
      })),
    })),
    
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
    relationshipHealth: v.optional(v.number()), // 0-100
    firstContactDate: v.number(),
    lastContactDate: v.number(),
    totalMessages: v.number(),
    responseTimeAvg: v.optional(v.number()), // milliseconds
    
    // AI Insights
    communicationPattern: v.optional(v.object({
      preferredPlatform: v.optional(v.string()),
      activeHours: v.optional(v.string()),
      responseSpeed: v.optional(v.string()), // "fast", "normal", "slow"
    })),
    
    // Identity Resolution
    createdFromPlatform: v.string(), // "gmail", "slack", etc.
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
    clientId: v.optional(v.id("clients")), // Linked client
    
    // Platform Info
    platform: v.string(), // "gmail", "slack", "whatsapp", "discord"
    platformUserId: v.string(), // Platform's native ID
    
    // Display Info
    displayName: v.string(),
    username: v.optional(v.string()), // @username for Slack/Discord
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    avatar: v.optional(v.string()),
    
    // Status
    isSelected: v.boolean(), // User selected to track
    linkedAt: v.optional(v.number()), // When linked to client
    
    // Stats
    messageCount: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_platform", ["userId", "platform"])
    .index("by_client", ["clientId"])
    .index("by_email", ["email"])
    .index("by_phone", ["phoneNumber"]),

  // ============================================
  // MESSAGES
  // ============================================
  
  messages: defineTable({
    userId: v.id("users"),
    clientId: v.id("clients"),
    platformIdentityId: v.id("platform_identities"),
    
    // Platform Info
    platform: v.string(),
    platformMessageId: v.string(), // Platform's native message ID
    threadId: v.optional(v.string()), // For threading
    
    // Content
    text: v.string(),
    attachments: v.optional(v.array(v.object({
      type: v.string(), // "image", "file", "video"
      url: v.string(),
      filename: v.optional(v.string()),
    }))),
    
    // Metadata
    timestamp: v.number(),
    direction: v.string(), // "inbound", "outbound"
    
    // AI Metadata
    aiMetadata: v.optional(v.object({
      priorityScore: v.optional(v.number()), // 0-100
      sentiment: v.optional(v.string()), // "positive", "neutral", "negative", "frustrated"
      urgency: v.optional(v.string()), // "low", "normal", "high", "urgent"
      extractedActions: v.optional(v.array(v.string())),
      topics: v.optional(v.array(v.string())),
      entities: v.optional(v.array(v.string())), // Companies, projects, people mentioned
      scopeCreepDetected: v.optional(v.boolean()),
      suggestedReply: v.optional(v.string()),
    })),
    
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
    
    // Metadata
    scope: v.optional(v.string()),
    createdAt: v.number(),
    lastRefreshedAt: v.optional(v.number()),
  })
    .index("by_user_platform", ["userId", "platform"]),

  // ============================================
  // ANALYTICS & EVENTS
  // ============================================
  
  analytics_events: defineTable({
    userId: v.optional(v.id("users")),
    
    eventType: v.string(), // "message_received", "ai_scored", "reply_sent", etc.
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
    
    currentStep: v.number(), // 1-5
    completedSteps: v.array(v.number()),
    
    selectedContacts: v.optional(v.array(v.id("platform_identities"))),
    connectedPlatforms: v.array(v.string()),
    
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"]),

  // ============================================
  // IDENTITY LINKING PROPOSALS
  // ============================================
  
  identity_link_proposals: defineTable({
    userId: v.id("users"),
    
    identities: v.array(v.id("platform_identities")),
    status: v.string(), // "pending", "confirmed", "rejected"
    
    confidence: v.number(), // 0-1
    matchingSignals: v.array(v.object({
      signal: v.string(),
      confidence: v.number(),
    })),
    
    proposedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    clientId: v.optional(v.id("clients")), // Set when confirmed
  })
    .index("by_user_status", ["userId", "status"]),

  // ============================================
  // REJECTED MATCHES
  // ============================================
  
  rejected_identity_matches: defineTable({
    userId: v.id("users"),
    identity1: v.id("platform_identities"),
    identity2: v.id("platform_identities"),
    
    rejectedAt: v.number(),
    reason: v.optional(v.string()),
  })
    .index("by_user", ["userId"]),
});
```

---

## MVP Development Plan

### MVP Scope Definition

**MUST HAVE (MVP Core)**
- ✅ User authentication (email + password)
- ✅ Connect Gmail + Slack
- ✅ Import contacts from both platforms
- ✅ User-driven identity linking (manual matching)
- ✅ Unified inbox showing messages from both platforms
- ✅ Basic AI priority scoring
- ✅ Sentiment analysis
- ✅ Client profile with cross-platform timeline
- ✅ Basic dashboard with daily digest

**SHOULD HAVE (Post-MVP v1.1)**
- WhatsApp integration
- Discord integration
- Auto-drafted responses
- Action item extraction
- Relationship health scoring
- Search across all messages

**COULD HAVE (Future)**
- Scope creep detection
- Financial impact dashboard
- Team features
- Mobile apps
- Browser extension

### MVP Timeline: 12 Weeks

```
Week 1:    Foundation & Setup
Week 2-3:  Gmail Integration
Week 3-4:  Slack Integration  
Week 4-5:  Onboarding Flow
Week 5-6:  AI Features & Writing Intelligence
Week 6-7:  Dashboard & UI
Week 7-8:  Testing & Polish
Week 9-10: Desktop App (Electron)
Week 11-12: Launch Preparation
```

---

## Phase-by-Phase Implementation

### **PHASE 0: Project Setup (Week 1)**

#### Goals
- Set up development environment
- Initialize Convex project
- Create project structure
- Set up CI/CD pipeline

#### Tasks

**Day 1-2: Initialize Project**
```bash
# Create Next.js project
npx create-next-app@latest wire --typescript --tailwind --app

# Navigate to project
cd wire

# Install Convex
npm install convex

# Initialize Convex
npx convex dev

# Install Clerk
npm install @clerk/nextjs

# Install additional dependencies
npm install @radix-ui/react-* framer-motion react-hook-form zod
npm install lucide-react date-fns
npm install -D @types/node
```

**Day 3-4: Project Structure**
```
wire/
├── app/                          # Next.js app directory
│   ├── (auth)/                   # Auth routes
│   │   ├── login/
│   │   └── signup/
│   ├── (dashboard)/              # Protected routes
│   │   ├── dashboard/
│   │   ├── clients/
│   │   ├── inbox/
│   │   └── settings/
│   ├── onboarding/               # Onboarding flow
│   │   ├── step-1/
│   │   ├── step-2/
│   │   └── ...
│   └── layout.tsx
├── components/                   # React components
│   ├── ui/                       # shadcn components
│   ├── dashboard/
│   ├── onboarding/
│   └── shared/
├── lib/                          # Utilities
│   ├── utils.ts
│   └── constants.ts
├── convex/                       # Convex backend
│   ├── schema.ts                 # Database schema
│   ├── auth.ts                   # Authentication
│   ├── users.ts                  # User functions
│   ├── clients.ts                # Client functions
│   ├── messages.ts               # Message functions
│   ├── onboarding/               # Onboarding functions
│   │   ├── gmail.ts
│   │   ├── slack.ts
│   │   └── matching.ts
│   ├── ai/                       # AI services
│   │   ├── priority.ts
│   │   ├── sentiment.ts
│   │   └── responses.ts
│   └── _generated/               # Auto-generated
├── public/
├── .env.local
└── package.json
```

**Day 5-7: Core Setup**

1. **Environment Variables**
```bash
# .env.local

# Convex
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOYMENT=dev:your-dev-deployment

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding/step-1

# Google OAuth (for Gmail integration)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Slack OAuth
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret

# Anthropic API
ANTHROPIC_API_KEY=your_anthropic_api_key

# Pinecone
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_env
```

2. **Convex Schema Implementation**
- Create complete schema from above
- Deploy to Convex: `npx convex deploy`

3. **Basic UI Components**
- Install shadcn/ui: `npx shadcn-ui@latest init`
- Add components: button, input, card, dialog, etc.

#### Deliverables
- ✅ Working Next.js + Convex setup
- ✅ Database schema deployed
- ✅ Basic UI component library
- ✅ CI/CD pipeline configured

---

### **PHASE 1: Clerk Authentication Setup (Week 1)**

#### Goals
- Integrate Clerk authentication
- Set up Clerk + Convex synchronization
- Create protected routes
- Implement user profile management

#### Implementation

**1. Clerk Provider Setup**

```typescript
// app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      appearance={{
        variables: { colorPrimary: '#0F172A' },
        elements: {
          formButtonPrimary: 'bg-slate-900 hover:bg-slate-800',
          card: 'shadow-xl',
        },
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <html lang="en">
          <body>{children}</body>
        </html>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

**2. Clerk Middleware for Route Protection**

```typescript
// middleware.ts
import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  // Public routes that don't require authentication
  publicRoutes: [
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks(.*)",
  ],
  
  // Routes to ignore
  ignoredRoutes: [
    "/api/webhooks/clerk",
    "/api/webhooks/stripe",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

**3. Convex Auth Configuration**

```typescript
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

**4. Clerk Webhook Handler (User Sync)**

```typescript
// app/api/webhooks/clerk/route.ts
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  
  if (!WEBHOOK_SECRET) {
    throw new Error('CLERK_WEBHOOK_SECRET is not set');
  }

  // Get headers
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error: Missing svix headers', { status: 400 });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify webhook
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error: Verification failed', { status: 400 });
  }

  // Handle the webhook
  const eventType = evt.type;

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    
    // Create user in Convex
    await convex.mutation(api.users.create, {
      clerkId: id,
      email: email_addresses[0].email_address,
      name: `${first_name || ''} ${last_name || ''}`.trim() || 'User',
      avatar: image_url,
      plan: 'free',
      planStatus: 'active',
      onboardingCompleted: false,
    });
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    
    // Update user in Convex
    await convex.mutation(api.users.updateFromClerk, {
      clerkId: id,
      email: email_addresses[0].email_address,
      name: `${first_name || ''} ${last_name || ''}`.trim(),
      avatar: image_url,
    });
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;
    
    // Soft delete or anonymize user data
    await convex.mutation(api.users.deleteByClerkId, {
      clerkId: id,
    });
  }

  return new Response('Webhook processed', { status: 200 });
}
```

**5. Convex User Management Functions**

```typescript
// convex/users.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create user from Clerk webhook
export const create = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatar: v.optional(v.string()),
    plan: v.string(),
    planStatus: v.string(),
    onboardingCompleted: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (existing) {
      return existing._id;
    }
    
    // Create new user
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      avatar: args.avatar,
      plan: args.plan,
      planStatus: args.planStatus,
      createdAt: Date.now(),
      onboardingCompleted: args.onboardingCompleted,
    });
    
    return userId;
  },
});

// Update user from Clerk webhook
export const updateFromClerk = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) {
      throw new Error("User not found");
    }
    
    await ctx.db.patch(user._id, {
      email: args.email,
      name: args.name,
      avatar: args.avatar,
      lastLoginAt: Date.now(),
    });
    
    return user._id;
  },
});

// Get current user (with authentication)
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      return null;
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    
    return user;
  },
});

// Delete user
export const deleteByClerkId = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (!user) {
      return;
    }
    
    // Soft delete: anonymize data
    await ctx.db.patch(user._id, {
      email: `deleted-${Date.now()}@deleted.com`,
      name: "Deleted User",
      avatar: undefined,
    });
    
    // Or hard delete (uncomment if preferred)
    // await ctx.db.delete(user._id);
  },
});
```

**6. Sign-In Page**

```typescript
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Welcome back
          </h1>
          <p className="text-slate-600">
            Sign in to access your client dashboard
          </p>
        </div>
        <SignIn 
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-2xl",
            },
          }}
        />
      </div>
    </div>
  );
}
```

**7. Sign-Up Page**

```typescript
// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Get started with Wire
          </h1>
          <p className="text-slate-600">
            Unify your client communications in minutes
          </p>
        </div>
        <SignUp 
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-2xl",
            },
          }}
        />
      </div>
    </div>
  );
}
```

**8. Protected Dashboard Layout**

```typescript
// app/(dashboard)/layout.tsx
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = auth();
  
  if (!userId) {
    redirect('/sign-in');
  }
  
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold">Wire</h1>
            </div>
            <div className="flex items-center gap-4">
              <UserButton 
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-10 h-10",
                  },
                }}
              />
            </div>
          </div>
        </div>
      </nav>
      
      {/* Main content */}
      <main>{children}</main>
    </div>
  );
}
```

**9. Using Auth in Components**

```typescript
// components/Dashboard.tsx
'use client';

import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export function Dashboard() {
  const { user: clerkUser } = useUser();
  const convexUser = useQuery(api.users.getCurrentUser);
  
  if (!clerkUser || !convexUser) {
    return <div>Loading...</div>;
  }
  
  return (
    <div>
      <h1>Welcome, {convexUser.name}!</h1>
      <p>Email: {convexUser.email}</p>
      <p>Plan: {convexUser.plan}</p>
    </div>
  );
}
```

**10. Server-Side Auth in API Routes**

```typescript
// app/api/some-route/route.ts
import { auth } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

export async function GET() {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  
  // Use userId to query Convex or perform operations
  return NextResponse.json({ userId });
}
```

#### Clerk Dashboard Configuration

**1. Go to Clerk Dashboard** (https://dashboard.clerk.com)

**2. Configure OAuth Providers:**
- Enable Google (for easy signup)
- Enable GitHub (optional)
- Configure redirect URLs:
  - Development: `http://localhost:3000`
  - Production: `https://yourdomain.com`

**3. Set up Webhooks:**
- Endpoint: `https://yourdomain.com/api/webhooks/clerk`
- Events to subscribe to:
  - `user.created`
  - `user.updated`
  - `user.deleted`
- Copy webhook secret to `CLERK_WEBHOOK_SECRET`

**4. Customize Appearance:**
- Upload logo
- Set brand colors
- Customize sign-in/sign-up flows

#### Testing Authentication

```typescript
// Test user creation flow
describe('Clerk Authentication', () => {
  it('should create user in Convex on signup', async () => {
    // Sign up via Clerk
    const clerkUser = await signUpWithClerk({
      email: 'test@example.com',
      password: 'SecurePassword123!',
    });
    
    // Wait for webhook to process
    await sleep(1000);
    
    // Verify user exists in Convex
    const convexUser = await convex.query(api.users.getByClerkId, {
      clerkId: clerkUser.id,
    });
    
    expect(convexUser).toBeDefined();
    expect(convexUser.email).toBe('test@example.com');
  });
});
```

#### Deliverables
- ✅ Clerk authentication fully integrated
- ✅ Webhook handler syncing users to Convex
- ✅ Protected routes with middleware
- ✅ Sign-in and sign-up pages
- ✅ User profile management
- ✅ Server and client-side auth hooks

---

### **PHASE 2: Gmail Integration (Week 2-3)**

#### Goals
- Implement Gmail OAuth flow
- Fetch and store Gmail messages
- Create platform_identities for Gmail contacts

#### Implementation Steps

**1. Gmail OAuth Setup**

```typescript
// convex/onboarding/gmail.ts
import { action } from "../_generated/server";
import { google } from "googleapis";

export const initiateOAuth = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000/api/auth/google/callback'
    );
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      state: args.userId, // Pass userId in state
    });
    
    return { authUrl };
  },
});

export const handleCallback = action({
  args: { 
    code: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000/api/auth/google/callback'
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(args.code);
    
    // Store tokens in Convex
    await ctx.runMutation(api.oauth.storeTokens, {
      userId: args.userId,
      platform: "gmail",
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date,
    });
    
    return { success: true };
  },
});
```

**2. Import Gmail Contacts**

```typescript
// convex/onboarding/gmail.ts (continued)
export const importContacts = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Get OAuth tokens
    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "gmail",
    });
    
    // Set up Gmail API
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Fetch messages (last 500)
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 500,
      q: '-from:me', // Exclude sent messages
    });
    
    const messageIds = response.data.messages || [];
    const contactMap = new Map<string, Contact>();
    
    // Fetch full message details
    for (const msg of messageIds) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
      });
      
      const headers = full.data.payload?.headers || [];
      const fromHeader = headers.find(h => h.name === 'From');
      
      if (fromHeader) {
        const { email, name } = parseEmailAddress(fromHeader.value!);
        
        if (!contactMap.has(email)) {
          contactMap.set(email, {
            email,
            name: name || email,
            messageCount: 1,
            lastMessageDate: parseInt(full.data.internalDate!),
          });
        } else {
          contactMap.get(email)!.messageCount++;
        }
      }
    }
    
    // Store as platform_identities
    const contacts = Array.from(contactMap.values());
    for (const contact of contacts) {
      await ctx.runMutation(api.identities.create, {
        userId: args.userId,
        platform: "gmail",
        platformUserId: contact.email,
        displayName: contact.name,
        email: contact.email,
        messageCount: contact.messageCount,
        firstSeenAt: Date.now(),
        lastSeenAt: contact.lastMessageDate,
        isSelected: false,
      });
    }
    
    return { 
      count: contacts.length,
      contacts: contacts.slice(0, 20), // Return top 20 for preview
    };
  },
});

function parseEmailAddress(raw: string): { email: string; name?: string } {
  // Parse "John Doe <john@example.com>" format
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: raw.trim() };
}
```

**3. Sync Gmail Messages**

```typescript
// convex/sync/gmail.ts
export const syncMessages = action({
  args: { 
    userId: v.id("users"),
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.runQuery(api.identities.get, { 
      id: args.identityId 
    });
    
    if (!identity || !identity.clientId) {
      throw new Error("Identity not linked to client");
    }
    
    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "gmail",
    });
    
    const gmail = setupGmailClient(tokens);
    
    // Fetch messages from/to this contact
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: `from:${identity.email} OR to:${identity.email}`,
      maxResults: 100,
    });
    
    const messageIds = response.data.messages || [];
    
    for (const msg of messageIds) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });
      
      // Extract message data
      const headers = full.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const to = headers.find(h => h.name === 'To')?.value || '';
      
      // Get message body
      const body = extractMessageBody(full.data.payload!);
      
      // Determine direction
      const direction = from.includes(identity.email) ? 'inbound' : 'outbound';
      
      // Store message
      await ctx.runMutation(api.messages.create, {
        userId: args.userId,
        clientId: identity.clientId,
        platformIdentityId: args.identityId,
        platform: "gmail",
        platformMessageId: msg.id!,
        text: `${subject}\n\n${body}`,
        timestamp: parseInt(full.data.internalDate!),
        direction,
        isRead: !full.data.labelIds?.includes('UNREAD'),
        aiProcessed: false,
      });
    }
    
    return { synced: messageIds.length };
  },
});

function extractMessageBody(payload: any): string {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }
  
  return '';
}
```

#### Deliverables
- ✅ Gmail OAuth connection flow
- ✅ Import Gmail contacts
- ✅ Sync Gmail messages
- ✅ Store in Convex database

---

### **PHASE 3: Slack Integration (Week 3-4)**

#### Goals
- Implement Slack OAuth
- Import Slack workspace users
- Sync Slack messages

#### Implementation

**1. Slack OAuth**

```typescript
// convex/onboarding/slack.ts
import { action } from "../_generated/server";
import { WebClient } from '@slack/web-api';

export const initiateOAuth = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const authUrl = `https://slack.com/oauth/v2/authorize?` +
      `client_id=${process.env.SLACK_CLIENT_ID}&` +
      `scope=channels:history,channels:read,users:read,users:read.email&` +
      `state=${args.userId}`;
    
    return { authUrl };
  },
});

export const handleCallback = action({
  args: {
    code: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const client = new WebClient();
    
    const result = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code: args.code,
    });
    
    await ctx.runMutation(api.oauth.storeTokens, {
      userId: args.userId,
      platform: "slack",
      accessToken: result.access_token!,
      scope: result.scope!,
    });
    
    return { success: true };
  },
});
```

**2. Import Slack Users**

```typescript
// convex/onboarding/slack.ts (continued)
export const importUsers = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "slack",
    });
    
    const client = new WebClient(tokens.accessToken);
    
    // Get workspace users
    const result = await client.users.list();
    
    const users = result.members
      ?.filter(u => !u.is_bot && !u.deleted)
      .map(u => ({
        platformUserId: u.id!,
        displayName: u.real_name || u.name!,
        username: u.name!,
        email: u.profile?.email,
        avatar: u.profile?.image_192,
      }));
    
    // Store as platform_identities
    for (const user of users || []) {
      await ctx.runMutation(api.identities.create, {
        userId: args.userId,
        platform: "slack",
        platformUserId: user.platformUserId,
        displayName: user.displayName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        messageCount: 0,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        isSelected: false,
      });
    }
    
    return { count: users?.length || 0 };
  },
});
```

**3. Sync Slack Messages**

```typescript
// convex/sync/slack.ts
export const syncMessages = action({
  args: {
    userId: v.id("users"),
    identityId: v.id("platform_identities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.runQuery(api.identities.get, { 
      id: args.identityId 
    });
    
    const tokens = await ctx.runQuery(api.oauth.getTokens, {
      userId: args.userId,
      platform: "slack",
    });
    
    const client = new WebClient(tokens.accessToken);
    
    // Get DM channel with this user
    const imResult = await client.conversations.open({
      users: identity.platformUserId,
    });
    
    const channelId = imResult.channel?.id;
    
    if (channelId) {
      // Fetch message history
      const history = await client.conversations.history({
        channel: channelId,
        limit: 100,
      });
      
      for (const message of history.messages || []) {
        if (message.text && message.ts) {
          const direction = message.user === identity.platformUserId 
            ? 'inbound' 
            : 'outbound';
          
          await ctx.runMutation(api.messages.create, {
            userId: args.userId,
            clientId: identity.clientId!,
            platformIdentityId: args.identityId,
            platform: "slack",
            platformMessageId: message.ts,
            text: message.text,
            timestamp: parseFloat(message.ts) * 1000,
            direction,
            isRead: true,
            aiProcessed: false,
          });
        }
      }
    }
    
    return { success: true };
  },
});
```

#### Deliverables
- ✅ Slack OAuth integration
- ✅ Import Slack users
- ✅ Sync Slack DMs
- ✅ Store in database

---

### **PHASE 4: Onboarding Flow (Week 4-5)**

#### Goals
- Build 5-step onboarding wizard
- Implement contact selection UI
- Create identity matching interface

#### Implementation

**Step 1: Connect First Platform**

```typescript
// app/onboarding/step-1/page.tsx
'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function Step1() {
  const initiateGmailOAuth = useMutation(api.onboarding.gmail.initiateOAuth);
  
  const handleConnectGmail = async () => {
    const result = await initiateGmailOAuth({ userId: currentUserId });
    window.location.href = result.authUrl;
  };
  
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Connect your first platform</h1>
      <p className="text-gray-600 mb-8">
        We'll start with Gmail to find your clients
      </p>
      
      <Card className="p-6 hover:shadow-lg transition cursor-pointer"
            onClick={handleConnectGmail}>
        <div className="flex items-center gap-4">
          <div className="text-4xl">📧</div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">Gmail</h3>
            <p className="text-sm text-gray-600">
              Scan your inbox to find people you communicate with
            </p>
          </div>
          <Button>Connect</Button>
        </div>
      </Card>
      
      <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
        <span className="text-green-600">🔒</span>
        We only read sender info, not message content
      </div>
    </div>
  );
}
```

**Step 2: Review & Select Contacts**

```typescript
// app/onboarding/step-2/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Checkbox } from '@/components/ui/checkbox';

export default function Step2() {
  const contacts = useQuery(api.identities.listByPlatform, {
    userId: currentUserId,
    platform: "gmail",
  });
  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  
  const toggleContact = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };
  
  const handleContinue = async () => {
    // Mark selected contacts
    for (const id of selected) {
      await markAsSelected({ identityId: id });
    }
    router.push('/onboarding/step-3');
  };
  
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">
        Gmail Connected! ✅
      </h1>
      <p className="text-gray-600 mb-8">
        We found {contacts?.length} people you've emailed with
      </p>
      
      <div className="space-y-2">
        {contacts?.map(contact => (
          <div 
            key={contact._id}
            className="flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
            onClick={() => toggleContact(contact._id)}
          >
            <Checkbox checked={selected.has(contact._id)} />
            <div className="w-10 h-10 bg-gray-300 rounded-full" />
            <div className="flex-1">
              <div className="font-medium">{contact.displayName}</div>
              <div className="text-sm text-gray-600">{contact.email}</div>
              <div className="text-xs text-gray-500">
                {contact.messageCount} emails
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 flex justify-between">
        <Button variant="outline">Back</Button>
        <Button onClick={handleContinue} disabled={selected.size === 0}>
          Continue with {selected.size} contacts →
        </Button>
      </div>
    </div>
  );
}
```

**Step 4: Match Identities**

```typescript
// app/onboarding/step-4/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';

export default function Step4() {
  const gmailContacts = useQuery(api.identities.getSelectedByPlatform, {
    userId: currentUserId,
    platform: "gmail",
  });
  
  const slackUsers = useQuery(api.identities.listByPlatform, {
    userId: currentUserId,
    platform: "slack",
  });
  
  const [selectedSlackUser, setSelectedSlackUser] = useState(null);
  const linkToClient = useMutation(api.matching.linkToClient);
  const createClient = useMutation(api.clients.createFromIdentity);
  
  const handleLink = async (slackUserId, gmailContactId) => {
    // Get the client ID from gmail contact
    const gmailContact = gmailContacts.find(c => c._id === gmailContactId);
    
    if (gmailContact?.clientId) {
      // Link to existing client
      await linkToClient({
        identityId: slackUserId,
        clientId: gmailContact.clientId,
      });
    } else {
      // Create new client and link both
      const clientId = await createClient({
        identityId: gmailContactId,
      });
      await linkToClient({
        identityId: slackUserId,
        clientId,
      });
    }
    
    setSelectedSlackUser(null);
  };
  
  const handleCreateNew = async (slackUserId) => {
    await createClient({ identityId: slackUserId });
    setSelectedSlackUser(null);
  };
  
  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">
        Link Slack users to your contacts
      </h1>
      
      <div className="grid grid-cols-2 gap-8">
        {/* Left: Gmail Contacts */}
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Your Contacts (from Gmail)
          </h2>
          <div className="space-y-2">
            {gmailContacts?.map(contact => (
              <div key={contact._id} className="p-3 border rounded">
                <div className="font-medium">{contact.displayName}</div>
                <div className="text-sm text-gray-600">{contact.email}</div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Right: Slack Users */}
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Slack Users
          </h2>
          <div className="space-y-2">
            {slackUsers?.map(user => (
              <div 
                key={user._id}
                className="p-3 border rounded cursor-pointer hover:bg-gray-50"
                onClick={() => setSelectedSlackUser(user)}
              >
                <div className="font-medium">{user.displayName}</div>
                <div className="text-sm text-gray-600">@{user.username}</div>
                {user.email && (
                  <div className="text-xs text-gray-500">{user.email}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Link Dialog */}
      {selectedSlackUser && (
        <LinkDialog
          slackUser={selectedSlackUser}
          gmailContacts={gmailContacts}
          onLink={handleLink}
          onCreateNew={handleCreateNew}
          onClose={() => setSelectedSlackUser(null)}
        />
      )}
    </div>
  );
}
```

#### Deliverables
- ✅ Complete 5-step onboarding wizard
- ✅ Contact selection interface
- ✅ Identity matching UI
- ✅ Onboarding state persistence

---

### **PHASE 5: AI Features & Writing Intelligence (Week 5-6)**

#### Goals
- Implement priority scoring
- Add sentiment analysis
- Build action extraction
- Create auto-response generation
- Add real-time writing assistance (Grammarly-inspired)
- Implement tone detection and adjustment

#### Implementation

**1. Priority Scoring**

```typescript
// convex/ai/priority.ts
import { action } from "../_generated/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const scoreMessage = action({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(api.messages.get, { id: args.messageId });
    const client = await ctx.runQuery(api.clients.get, { id: message.clientId });
    
    // Build context
    const prompt = `Analyze this message and score its priority (0-100):

Client: ${client.name}
Client Value: ${client.totalRevenue ? `$${client.totalRevenue}` : 'Unknown'}
Message: "${message.text}"

Consider:
- Urgency indicators (ASAP, urgent, deadline, etc.)
- Client value (higher revenue = higher priority)
- Sentiment (frustrated/angry = higher priority)
- Action items mentioned
- Time sensitivity

Respond ONLY with JSON:
{
  "score": 85,
  "reasoning": "Contains deadline + frustrated tone + high-value client",
  "factors": ["deadline_mentioned", "negative_sentiment", "high_value_client"]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: prompt,
      }],
    });
    
    const result = JSON.parse(response.content[0].text);
    
    // Update message with AI metadata
    await ctx.runMutation(api.messages.updateAiMetadata, {
      messageId: args.messageId,
      metadata: {
        priorityScore: result.score,
        urgency: result.score > 80 ? "urgent" : result.score > 60 ? "high" : "normal",
      },
    });
    
    return result;
  },
});
```

**2. Sentiment Analysis**

```typescript
// convex/ai/sentiment.ts
export const analyzeSentiment = action({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(api.messages.get, { id: args.messageId });
    
    const prompt = `Analyze the sentiment of this message:

"${message.text}"

Respond ONLY with JSON:
{
  "sentiment": "positive|neutral|negative|frustrated",
  "confidence": 0.95,
  "indicators": ["uses exclamation marks", "expresses concern"]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    
    const result = JSON.parse(response.content[0].text);
    
    await ctx.runMutation(api.messages.updateAiMetadata, {
      messageId: args.messageId,
      metadata: {
        sentiment: result.sentiment,
      },
    });
    
    return result;
  },
});
```

**3. Action Extraction**

```typescript
// convex/ai/actions.ts
export const extractActions = action({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(api.messages.get, { id: args.messageId });
    
    const prompt = `Extract action items from this message:

"${message.text}"

Respond ONLY with JSON:
{
  "actions": [
    "Schedule call for Friday",
    "Send revised proposal",
    "Update timeline document"
  ]
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    
    const result = JSON.parse(response.content[0].text);
    
    await ctx.runMutation(api.messages.updateAiMetadata, {
      messageId: args.messageId,
      metadata: {
        extractedActions: result.actions,
      },
    });
    
    return result;
  },
});
```

**4. Batch Processing**

```typescript
// convex/ai/batch.ts
export const processMessageBatch = action({
  args: { 
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get unprocessed messages
    const messages = await ctx.runQuery(api.messages.getUnprocessed, {
      userId: args.userId,
      limit: args.limit || 50,
    });
    
    for (const message of messages) {
      // Run all AI analyses in parallel
      await Promise.all([
        ctx.runAction(api.ai.priority.scoreMessage, { messageId: message._id }),
        ctx.runAction(api.ai.sentiment.analyzeSentiment, { messageId: message._id }),
        ctx.runAction(api.ai.actions.extractActions, { messageId: message._id }),
      ]);
      
      // Mark as processed
      await ctx.runMutation(api.messages.markAsProcessed, {
        messageId: message._id,
      });
    }
    
    return { processed: messages.length };
  },
});
```

---

**5. Real-Time Writing Assistance (Grammarly-Inspired)**

This is a critical feature that helps freelancers write better client communications in real-time.

**Architecture Overview:**
```
User Types in Reply Composer
    ↓
Debounced Analysis (500ms after typing stops)
    ↓
Multiple AI Checks Run in Parallel:
    - Grammar/Spelling
    - Tone Analysis
    - Clarity Scoring
    - Client Context Matching
    - Formality Level
    ↓
Inline Suggestions Displayed
    ↓
User Accepts/Rejects/Edits
    ↓
Learn from User Choices
```

**Implementation:**

```typescript
// convex/ai/writing-assistant.ts
import { action } from "../_generated/server";
import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Main writing analysis function
export const analyzeWriting = action({
  args: {
    text: v.string(),
    clientId: v.id("clients"),
    context: v.optional(v.object({
      isReply: v.boolean(),
      originalMessage: v.optional(v.string()),
      urgency: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // Get client data for context
    const client = await ctx.runQuery(api.clients.get, { id: args.clientId });
    
    // Get client's communication preferences
    const preferences = await ctx.runQuery(api.ai.patterns.getClientPreferences, {
      clientId: args.clientId,
    });
    
    // Run all analyses in parallel
    const [
      toneAnalysis,
      clarityScore,
      grammarCheck,
      formalityLevel,
      clientMatch,
      readerReaction,
    ] = await Promise.all([
      analyzeTone(args.text),
      analyzeClarity(args.text),
      checkGrammar(args.text),
      detectFormality(args.text),
      matchClientStyle(args.text, client, preferences),
      predictReaction(args.text, client, preferences),
    ]);
    
    return {
      tone: toneAnalysis,
      clarity: clarityScore,
      grammar: grammarCheck,
      formality: formalityLevel,
      clientMatch,
      readerReaction,
      suggestions: generateSuggestions({
        text: args.text,
        tone: toneAnalysis,
        clarity: clarityScore,
        formality: formalityLevel,
        clientMatch,
      }),
    };
  },
});

// Tone Analysis
async function analyzeTone(text: string) {
  const prompt = `Analyze the tone of this message:

"${text}"

Respond ONLY with JSON:
{
  "primaryTone": "professional|casual|apologetic|confident|defensive|friendly|cold|urgent",
  "intensity": 0.8,
  "secondaryTones": ["apologetic", "worried"],
  "emotionalSignals": ["excessive apologizing", "defensive language"],
  "appropriateness": "low|medium|high",
  "reasoning": "brief explanation"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });
  
  return JSON.parse(response.content[0].text);
}

// Clarity Analysis
async function analyzeClarity(text: string) {
  const prompt = `Analyze the clarity of this business communication:

"${text}"

Respond ONLY with JSON:
{
  "score": 75,
  "readingLevel": "professional",
  "issues": [
    {
      "type": "wordiness|jargon|unclear|passive_voice|complex_sentence",
      "sentence": "the problematic sentence",
      "suggestion": "clearer alternative",
      "severity": "low|medium|high"
    }
  ],
  "strengths": ["clear call to action", "concise"],
  "overallAssessment": "brief summary"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  
  return JSON.parse(response.content[0].text);
}

// Grammar Check (using external library + AI for context)
async function checkGrammar(text: string) {
  // Use LanguageTool for basic checks
  // Then enhance with Claude for contextual corrections
  
  const prompt = `Check this message for grammar, spelling, and punctuation errors:

"${text}"

Respond ONLY with JSON:
{
  "errors": [
    {
      "type": "grammar|spelling|punctuation",
      "errorText": "the error",
      "position": [start, end],
      "suggestions": ["correction1", "correction2"],
      "explanation": "why this is wrong",
      "severity": "critical|important|minor"
    }
  ],
  "errorCount": 2
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });
  
  return JSON.parse(response.content[0].text);
}

// Formality Detection
async function detectFormality(text: string) {
  const prompt = `Rate the formality level of this message on a scale of 1-5:

"${text}"

1 = Very Casual (Hey! What's up?)
2 = Casual (Hi there, hope you're doing well)
3 = Professional (Hello, I wanted to follow up)
4 = Formal (Dear Sir/Madam, I am writing to)
5 = Very Formal (To Whom It May Concern)

Respond ONLY with JSON:
{
  "level": 3,
  "indicators": ["uses contractions", "friendly greeting"],
  "recommendation": 2,
  "reasoning": "client prefers casual communication"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  
  return JSON.parse(response.content[0].text);
}

// Match Client Style
async function matchClientStyle(
  text: string,
  client: any,
  preferences: any
) {
  const prompt = `Compare this draft message to the client's communication preferences:

Draft: "${text}"

Client Preferences:
- Preferred formality: ${preferences.formality || "professional"}
- Typical greeting: ${preferences.greeting || "Hi [name]"}
- Uses emojis: ${preferences.usesEmojis || false}
- Average message length: ${preferences.avgLength || "medium"}
- Tone preference: ${preferences.tonePreference || "friendly-professional"}

Respond ONLY with JSON:
{
  "matchScore": 0.75,
  "mismatches": [
    {
      "aspect": "formality",
      "yourStyle": "too casual",
      "clientPreference": "professional",
      "suggestion": "use 'Hello' instead of 'Hey'"
    }
  ],
  "strengths": ["matches length preference"],
  "overallFit": "good|needs_adjustment|poor"
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });
  
  return JSON.parse(response.content[0].text);
}

// Predict Reader Reaction
async function predictReaction(
  text: string,
  client: any,
  preferences: any
) {
  const prompt = `Predict how this client will react to this message:

Message: "${text}"

Client Context:
- Relationship status: ${client.relationshipHealth}/100
- Current project: ${preferences.currentProject || "Unknown"}
- Recent sentiment: ${preferences.recentSentiment || "neutral"}
- Communication frequency: ${preferences.frequency || "weekly"}
- Past reactions to delays: ${preferences.delayTolerance || "medium"}

Respond ONLY with JSON:
{
  "predictedReaction": "positive|neutral|concerned|frustrated|angry",
  "confidence": 0.82,
  "reasoning": [
    "Client has been patient with delays before",
    "But this is the second delay on this project"
  ],
  "riskFactors": [
    "Timeline is critical for client's launch",
    "Client paid rush premium"
  ],
  "recommendations": [
    "Acknowledge inconvenience explicitly",
    "Offer specific solution or compromise",
    "Suggest call to discuss concerns"
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  
  return JSON.parse(response.content[0].text);
}

// Generate Actionable Suggestions
function generateSuggestions(analysis: any): any[] {
  const suggestions = [];
  
  // Tone suggestions
  if (analysis.tone.appropriateness === "low") {
    suggestions.push({
      type: "tone",
      severity: "high",
      message: `Tone is too ${analysis.tone.primaryTone}`,
      suggestion: `Try: More ${analysis.clientMatch.clientPreference}`,
      action: "rewrite_tone",
    });
  }
  
  // Clarity suggestions
  if (analysis.clarity.score < 70) {
    suggestions.push({
      type: "clarity",
      severity: "medium",
      message: "Message could be clearer",
      suggestion: `Simplify ${analysis.clarity.issues.length} complex sections`,
      action: "simplify",
    });
  }
  
  // Formality suggestions
  if (Math.abs(analysis.formality.level - analysis.formality.recommendation) > 1) {
    suggestions.push({
      type: "formality",
      severity: "medium",
      message: `Formality mismatch (yours: ${analysis.formality.level}, client prefers: ${analysis.formality.recommendation})`,
      suggestion: "Adjust to match client's style",
      action: "adjust_formality",
    });
  }
  
  // Grammar suggestions
  if (analysis.grammar.errorCount > 0) {
    suggestions.push({
      type: "grammar",
      severity: "high",
      message: `${analysis.grammar.errorCount} grammar/spelling errors`,
      suggestion: "Fix errors before sending",
      action: "fix_grammar",
    });
  }
  
  return suggestions;
}

// Rewrite Functions
export const rewriteWithTone = action({
  args: {
    text: v.string(),
    targetTone: v.string(),
    clientContext: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const prompt = `Rewrite this message with a ${args.targetTone} tone:

Original: "${args.text}"

${args.clientContext ? `Client Context: ${JSON.stringify(args.clientContext)}` : ''}

Maintain the key information and intent, but adjust the tone.
Respond with ONLY the rewritten message, no explanation.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    
    return response.content[0].text;
  },
});

export const adjustFormality = action({
  args: {
    text: v.string(),
    targetLevel: v.number(), // 1-5
  },
  handler: async (ctx, args) => {
    const formalityLabels = {
      1: "very casual (like texting a friend)",
      2: "casual but professional",
      3: "standard professional",
      4: "formal business",
      5: "very formal/legal"
    };
    
    const prompt = `Rewrite this message at formality level ${args.targetLevel} (${formalityLabels[args.targetLevel]}):

Original: "${args.text}"

Maintain all key information but adjust formality.
Respond with ONLY the rewritten message.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    
    return response.content[0].text;
  },
});

export const simplifyClarify = action({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const prompt = `Rewrite this message to be clearer and more concise:

Original: "${args.text}"

Goals:
- Remove wordiness
- Eliminate jargon
- Use active voice
- Break up complex sentences
- Maintain all key information

Respond with ONLY the rewritten message.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    
    return response.content[0].text;
  },
});
```

**Frontend Integration:**

```typescript
// components/ReplyComposer.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { debounce } from 'lodash';

export function ReplyComposer({ 
  client, 
  originalMessage,
  onSend 
}: ReplyComposerProps) {
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<WritingAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const analyzeWriting = useAction(api.ai.writingAssistant.analyzeWriting);
  const rewriteWithTone = useAction(api.ai.writingAssistant.rewriteWithTone);
  const adjustFormality = useAction(api.ai.writingAssistant.adjustFormality);
  
  // Debounced analysis - runs 500ms after user stops typing
  const debouncedAnalyze = useCallback(
    debounce(async (content: string) => {
      if (content.length < 10) return; // Don't analyze very short text
      
      setIsAnalyzing(true);
      const result = await analyzeWriting({
        text: content,
        clientId: client._id,
        context: {
          isReply: true,
          originalMessage: originalMessage?.text,
        },
      });
      setAnalysis(result);
      setIsAnalyzing(false);
    }, 500),
    [client._id, analyzeWriting]
  );
  
  useEffect(() => {
    if (text) {
      debouncedAnalyze(text);
    }
  }, [text, debouncedAnalyze]);
  
  const handleApplySuggestion = async (suggestion: Suggestion) => {
    switch (suggestion.action) {
      case 'rewrite_tone':
        const rewritten = await rewriteWithTone({
          text,
          targetTone: suggestion.targetTone,
          clientContext: { clientId: client._id },
        });
        setText(rewritten);
        break;
        
      case 'adjust_formality':
        const adjusted = await adjustFormality({
          text,
          targetLevel: suggestion.targetLevel,
        });
        setText(adjusted);
        break;
        
      case 'simplify':
        const simplified = await simplifyClarify({ text });
        setText(simplified);
        break;
        
      case 'fix_grammar':
        // Apply grammar fixes
        applyGrammarFixes(analysis.grammar.errors);
        break;
    }
  };
  
  return (
    <div className="flex flex-col gap-4">
      {/* Original Message Context */}
      {originalMessage && (
        <div className="p-3 bg-gray-50 rounded-lg border">
          <div className="text-xs text-gray-600 mb-1">Replying to:</div>
          <div className="text-sm">{originalMessage.text}</div>
        </div>
      )}
      
      {/* Composer */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Reply to ${client.name}...`}
          className="w-full min-h-[200px] p-4 border rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        
        {isAnalyzing && (
          <div className="absolute top-2 right-2">
            <span className="text-xs text-gray-500">Analyzing...</span>
          </div>
        )}
      </div>
      
      {/* Real-time Analysis Panel */}
      {analysis && (
        <div className="space-y-4">
          {/* Tone Indicator */}
          <div className="flex items-center justify-between p-3 bg-white border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="text-2xl">
                {getToneEmoji(analysis.tone.primaryTone)}
              </div>
              <div>
                <div className="font-medium capitalize">
                  Tone: {analysis.tone.primaryTone}
                </div>
                <div className="text-xs text-gray-600">
                  {analysis.tone.reasoning}
                </div>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm ${
              analysis.tone.appropriateness === 'high' ? 'bg-green-100 text-green-700' :
              analysis.tone.appropriateness === 'medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {analysis.tone.appropriateness === 'high' ? '✓ Good' :
               analysis.tone.appropriateness === 'medium' ? '⚠ OK' :
               '✗ Improve'}
            </div>
          </div>
          
          {/* Clarity Score */}
          <div className="p-3 bg-white border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Clarity Score</span>
              <span className="text-2xl font-bold">{analysis.clarity.score}/100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  analysis.clarity.score >= 80 ? 'bg-green-500' :
                  analysis.clarity.score >= 60 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${analysis.clarity.score}%` }}
              />
            </div>
          </div>
          
          {/* Suggestions */}
          {analysis.suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="font-medium text-sm">Suggestions:</div>
              {analysis.suggestions.map((suggestion, idx) => (
                <div 
                  key={idx}
                  className="flex items-start justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-blue-900">
                      {suggestion.message}
                    </div>
                    <div className="text-xs text-blue-700 mt-1">
                      {suggestion.suggestion}
                    </div>
                  </div>
                  <button
                    onClick={() => handleApplySuggestion(suggestion)}
                    className="ml-3 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Reader Reaction Prediction */}
          {analysis.readerReaction && (
            <div className={`p-4 rounded-lg border-2 ${
              analysis.readerReaction.predictedReaction === 'positive' ? 'bg-green-50 border-green-200' :
              analysis.readerReaction.predictedReaction === 'neutral' ? 'bg-gray-50 border-gray-200' :
              analysis.readerReaction.predictedReaction === 'concerned' ? 'bg-yellow-50 border-yellow-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">
                  {analysis.readerReaction.predictedReaction === 'positive' ? '😊' :
                   analysis.readerReaction.predictedReaction === 'neutral' ? '😐' :
                   analysis.readerReaction.predictedReaction === 'concerned' ? '😟' :
                   '😠'}
                </span>
                <span className="font-semibold capitalize">
                  Predicted Reaction: {analysis.readerReaction.predictedReaction}
                </span>
                <span className="text-sm text-gray-600">
                  ({Math.round(analysis.readerReaction.confidence * 100)}% confident)
                </span>
              </div>
              
              {analysis.readerReaction.riskFactors.length > 0 && (
                <div className="mt-2">
                  <div className="text-sm font-medium mb-1">Risk Factors:</div>
                  <ul className="text-sm space-y-1">
                    {analysis.readerReaction.riskFactors.map((risk, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span>⚠️</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {analysis.readerReaction.recommendations.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium mb-1">Recommendations:</div>
                  <ul className="text-sm space-y-1">
                    {analysis.readerReaction.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span>💡</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {/* Formality Adjuster */}
          <div className="p-3 bg-white border rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">Formality Level</span>
              <span className="text-sm text-gray-600">
                Current: {analysis.formality.level}/5
                {analysis.formality.recommendation !== analysis.formality.level && (
                  <span className="ml-2 text-blue-600">
                    (Recommend: {analysis.formality.recommendation}/5)
                  </span>
                )}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={analysis.formality.level}
              onChange={(e) => {
                handleApplySuggestion({
                  action: 'adjust_formality',
                  targetLevel: parseInt(e.target.value),
                });
              }}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>Very Casual</span>
              <span>Professional</span>
              <span>Very Formal</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Send Button */}
      <div className="flex justify-end gap-2">
        <button className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
          Cancel
        </button>
        <button 
          onClick={() => onSend(text)}
          disabled={!text || analysis?.grammar?.errorCount > 0}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send Reply
        </button>
      </div>
    </div>
  );
}

function getToneEmoji(tone: string): string {
  const emojiMap: Record<string, string> = {
    professional: '💼',
    casual: '😊',
    apologetic: '😔',
    confident: '💪',
    defensive: '🛡️',
    friendly: '🤝',
    cold: '❄️',
    urgent: '⚡',
  };
  return emojiMap[tone] || '💬';
}
```

#### Deliverables
- ✅ Priority scoring system
- ✅ Sentiment analysis
- ✅ Action extraction
- ✅ Batch processing for efficiency
- ✅ Real-time writing assistance (tone, clarity, grammar)
- ✅ Client-context-aware suggestions
- ✅ Formality adjustment tools
- ✅ Reader reaction prediction

---

### **PHASE 6: Dashboard & UI (Week 6-7)**

#### Goals
- Build main dashboard
- Create client profile pages
- Implement inbox views
- Add daily digest

#### Implementation

**Main Dashboard**

```typescript
// app/dashboard/page.tsx
'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export default function Dashboard() {
  const user = useCurrentUser();
  const stats = useQuery(api.analytics.getDailyStats, { userId: user._id });
  const urgentMessages = useQuery(api.messages.getUrgent, { userId: user._id });
  const clients = useQuery(api.clients.getByUser, { userId: user._id });
  
  return (
    <div className="max-w-7xl mx-auto p-8">
      {/* Daily Digest */}
      <Card className="mb-8 p-6">
        <h2 className="text-2xl font-bold mb-4">Daily Digest</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon="📧"
            value={stats?.totalMessages || 0}
            label="Messages"
          />
          <StatCard
            icon="🔴"
            value={stats?.urgentMessages || 0}
            label="Urgent"
            color="red"
          />
          <StatCard
            icon="⚡"
            value={stats?.actionItems || 0}
            label="Actions"
          />
          <StatCard
            icon="👥"
            value={stats?.activeClients || 0}
            label="Clients"
          />
        </div>
        
        {/* Key Insights */}
        <div className="mt-6 space-y-2">
          <InsightItem icon="🚨" color="red">
            James Okoye is frustrated about timeline delays
          </InsightItem>
          <InsightItem icon="💡" color="blue">
            Sarah Chen loves the logo - wants palette ideas
          </InsightItem>
          <InsightItem icon="⚠️" color="yellow">
            Marcus Rivera hasn't heard from you in 12 days
          </InsightItem>
        </div>
      </Card>
      
      {/* Priority Inbox */}
      <Card className="mb-8">
        <CardHeader>
          <h3 className="text-xl font-semibold">Priority Inbox</h3>
          <p className="text-sm text-gray-600">
            Sorted by AI priority score
          </p>
        </CardHeader>
        <CardContent>
          <MessageList messages={urgentMessages} />
        </CardContent>
      </Card>
      
      {/* Client Overview */}
      <Card>
        <CardHeader>
          <h3 className="text-xl font-semibold">Clients</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {clients?.map(client => (
              <ClientCard key={client._id} client={client} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Client Profile**

```typescript
// app/clients/[id]/page.tsx
'use client';

export default function ClientProfile({ params }: { params: { id: string } }) {
  const client = useQuery(api.clients.get, { id: params.id });
  const identities = useQuery(api.identities.getByClient, { clientId: params.id });
  const messages = useQuery(api.messages.getByClient, { 
    clientId: params.id,
    limit: 100,
  });
  
  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-start gap-6 mb-8">
        <Avatar src={client?.avatar} size="xl" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{client?.name}</h1>
          {client?.company && (
            <p className="text-gray-600">{client.company}</p>
          )}
          <div className="mt-4 flex gap-4">
            <StatBadge label="Messages" value={client?.totalMessages} />
            <StatBadge label="Health" value={`${client?.relationshipHealth}%`} />
            <StatBadge label="Revenue" value={`$${client?.totalRevenue}`} />
          </div>
        </div>
      </div>
      
      {/* Connected Platforms */}
      <Card className="mb-8">
        <CardHeader>
          <h3 className="font-semibold">Connected Accounts</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {identities?.map(identity => (
              <div key={identity._id} className="flex items-center gap-3 p-3 border rounded">
                <PlatformIcon platform={identity.platform} />
                <div>
                  <div className="font-medium">{identity.displayName}</div>
                  <div className="text-sm text-gray-600">
                    {identity.email || identity.username}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Unified Timeline */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold">Conversation History</h3>
          <PlatformFilter />
        </CardHeader>
        <CardContent>
          <Timeline messages={messages} />
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Deliverables
- ✅ Main dashboard with stats
- ✅ Client profile pages
- ✅ Priority inbox
- ✅ Unified timeline view

---

### **PHASE 7: Testing & Polish (Week 7-8)**

#### Goals
- Write unit tests
- Perform integration testing
- Fix bugs and polish UI
- Optimize performance

#### Testing Strategy

**1. Unit Tests (Vitest)**

```typescript
// convex/clients.test.ts
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import { api } from './_generated/api';
import schema from './schema';

describe('Client Management', () => {
  it('should create client from identity', async () => {
    const t = convexTest(schema);
    
    // Create test user
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert('users', {
        email: 'test@example.com',
        name: 'Test User',
        plan: 'free',
        planStatus: 'active',
        createdAt: Date.now(),
        onboardingCompleted: false,
      });
    });
    
    // Create test identity
    const identityId = await t.run(async (ctx) => {
      return await ctx.db.insert('platform_identities', {
        userId,
        platform: 'gmail',
        platformUserId: 'john@example.com',
        displayName: 'John Doe',
        email: 'john@example.com',
        isSelected: true,
        messageCount: 0,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
      });
    });
    
    // Create client
    const clientId = await t.mutation(api.clients.createFromIdentity, {
      identityId,
    });
    
    // Verify client created
    const client = await t.query(api.clients.get, { id: clientId });
    expect(client.name).toBe('John Doe');
    expect(client.primaryEmail).toBe('john@example.com');
  });
});
```

**2. E2E Tests (Playwright)**

```typescript
// tests/e2e/onboarding.spec.ts
import { test, expect } from '@playwright/test';

test('complete onboarding flow', async ({ page }) => {
  // Go to signup
  await page.goto('/signup');
  
  // Fill registration form
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'SecurePassword123');
  await page.fill('input[name="name"]', 'Test User');
  await page.click('button[type="submit"]');
  
  // Wait for redirect to onboarding
  await expect(page).toHaveURL('/onboarding/step-1');
  
  // Step 1: Connect Gmail (mock OAuth)
  await page.click('text=Connect Gmail');
  // ... OAuth flow simulation ...
  
  // Step 2: Select contacts
  await expect(page).toHaveURL('/onboarding/step-2');
  await page.click('input[type="checkbox"]', { clickCount: 3 }); // Select 3
  await page.click('text=Continue');
  
  // Continue through all steps...
  
  // Verify completion
  await expect(page).toHaveURL('/dashboard');
});
```

**3. Performance Testing**

```typescript
// scripts/loadTest.ts
import { performance } from 'perf_hooks';

async function testMessageProcessing() {
  const start = performance.now();
  
  // Create 1000 test messages
  const messageIds = await createTestMessages(1000);
  
  // Process with AI
  await processMessageBatch({ messageIds });
  
  const end = performance.now();
  const duration = end - start;
  
  console.log(`Processed 1000 messages in ${duration}ms`);
  console.log(`Average: ${duration / 1000}ms per message`);
}
```

#### Deliverables
- ✅ Unit test coverage >80%
- ✅ E2E tests for critical flows
- ✅ Performance benchmarks
- ✅ Bug fixes and polish

---

### **PHASE 8: Desktop App (Electron) (Week 9-10)**

#### Goals
- Package web app as native desktop application
- Add desktop-specific features (system tray, notifications)
- Support Windows, Mac, and Linux
- Implement keyboard shortcuts for power users

#### Implementation

**Day 1-2: Electron Setup**

```bash
# Install dependencies
npm install --save-dev electron electron-builder concurrently wait-on
npm install electron-store # For desktop-specific settings
```

```javascript
// electron/main.js
const { app, BrowserWindow, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    // macOS specific
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
  });

  // Load app
  const startUrl = isDev 
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../out/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Set up system tray
  createTray();
  
  // Set up global shortcuts
  setupGlobalShortcuts();
  
  // Set up IPC handlers
  setupIPCHandlers();
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, 'assets/tray-icon.png')
  );
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Wire',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Urgent Messages',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('navigate-to', '/inbox?filter=urgent');
      },
    },
    { type: 'separator' },
    {
      label: 'Preferences',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('navigate-to', '/settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  
  tray.setToolTip('Wire');
  tray.setContextMenu(contextMenu);
  
  // Click tray icon to show/hide window
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

function setupGlobalShortcuts() {
  const { globalShortcut } = require('electron');
  
  // Cmd/Ctrl + Shift + C: Show Wire
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
  
  // Cmd/Ctrl + Shift + N: New message
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    mainWindow.show();
    mainWindow.webContents.send('open-composer');
  });
}

function setupIPCHandlers() {
  const { ipcMain } = require('electron');
  const Store = require('electron-store');
  const store = new Store();
  
  // Show notification
  ipcMain.handle('show-notification', async (event, { title, body, urgent }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        icon: path.join(__dirname, 'assets/icon.png'),
        urgency: urgent ? 'critical' : 'normal',
      });
      
      notification.on('click', () => {
        mainWindow.show();
        mainWindow.focus();
      });
      
      notification.show();
      return true;
    }
    return false;
  });
  
  // Update badge count (unread messages)
  ipcMain.handle('update-badge', async (event, count) => {
    if (process.platform === 'darwin') {
      app.dock.setBadge(count > 0 ? count.toString() : '');
    }
    
    // Update tray icon with count
    if (count > 0) {
      tray.setImage(
        createBadgedIcon(count)
      );
    }
  });
  
  // Save file
  ipcMain.handle('save-file', async (event, { content, filename, type }) => {
    const { dialog } = require('electron');
    
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: type, extensions: [type] },
      ],
    });
    
    if (!result.canceled && result.filePath) {
      const fs = require('fs');
      fs.writeFileSync(result.filePath, content);
      return { success: true, path: result.filePath };
    }
    
    return { success: false };
  });
  
  // Auto-launch on startup
  ipcMain.handle('set-auto-launch', async (event, enabled) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false,
    });
    
    store.set('autoLaunch', enabled);
    return enabled;
  });
  
  // Get app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });
}

function createBadgedIcon(count) {
  // Create icon with badge count overlay
  // Implementation depends on platform
  return nativeImage.createFromPath(
    path.join(__dirname, 'assets/tray-icon-badged.png')
  );
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
```

**Preload Script (Security Bridge):**

```javascript
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electron', {
  // Platform detection
  platform: process.platform,
  isElectron: true,
  
  // Notifications
  showNotification: (title, body, urgent = false) => {
    return ipcRenderer.invoke('show-notification', { title, body, urgent });
  },
  
  // Badge/tray updates
  updateBadge: (count) => {
    return ipcRenderer.invoke('update-badge', count);
  },
  
  // File operations
  saveFile: (content, filename, type) => {
    return ipcRenderer.invoke('save-file', { content, filename, type });
  },
  
  // Settings
  setAutoLaunch: (enabled) => {
    return ipcRenderer.invoke('set-auto-launch', enabled);
  },
  
  // App info
  getAppVersion: () => {
    return ipcRenderer.invoke('get-app-version');
  },
  
  // Navigation (from main process)
  onNavigate: (callback) => {
    ipcRenderer.on('navigate-to', (event, route) => callback(route));
  },
  
  // Composer
  onOpenComposer: (callback) => {
    ipcRenderer.on('open-composer', () => callback());
  },
});
```

**Day 3-4: Build Configuration**

```yaml
# electron-builder.yml
appId: com.wire.app
productName: Wire
copyright: Copyright © 2026 Wire

directories:
  output: dist
  buildResources: electron/assets

files:
  - out/**/*
  - electron/**/*
  - package.json

mac:
  category: public.app-category.productivity
  icon: electron/assets/icon.icns
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: electron/entitlements.mac.plist
  entitlementsInherit: electron/entitlements.mac.plist

win:
  icon: electron/assets/icon.ico
  target:
    - target: nsis
      arch: [x64]
  publisherName: Wire

linux:
  icon: electron/assets/icon.png
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  category: Office
  synopsis: AI-powered client communication manager
  description: Unify and manage client communications across Gmail, Slack, WhatsApp, and Discord

publish:
  provider: github
  repo: wire
  releaseType: release
```

```json
// package.json scripts
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:3000 && electron .\"",
    "electron:build": "next build && next export && electron-builder",
    "electron:build:mac": "npm run electron:build -- --mac",
    "electron:build:win": "npm run electron:build -- --win",
    "electron:build:linux": "npm run electron:build -- --linux",
    "electron:build:all": "npm run electron:build -- --mac --win --linux"
  }
}
```

**Day 5-7: Desktop-Specific Features**

```typescript
// hooks/useElectron.ts
import { useEffect, useState } from 'react';

export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);
  
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!(window as any).electron);
  }, []);
  
  return {
    isElectron,
    electron: isElectron ? (window as any).electron : null,
  };
}

// components/DesktopNotifications.tsx
'use client';

import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useElectron } from '@/hooks/useElectron';

export function DesktopNotifications() {
  const { isElectron, electron } = useElectron();
  const urgentMessages = useQuery(api.messages.getUrgent);
  
  useEffect(() => {
    if (!isElectron || !electron || !urgentMessages) return;
    
    // Show notification for new urgent messages
    urgentMessages.forEach((msg) => {
      if (!msg.notificationShown) {
        electron.showNotification(
          `Urgent: ${msg.clientName}`,
          msg.text.substring(0, 100),
          true // urgent flag
        );
      }
    });
    
    // Update badge count
    electron.updateBadge(urgentMessages.length);
  }, [urgentMessages, isElectron, electron]);
  
  return null;
}

// components/DesktopKeyboardShortcuts.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useElectron } from '@/hooks/useElectron';

export function DesktopKeyboardShortcuts() {
  const router = useRouter();
  const { isElectron, electron } = useElectron();
  
  useEffect(() => {
    if (!isElectron || !electron) return;
    
    // Handle navigation from main process
    const handleNavigate = (route: string) => {
      router.push(route);
    };
    
    // Handle open composer
    const handleOpenComposer = () => {
      router.push('/inbox?compose=true');
    };
    
    electron.onNavigate(handleNavigate);
    electron.onOpenComposer(handleOpenComposer);
  }, [isElectron, electron, router]);
  
  useEffect(() => {
    if (!isElectron) return;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: Quick search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Open quick search modal
      }
      
      // Cmd/Ctrl + 1-9: Switch views
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const views = ['/dashboard', '/inbox', '/clients', '/settings'];
        const index = parseInt(e.key) - 1;
        if (views[index]) {
          router.push(views[index]);
        }
      }
      
      // Cmd/Ctrl + ,: Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        router.push('/settings');
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isElectron, router]);
  
  return null;
}

// app/layout.tsx - Add to main layout
import { DesktopNotifications } from '@/components/DesktopNotifications';
import { DesktopKeyboardShortcuts } from '@/components/DesktopKeyboardShortcuts';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <DesktopNotifications />
        <DesktopKeyboardShortcuts />
        {children}
      </body>
    </html>
  );
}
```

**Day 8-10: Testing & Distribution**

```bash
# Build for all platforms
npm run electron:build:all

# Outputs:
# dist/Wire-1.0.0.dmg (Mac)
# dist/Wire-1.0.0-arm64.dmg (Mac Apple Silicon)
# dist/Wire Setup 1.0.0.exe (Windows)
# dist/Wire-1.0.0.AppImage (Linux)
# dist/Wire-1.0.0.deb (Linux Debian/Ubuntu)
```

**Auto-update Configuration:**

```javascript
// electron/auto-updater.js
const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

function setupAutoUpdater(mainWindow) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available. Would you like to download it now?`,
      buttons: ['Download', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });
  
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. It will be installed on restart.',
      buttons: ['Restart Now', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
  
  // Check for updates on startup
  autoUpdater.checkForUpdates();
  
  // Check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 4 * 60 * 60 * 1000);
}

module.exports = { setupAutoUpdater };
```

#### Deliverables
- ✅ Desktop app for Windows, Mac, Linux
- ✅ System tray integration
- ✅ Desktop notifications
- ✅ Global keyboard shortcuts
- ✅ Auto-update functionality
- ✅ Native file save dialogs
- ✅ Auto-launch on startup option

---

### **PHASE 9: Launch Preparation (Week 11-12)**

#### Goals
- Set up production environment
- Configure monitoring
- Create marketing materials
- Plan launch strategy

#### Production Setup

**1. Environment Configuration**

```bash
# Production .env
CONVEX_DEPLOYMENT=prod:your-deployment
NEXT_PUBLIC_SITE_URL=https://wire.app

# API Keys (use secrets manager)
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
SLACK_CLIENT_ID=...

# Monitoring
SENTRY_DSN=https://...
POSTHOG_API_KEY=...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**2. Monitoring Setup**

```typescript
// lib/monitoring.ts
import * as Sentry from '@sentry/nextjs';
import { PostHog } from 'posthog-node';

export const sentry = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

export const posthog = new PostHog(
  process.env.POSTHOG_API_KEY!,
  { host: 'https://app.posthog.com' }
);

// Track events
export function trackEvent(userId: string, event: string, properties?: any) {
  posthog.capture({
    distinctId: userId,
    event,
    properties,
  });
}
```

**3. Deployment Checklist**

```markdown
## Pre-Launch Checklist

### Technical
- [ ] All environment variables set in production
- [ ] Database schema deployed to production
- [ ] OAuth callbacks configured for production URLs
- [ ] Rate limiting configured
- [ ] Error monitoring active (Sentry)
- [ ] Analytics tracking working (PostHog)
- [ ] Backups configured
- [ ] SSL certificates valid

### Testing
- [ ] All E2E tests passing
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Mobile responsiveness verified
- [ ] Cross-browser testing done

### Legal
- [ ] Terms of Service published
- [ ] Privacy Policy published
- [ ] GDPR compliance verified
- [ ] Cookie consent implemented

### Marketing
- [ ] Landing page live
- [ ] Demo video created
- [ ] Documentation published
- [ ] Support email configured
- [ ] Social media accounts created
```

#### Deliverables
- ✅ Production environment configured
- ✅ Monitoring and analytics active
- ✅ Launch checklist completed
- ✅ Ready for beta users

---

## Feature Specifications

### Core Features (MVP)

#### 1. **Unified Inbox**
- **What**: Single view of all client messages across platforms
- **How**: 
  - Fetch messages from all connected platforms
  - Display in chronological order
  - Color-code by platform
  - Filter by platform, client, date
- **Success Metric**: Users can find any message in <5 seconds

#### 2. **AI Priority Scoring**
- **What**: Each message gets 0-100 priority score
- **How**:
  - Analyze message content with Claude
  - Consider client value, urgency keywords, sentiment
  - Display score as badge
  - Sort inbox by priority
- **Success Metric**: 90% of users agree with top priority items

#### 3. **Sentiment Analysis**
- **What**: Detect client emotions (positive, neutral, negative, frustrated)
- **How**:
  - Analyze tone and word choice
  - Flag frustrated/angry messages
  - Show sentiment badge
  - Alert on negative sentiment shifts
- **Success Metric**: Catch 95% of frustrated messages

#### 4. **Client Profiles**
- **What**: Unified view of each client across platforms
- **How**:
  - Show all connected accounts
  - Display full message history
  - Show relationship health score
  - Track communication patterns
- **Success Metric**: Users spend 2+ min per profile (engagement)

#### 5. **Cross-Platform Threading**
- **What**: View all messages with a client regardless of platform
- **How**:
  - Link platform identities to clients
  - Merge message streams
  - Maintain chronological order
  - Preserve platform context
- **Success Metric**: 0 orphaned messages

---

## API Integration Guides

### Gmail API Integration

**Setup Steps:**
1. Create project in Google Cloud Console
2. Enable Gmail API
3. Create OAuth 2.0 credentials
4. Configure redirect URIs
5. Request scopes: `gmail.readonly`, `gmail.send`

**Code Example:**
```typescript
// See Phase 2 implementation above
```

### Slack API Integration

**Setup Steps:**
1. Create Slack app at api.slack.com
2. Add OAuth scopes: `channels:history`, `users:read`
3. Install app to workspace
4. Handle OAuth flow
5. Store workspace token

**Code Example:**
```typescript
// See Phase 3 implementation above
```

---

## AI Implementation

### Anthropic Claude Integration

**Best Practices:**
- Use Sonnet 4 for balance of speed and quality
- Keep prompts concise and structured
- Request JSON responses for easy parsing
- Batch requests when possible
- Cache common analyses

**Prompt Templates:**

```typescript
// Priority Scoring
const PRIORITY_PROMPT = `Score this message 0-100:
Client: {clientName} ({clientValue})
Message: "{messageText}"
Return JSON: {"score": 85, "reasoning": "..."}`;

// Sentiment Analysis
const SENTIMENT_PROMPT = `Analyze sentiment:
"{messageText}"
Return JSON: {"sentiment": "frustrated", "confidence": 0.9}`;

// Action Extraction
const ACTIONS_PROMPT = `Extract action items:
"{messageText}"
Return JSON: {"actions": ["item1", "item2"]}`;
```

---

## Deployment Strategy

### Infrastructure

**Frontend:** Vercel
- Automatic deployments from main branch
- Preview deployments for PRs
- CDN for global performance
- Automatic HTTPS

**Backend:** Convex Cloud
- Serverless functions
- Managed database
- WebSocket support
- Automatic scaling

**Monitoring:**
- Sentry for error tracking
- PostHog for analytics
- Vercel Analytics for performance
- Custom dashboard for business metrics

### CI/CD Pipeline

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
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test
      - run: npm run build
      - run: npx convex deploy --prod
      - uses: vercel/action@latest
```

---

## Testing & Quality Assurance

### Test Coverage Goals
- Unit tests: 80%+ coverage
- Integration tests: All critical flows
- E2E tests: Main user journeys
- Performance tests: <2s page load

### Testing Tools
- **Unit**: Vitest
- **E2E**: Playwright
- **Visual**: Chromatic
- **Performance**: Lighthouse CI

---

## Security & Privacy

### Data Protection
- All API tokens encrypted at rest
- OAuth tokens never exposed to client
- Messages stored securely in Convex
- GDPR-compliant data handling

### Privacy Commitments
- Never sell user data
- Users can export all data
- Users can delete all data
- Clear data retention policies

### Security Measures
- HTTPS everywhere
- CSRF protection
- Rate limiting on API routes
- SQL injection prevention (Convex handles this)
- XSS protection

---

## AI Writing Intelligence System (Grammarly-Inspired)

This section provides comprehensive implementation details for the AI-powered writing assistance features that help freelancers communicate more effectively with clients.

### Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│              WRITING ASSISTANCE PIPELINE                  │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
              User Types in Reply Composer
                           │
                           ▼
              Debounced Analysis (500ms)
                           │
                           ▼
        ┌──────────────────┴──────────────────┐
        │                                      │
        ▼                                      ▼
  AI Analysis Engine              Client Context Engine
        │                                      │
        ├─ Grammar/Spelling                   ├─ Communication History
        ├─ Tone Detection                     ├─ Preference Learning
        ├─ Clarity Scoring                    ├─ Relationship Stage
        ├─ Formality Level                    └─ Past Reactions
        └─ Vocabulary Enhancement
                           │
                           ▼
              Merge & Generate Suggestions
                           │
                           ▼
              Display Inline Suggestions
                           │
                           ▼
          User Accepts/Rejects/Edits
                           │
                           ▼
              Learn from User Choices
```

### Database Schema Extensions

Add these tables to support writing intelligence:

```typescript
// convex/schema.ts extensions

export default defineSchema({
  // ... existing tables ...
  
  // Writing analysis cache
  writing_analyses: defineTable({
    userId: v.id("users"),
    textHash: v.string(), // MD5 hash of analyzed text
    analysis: v.object({
      tone: v.any(),
      clarity: v.any(),
      grammar: v.any(),
      formality: v.any(),
      clientMatch: v.any(),
      readerReaction: v.any(),
    }),
    analyzedAt: v.number(),
    expiresAt: v.number(), // Cache for 1 hour
  })
    .index("by_hash", ["textHash"])
    .index("by_expiry", ["expiresAt"]),
  
  // Client communication patterns (learned over time)
  client_communication_patterns: defineTable({
    clientId: v.id("clients"),
    
    // Style preferences
    preferredFormality: v.number(), // 1-5
    usesEmojis: v.boolean(),
    averageMessageLength: v.number(),
    preferredGreeting: v.string(),
    preferredSignOff: v.string(),
    
    // Tone preferences
    preferredTone: v.string(), // "professional", "casual", "friendly"
    respondsWellTo: v.array(v.string()), // ["confidence", "empathy"]
    respondsPoolyTo: v.array(v.string()), // ["defensiveness", "vagueness"]
    
    // Communication patterns
    bestResponseTimes: v.array(v.string()), // ["tuesday_morning", "thursday_afternoon"]
    averageResponseDelay: v.number(), // milliseconds
    messageFrequency: v.string(), // "daily", "weekly", "monthly"
    
    // Metadata
    sampleSize: v.number(), // How many messages learned from
    lastUpdated: v.number(),
    confidence: v.number(), // 0-1, how confident we are in this data
  })
    .index("by_client", ["clientId"]),
  
  // Writing templates
  writing_templates: defineTable({
    userId: v.id("users"),
    
    name: v.string(),
    category: v.string(), // "project_update", "deadline_request", etc.
    content: v.string(),
    variables: v.array(v.string()), // {{clientName}}, {{projectName}}
    
    // Usage tracking
    usageCount: v.number(),
    lastUsed: v.optional(v.number()),
    
    // Metadata
    createdAt: v.number(),
    isBuiltIn: v.boolean(), // System template vs user-created
  })
    .index("by_user_category", ["userId", "category"])
    .index("by_usage", ["userId", "usageCount"]),
  
  // Writing improvement tracking
  writing_suggestions_feedback: defineTable({
    userId: v.id("users"),
    suggestionType: v.string(), // "tone", "clarity", "formality", "grammar"
    
    originalText: v.string(),
    suggestedText: v.string(),
    
    action: v.string(), // "accepted", "rejected", "edited", "ignored"
    finalText: v.optional(v.string()), // If user edited the suggestion
    
    // Context
    clientId: v.optional(v.id("clients")),
    wasSuccessful: v.optional(v.boolean()), // Did client respond positively?
    
    timestamp: v.number(),
  })
    .index("by_user_type", ["userId", "suggestionType"])
    .index("by_action", ["action"]),
});
```

### Feature Implementation Details

#### 1. Client Pattern Learning

Learn each client's communication style automatically:

```typescript
// convex/ai/pattern-learning.ts
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// Analyze all messages with a client to learn patterns
export const analyzeClientPatterns = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get all messages to/from this client
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    
    if (messages.length < 10) {
      // Not enough data yet
      return null;
    }
    
    // Analyze patterns
    const yourMessages = messages.filter(m => m.direction === "outbound");
    const clientMessages = messages.filter(m => m.direction === "inbound");
    
    // Calculate formality
    const formalityLevels = await Promise.all(
      clientMessages.map(m => detectFormality(m.text))
    );
    const avgFormality = formalityLevels.reduce((sum, f) => sum + f, 0) / formalityLevels.length;
    
    // Detect emoji usage
    const usesEmojis = clientMessages.some(m => /[\p{Emoji}]/u.test(m.text));
    
    // Calculate average message length
    const avgLength = clientMessages.reduce((sum, m) => sum + m.text.length, 0) / clientMessages.length;
    
    // Extract common greetings
    const greetings = clientMessages
      .map(m => m.text.match(/^(Hi|Hello|Hey|Dear)[^.!?]*/)?.[0])
      .filter(Boolean);
    const preferredGreeting = getMostCommon(greetings);
    
    // Best response times (analyze when client sends messages)
    const messageTimes = clientMessages.map(m => ({
      dayOfWeek: new Date(m.timestamp).getDay(),
      hour: new Date(m.timestamp).getHours(),
    }));
    const bestTimes = findPeakTimes(messageTimes);
    
    // Store learned patterns
    const existing = await ctx.db
      .query("client_communication_patterns")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
    
    const patterns = {
      clientId: args.clientId,
      preferredFormality: Math.round(avgFormality),
      usesEmojis,
      averageMessageLength: avgLength,
      preferredGreeting: preferredGreeting || "Hi",
      preferredSignOff: "Best",
      preferredTone: avgFormality > 3 ? "professional" : "casual",
      respondsWellTo: ["confidence", "clarity"],
      respondsPoolyTo: ["vagueness", "defensiveness"],
      bestResponseTimes: bestTimes,
      averageResponseDelay: calculateAvgResponseDelay(messages),
      messageFrequency: calculateFrequency(messages),
      sampleSize: messages.length,
      lastUpdated: Date.now(),
      confidence: messages.length >= 50 ? 0.9 : messages.length / 50,
    };
    
    if (existing) {
      await ctx.db.patch(existing._id, patterns);
    } else {
      await ctx.db.insert("client_communication_patterns", patterns);
    }
    
    return patterns;
  },
});

// Helper functions
function getMostCommon(arr: string[]): string {
  const counts = arr.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(counts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || "";
}

function findPeakTimes(times: Array<{dayOfWeek: number; hour: number}>): string[] {
  // Group by day/hour and find peaks
  const groups: Record<string, number> = {};
  
  times.forEach(t => {
    const key = `${getDayName(t.dayOfWeek)}_${getTimeOfDay(t.hour)}`;
    groups[key] = (groups[key] || 0) + 1;
  });
  
  return Object.entries(groups)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([key]) => key);
}

function getDayName(day: number): string {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day];
}

function getTimeOfDay(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function calculateAvgResponseDelay(messages: any[]): number {
  // Calculate average time between client message and your response
  const delays: number[] = [];
  
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].direction === "inbound" && messages[i + 1].direction === "outbound") {
      delays.push(messages[i + 1].timestamp - messages[i].timestamp);
    }
  }
  
  return delays.length > 0 
    ? delays.reduce((sum, d) => sum + d, 0) / delays.length 
    : 0;
}

function calculateFrequency(messages: any[]): string {
  if (messages.length < 2) return "unknown";
  
  const timespan = messages[messages.length - 1].timestamp - messages[0].timestamp;
  const avgDaysBetween = timespan / (1000 * 60 * 60 * 24) / messages.length;
  
  if (avgDaysBetween < 2) return "daily";
  if (avgDaysBetween < 10) return "weekly";
  if (avgDaysBetween < 40) return "monthly";
  return "infrequent";
}
```

#### 2. Template System

```typescript
// convex/templates.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Built-in templates
const BUILT_IN_TEMPLATES = [
  {
    name: "Project Update",
    category: "project_update",
    content: `Hi {{clientName}},

I wanted to give you a quick update on {{projectName}}.

✅ Completed:
{{completedItems}}

🔄 In Progress:
{{inProgressItems}}

📅 Next Steps:
{{nextSteps}}

{{callToAction}}

Best,
{{myName}}`,
    variables: ["clientName", "projectName", "completedItems", "inProgressItems", "nextSteps", "callToAction", "myName"],
  },
  {
    name: "Deadline Extension Request",
    category: "deadline_request",
    content: `Hi {{clientName}},

I wanted to reach out early about the timeline for {{projectName}}.

Due to {{reason}}, I'll need {{additionalDays}} extra days to ensure everything is polished and meets your standards. This would move the delivery to {{newDate}} instead of {{originalDate}}.

{{justification}}

I'm committed to delivering quality work, and this extra time will allow me to {{benefit}}.

Would this timeline work for you? If not, I'm happy to discuss alternatives.

Best,
{{myName}}`,
    variables: ["clientName", "projectName", "reason", "additionalDays", "newDate", "originalDate", "justification", "benefit", "myName"],
  },
  {
    name: "Scope Change Response",
    category: "scope_change",
    content: `Hi {{clientName}},

Thanks for sharing this additional request for {{projectName}}.

To make sure we're on the same page:

Original Scope:
{{originalScope}}

New Request:
{{newRequest}}

This addition would require approximately {{estimatedHours}} hours of additional work.

Options:
1. Add to current project: {{additionalCost}} + {{additionalDays}} extra days
2. Handle as Phase 2: Start after current delivery
3. Alternative approach: {{alternative}}

Which works best for your timeline and budget?

Best,
{{myName}}`,
    variables: ["clientName", "projectName", "originalScope", "newRequest", "estimatedHours", "additionalCost", "additionalDays", "alternative", "myName"],
  },
];

export const listTemplates = query({
  args: {
    userId: v.id("users"),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let templates = await ctx.db
      .query("writing_templates")
      .withIndex("by_user_category", (q) => q.eq("userId", args.userId))
      .collect();
    
    if (args.category) {
      templates = templates.filter(t => t.category === args.category);
    }
    
    // Include built-in templates
    const builtIn = BUILT_IN_TEMPLATES
      .filter(t => !args.category || t.category === args.category)
      .map(t => ({ ...t, _id: t.name, userId: args.userId, isBuiltIn: true, usageCount: 0 }));
    
    return [...builtIn, ...templates].sort((a, b) => b.usageCount - a.usageCount);
  },
});

export const createTemplate = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    category: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Extract variables from content ({{variableName}})
    const variables = Array.from(
      args.content.matchAll(/\{\{(\w+)\}\}/g)
    ).map(match => match[1]);
    
    const templateId = await ctx.db.insert("writing_templates", {
      userId: args.userId,
      name: args.name,
      category: args.category,
      content: args.content,
      variables: Array.from(new Set(variables)),
      usageCount: 0,
      createdAt: Date.now(),
      isBuiltIn: false,
    });
    
    return templateId;
  },
});

export const useTemplate = mutation({
  args: {
    templateId: v.id("writing_templates"),
    variables: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    
    // Replace variables
    let content = template.content;
    for (const [key, value] of Object.entries(args.variables)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    
    // Increment usage count
    await ctx.db.patch(args.templateId, {
      usageCount: template.usageCount + 1,
      lastUsed: Date.now(),
    });
    
    return content;
  },
});
```

#### 3. Learning from User Feedback

```typescript
// convex/ai/learning.ts
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const trackSuggestionFeedback = internalMutation({
  args: {
    userId: v.id("users"),
    suggestionType: v.string(),
    originalText: v.string(),
    suggestedText: v.string(),
    action: v.string(),
    finalText: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("writing_suggestions_feedback", {
      ...args,
      timestamp: Date.now(),
    });
    
    // Analyze feedback to improve suggestions
    await updateUserPreferences(ctx, args);
  },
});

async function updateUserPreferences(ctx: any, feedback: any) {
  // If user consistently rejects tone suggestions, learn their preference
  const recentFeedback = await ctx.db
    .query("writing_suggestions_feedback")
    .withIndex("by_user_type", (q) => 
      q.eq("userId", feedback.userId).eq("suggestionType", feedback.suggestionType)
    )
    .order("desc")
    .take(10);
  
  const rejectionRate = recentFeedback.filter(f => f.action === "rejected").length / recentFeedback.length;
  
  if (rejectionRate > 0.7) {
    // User doesn't like this type of suggestion - reduce frequency
    console.log(`User ${feedback.userId} rejects ${feedback.suggestionType} suggestions frequently`);
    // Store this preference for future use
  }
}
```

### Integration with Reply Composer

The complete reply composer with all features:

```typescript
// components/SmartReplyComposer.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAction, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { debounce } from 'lodash';

export function SmartReplyComposer({ 
  client, 
  originalMessage,
  onSend 
}: SmartReplyComposerProps) {
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<WritingAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  
  // Queries
  const templates = useQuery(api.templates.listTemplates, {
    userId: currentUser._id,
  });
  const clientPatterns = useQuery(api.ai.patterns.getClientPatterns, {
    clientId: client._id,
  });
  
  // Actions
  const analyzeWriting = useAction(api.ai.writingAssistant.analyzeWriting);
  const rewriteWithTone = useAction(api.ai.writingAssistant.rewriteWithTone);
  const adjustFormality = useAction(api.ai.writingAssistant.adjustFormality);
  const useTemplate = useAction(api.templates.useTemplate);
  
  // Debounced analysis
  const debouncedAnalyze = useCallback(
    debounce(async (content: string) => {
      if (content.length < 10) return;
      
      setIsAnalyzing(true);
      try {
        const result = await analyzeWriting({
          text: content,
          clientId: client._id,
          context: {
            isReply: true,
            originalMessage: originalMessage?.text,
          },
        });
        setAnalysis(result);
      } catch (error) {
        console.error('Analysis failed:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 500),
    [client._id, analyzeWriting]
  );
  
  useEffect(() => {
    if (text) {
      debouncedAnalyze(text);
    }
  }, [text, debouncedAnalyze]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Cmd/Ctrl + / to open templates
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShowTemplates(true);
      }
      
      // Cmd/Ctrl + Enter to send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [text]);
  
  const handleTemplateSelect = async (template: Template) => {
    // Auto-fill variables with client data
    const variables = {
      clientName: client.name,
      projectName: "Current Project", // Get from context
      myName: currentUser.name,
      // ... other variables
    };
    
    const filledContent = await useTemplate({
      templateId: template._id,
      variables,
    });
    
    setText(filledContent);
    setShowTemplates(false);
  };
  
  const handleSend = async () => {
    if (!text) return;
    
    // Track if suggestion was used
    if (analysis) {
      await trackSuggestionFeedback({
        userId: currentUser._id,
        suggestionType: "full_message",
        originalText: text,
        suggestedText: text,
        action: "sent",
        clientId: client._id,
      });
    }
    
    await onSend(text);
    setText('');
    setAnalysis(null);
  };
  
  return (
    <div className="flex flex-col gap-4">
      {/* ... UI implementation from previous section ... */}
    </div>
  );
}
```

### Performance Optimization

```typescript
// Caching strategy to reduce API calls
export const getCachedAnalysis = query({
  args: { textHash: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("writing_analyses")
      .withIndex("by_hash", (q) => q.eq("textHash", args.textHash))
      .first();
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.analysis;
    }
    
    return null;
  },
});

// Cleanup old cache entries
export const cleanupCache = internalMutation({
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("writing_analyses")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .collect();
    
    for (const entry of expired) {
      await ctx.db.delete(entry._id);
    }
  },
});
```

### Analytics & Insights

Track writing improvement over time:

```typescript
// convex/analytics/writing.ts
export const getWritingInsights = query({
  args: { userId: v.id("users"), timeframe: v.string() },
  handler: async (ctx, args) => {
    const feedback = await ctx.db
      .query("writing_suggestions_feedback")
      .withIndex("by_user_type", (q) => q.eq("userId", args.userId))
      .collect();
    
    return {
      totalSuggestions: feedback.length,
      acceptanceRate: feedback.filter(f => f.action === "accepted").length / feedback.length,
      mostAcceptedType: getMostFrequent(feedback.filter(f => f.action === "accepted").map(f => f.suggestionType)),
      improvementAreas: identifyImprovementAreas(feedback),
      trendOverTime: calculateTrend(feedback),
    };
  },
});
```

---

## Post-MVP Roadmap

### Version 1.1 (Month 2-3)
- WhatsApp integration
- Discord integration
- **Basic writing assistance** (grammar, tone detection)
- Relationship health scoring
- Advanced search
- **Template system with 10 built-in templates**

### Version 1.2 (Month 4-5)
- Scope creep detection
- Financial impact dashboard
- Team features (shared clients)
- API for integrations
- Zapier integration
- **Advanced writing assistance** (reader reaction, client pattern learning)
- **Template variables with auto-fill**

### Version 2.0 (Month 6-8)
- Mobile apps (iOS + Android)
- Browser extension
- Voice commands
- Smart scheduling
- Predictive analytics
- **Full Grammarly-level writing intelligence**
- **Personal voice learning across all clients**
- **Multi-language support with cultural adaptation**

---

## Success Metrics

### User Acquisition
- **Week 1**: 100 beta signups
- **Month 1**: 500 total users
- **Month 3**: 2,000 total users
- **Month 6**: 10,000 total users

### Engagement
- **Daily Active Users**: 40%+ of total
- **Messages Processed**: 1M+ per month
- **Platform Connections**: Avg 2.5 per user
- **Session Duration**: 10+ min per session

### Revenue
- **Month 1**: $0 (free beta)
- **Month 3**: $5K MRR
- **Month 6**: $25K MRR
- **Month 12**: $100K MRR

### Retention
- **Day 7**: 60%+
- **Day 30**: 40%+
- **Month 3**: 30%+

---

## Clerk Authentication Deep Dive

### Why Clerk Over Other Auth Solutions?

**Compared to NextAuth/Auth.js:**
- ✅ No database setup required (Clerk manages users)
- ✅ Built-in UI components (save weeks of development)
- ✅ Better security out-of-the-box (automatic token refresh)
- ✅ Multi-factor authentication included
- ✅ User management dashboard included

**Compared to Supabase Auth:**
- ✅ Better Next.js integration
- ✅ More polished UI components
- ✅ Superior developer experience
- ✅ Better organization/team features

**Compared to Firebase Auth:**
- ✅ Modern, React-first approach
- ✅ Better TypeScript support
- ✅ Simpler pricing model
- ✅ No Google Cloud complexity

### Clerk + Convex Architecture Flow

```
User Action (Sign Up/In)
    ↓
Clerk Authentication
    ↓
Clerk issues JWT token
    ↓
Token sent to Convex via useAuth hook
    ↓
Convex verifies token with Clerk
    ↓
Webhook syncs user data to Convex DB
    ↓
User can access Convex queries/mutations
```

### Advanced Clerk Features for Wire

#### 1. **Organizations (For Agency Plan)**

```typescript
// Enable multi-tenant support for agencies

// convex/organizations.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    const orgId = await ctx.db.insert("organizations", {
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      plan: args.plan,
      createdAt: Date.now(),
    });
    
    return orgId;
  },
});

// Update schema to include organizations
organizations: defineTable({
  clerkOrgId: v.string(),
  name: v.string(),
  plan: v.string(), // "agency"
  createdAt: v.number(),
  members: v.array(v.id("users")),
})
  .index("by_clerk_org_id", ["clerkOrgId"]),
```

#### 2. **Custom Session Claims**

```typescript
// Add custom data to user tokens

// Clerk Dashboard → Sessions → Customize session token

// Example: Add user plan to JWT
{
  "plan": "{{user.public_metadata.plan}}",
  "onboardingCompleted": "{{user.public_metadata.onboardingCompleted}}"
}

// Access in Convex
export const getUserPlan = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity?.plan || "free";
  },
});
```

#### 3. **User Metadata Management**

```typescript
// Store additional user data in Clerk

import { clerkClient } from '@clerk/nextjs/server';

export async function updateUserMetadata(
  userId: string,
  metadata: {
    plan?: string;
    onboardingCompleted?: boolean;
  }
) {
  await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: metadata,
  });
}

// Use in onboarding completion
export async function completeOnboarding(userId: string) {
  await updateUserMetadata(userId, {
    onboardingCompleted: true,
  });
}
```

#### 4. **Custom Sign-In/Sign-Up Fields**

```typescript
// Add custom fields to registration

// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <SignUp
      appearance={{ /* ... */ }}
      additionalFields={[
        {
          key: 'role',
          label: 'What describes you best?',
          type: 'select',
          options: [
            { value: 'freelancer', label: 'Freelance Developer' },
            { value: 'designer', label: 'Freelance Designer' },
            { value: 'consultant', label: 'Consultant' },
            { value: 'agency', label: 'Agency Owner' },
          ],
        },
      ]}
    />
  );
}
```

#### 5. **Social OAuth Providers**

```typescript
// Enable multiple OAuth providers

// Clerk Dashboard → Social Connections
// Enable:
// - Google (for Gmail users)
// - GitHub (for developers)
// - Microsoft (for enterprise)

// Auto-link accounts with same email
// Settings → Email & Phone → Email address linking
```

### Clerk Webhook Events

Complete list of webhook events to handle:

```typescript
// app/api/webhooks/clerk/route.ts

// User Events
- user.created       // Create user in Convex
- user.updated       // Update user profile
- user.deleted       // Anonymize/delete user data

// Session Events
- session.created    // Track login analytics
- session.ended      // Track logout analytics
- session.removed    // Handle forced logout
- session.revoked    // Handle token revocation

// Organization Events (for Agency plan)
- organization.created        // Create org in Convex
- organization.updated        // Update org details
- organization.deleted        // Archive org
- organizationMembership.created  // Add user to org
- organizationMembership.deleted  // Remove user from org
- organizationMembership.updated  // Update member role

// Email Events
- email.created      // User added new email
- emailAddress.created  // Email verified
```

### Security Best Practices with Clerk

#### 1. **Environment Variable Management**

```bash
# Development
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Production (use separate keys!)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# Never commit these to git!
# Add to .gitignore
.env.local
.env.production.local
```

#### 2. **Token Verification in Convex**

```typescript
// Convex automatically verifies Clerk JWTs
// No manual verification needed!

export const secureQuery = query({
  handler: async (ctx) => {
    // ctx.auth.getUserIdentity() returns null if token invalid
    const user = await ctx.auth.getUserIdentity();
    
    if (!user) {
      throw new Error("Unauthorized");
    }
    
    // User is authenticated, proceed safely
    return await ctx.db.query("sensitive_data").collect();
  },
});
```

#### 3. **Rate Limiting**

```typescript
// Implement rate limiting on sensitive operations

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
});

export async function POST(req: Request) {
  const { userId } = auth();
  
  const { success } = await ratelimit.limit(userId);
  
  if (!success) {
    return new Response("Rate limit exceeded", { status: 429 });
  }
  
  // Process request
}
```

### Clerk Pricing for Wire

**Development (Free):**
- Up to 10,000 Monthly Active Users (MAU)
- All features included
- Perfect for development and testing

**Production Pricing:**
- **Hobby**: Free up to 10,000 MAU
- **Pro**: $25/month + $0.02 per MAU
- **Enterprise**: Custom pricing

**Cost Estimate for Wire:**
- Month 1 (500 users): Free
- Month 3 (2,000 users): Free
- Month 6 (10,000 users): Free
- Month 12 (50,000 users): $25 + (40,000 × $0.02) = $825/month

### Troubleshooting Common Clerk Issues

#### Issue 1: Webhook not receiving events

**Solution:**
```bash
# Test webhook locally with Clerk CLI
npm install -g @clerk/clerk-cli
clerk webhooks test \
  --url http://localhost:3000/api/webhooks/clerk \
  --event user.created

# Or use ngrok for local testing
ngrok http 3000
# Use ngrok URL in Clerk dashboard
```

#### Issue 2: "Clerk: Missing publishableKey"

**Solution:**
```typescript
// Make sure NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set
// Restart dev server after adding env vars
npm run dev
```

#### Issue 3: Redirect loop after sign-in

**Solution:**
```typescript
// Check middleware.ts publicRoutes config
export default authMiddleware({
  publicRoutes: ["/", "/sign-in(.*)", "/sign-up(.*)"],
  // Don't protect root or auth pages
});
```

#### Issue 4: User not appearing in Convex

**Solution:**
```typescript
// Check webhook is configured correctly
// Verify CLERK_WEBHOOK_SECRET is set
// Check webhook logs in Clerk dashboard
// Manually trigger webhook for testing
```

### Migration from Convex Auth to Clerk

If you started with Convex Auth, here's the migration path:

```typescript
// 1. Install Clerk
npm install @clerk/nextjs

// 2. Export existing users from Convex
const users = await ctx.db.query("users").collect();

// 3. Import to Clerk via API
for (const user of users) {
  await clerkClient.users.createUser({
    emailAddress: [user.email],
    password: generateTempPassword(),
    firstName: user.name.split(' ')[0],
    publicMetadata: {
      convexUserId: user._id,
    },
  });
}

// 4. Update schema to use clerkId instead
// 5. Update all queries to use ctx.auth.getUserIdentity()
// 6. Deploy and test
// 7. Force password resets for all users
```

---

## Conclusion

This development guide provides a comprehensive roadmap for building Wire from scratch to MVP launch in 8 weeks. By following the phased approach and leveraging Convex for the backend, you'll have a production-ready SaaS application with AI-powered features that solve real problems for freelancers.

**Next Steps:**
1. Set up development environment (Week 1)
2. Start with Phase 0 and work sequentially
3. Test continuously throughout
4. Launch beta at Week 8
5. Iterate based on user feedback

Good luck building! 🚀