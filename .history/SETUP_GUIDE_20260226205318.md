# Wire — Platform Credentials Setup Guide

This guide walks you through getting every credential needed to run Wire locally. Fill values into `.env.local` as you go.

---

## 1. Clerk (Authentication)

> Already configured — skip unless starting fresh.

1. Go to [clerk.com](https://clerk.com) → Sign in
2. Create a new application (or select existing)
3. Dashboard → **API Keys**:
   - Copy **Publishable Key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Copy **Secret Key** → `CLERK_SECRET_KEY`
4. Dashboard → **Webhooks** → Create endpoint:
   - URL: `https://YOUR_DOMAIN/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
   - Copy **Signing Secret** → `CLERK_WEBHOOK_SECRET`
5. Dashboard → **JWT Templates** → Copy **Issuer domain** → `CLERK_JWT_ISSUER_DOMAIN`

Push to Convex:
```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-issuer.clerk.accounts.dev"
```

---

## 2. Google / Gmail

> Already configured — skip unless starting fresh.

### Step A: Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Navigate → **APIs & Services** → **Enabled APIs & Services**
4. Click **+ ENABLE APIS AND SERVICES** → Search and enable:
   - **Gmail API**
   - **Google People API** (if needed)
5. Navigate → **APIs & Services** → **Credentials**
6. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
7. If prompted, configure the **OAuth consent screen** first:
   - User type: **External** (for testing) or **Internal** (if in a Workspace)
   - App name: `Wire`
   - Scopes: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.modify`
8. Back to Credentials → **OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
9. Copy values:
   - **Client ID** → `GOOGLE_CLIENT_ID`
   - **Client Secret** → `GOOGLE_CLIENT_SECRET`

### Step B: Gmail Pub/Sub (real-time push notifications)

1. Navigate → [Pub/Sub Console](https://console.cloud.google.com/cloudpubsub/topic/list)
2. Click **CREATE TOPIC**
   - Topic ID: `gmail-watch`
3. Click on the new topic → **Permissions** tab → **Add Principal**
   - Principal: `gmail-api-push@system.gserviceaccount.com`
   - Role: **Pub/Sub Publisher**
4. Create a **Subscription** on the topic:
   - Delivery type: Push
   - Endpoint URL: `https://YOUR_DOMAIN/api/webhooks/gmail`
5. Set env vars:
   - `GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-watch`
   - `GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID` (visible in GCP dashboard URL)

Push to Convex:
```bash
npx convex env set GOOGLE_CLIENT_ID "your-client-id"
npx convex env set GOOGLE_CLIENT_SECRET "your-client-secret"
npx convex env set GMAIL_PUBSUB_TOPIC "projects/your-project/topics/gmail-watch"
```

---

## 3. Slack

> Already configured — skip unless starting fresh.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it `Wire`, select your workspace
3. **Basic Information** page — scroll to **App Credentials**:
   - Copy **Client ID** → `SLACK_CLIENT_ID`
   - Copy **Client Secret** → `SLACK_CLIENT_SECRET`
   - Copy **Signing Secret** → `SLACK_SIGNING_SECRET`
4. **OAuth & Permissions** → Add these **Bot Token Scopes**:
   - `users:read` — list workspace members
   - `im:read` — read DM metadata
   - `im:history` — read DM messages
   - `chat:write` — send messages
   - `users.profile:read` — read profile info
5. **OAuth & Permissions** → **Redirect URLs** → Add:
   - `http://localhost:3000/api/auth/slack/callback`
6. **Event Subscriptions** → Enable Events → Request URL:
   - `https://YOUR_DOMAIN/api/webhooks/slack`
   - Subscribe to bot events: `message.im`, `message.channels`
7. **Install to Workspace** (if not already)

Push to Convex:
```bash
npx convex env set SLACK_CLIENT_ID "your-client-id"
npx convex env set SLACK_CLIENT_SECRET "your-client-secret"
```

---

## 4. WhatsApp (via Twilio) — NEW ⭐

### Step A: Create Twilio Account & Get Credentials

1. Go to [twilio.com](https://www.twilio.com/) → Sign up for a free account
2. Verify your phone number and email
3. On the **Console Dashboard** (home page), you'll see your **Account SID** (starts with `AC`) → `TWILIO_ACCOUNT_SID`
4. **To find your Auth Token:**
   - Click your **account name / avatar** (top-right corner)
   - Select **Account** → **API keys & tokens**
   - Or go directly to: [console.twilio.com/us1/account/keys-credentials/api-keys](https://console.twilio.com/us1/account/keys-credentials/api-keys)
   - Under **Auth tokens** section, click **"View"** or **copy icon** next to the live token → `TWILIO_AUTH_TOKEN`

### Step B: Set Up WhatsApp Sandbox (for testing)

1. In Twilio Console, in the **left sidebar**:
   - Click **Messaging** → **Try it out** → **Send a WhatsApp message**
   - Or go directly to: [console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
2. If you don't see "Try it out", expand **Messaging** in the sidebar or search "WhatsApp" in the top search bar
3. Follow the instructions to join the sandbox:
   - The page will show a sandbox number (typically `+14155238886`) and a join code (e.g., `join powder-cake`)
   - Send that code from your WhatsApp to the sandbox number
4. Set `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (use the number shown on your sandbox page)

### Step C: Configure Webhook

1. After joining the sandbox, you'll see a **Sandbox Settings** section on the same page
   - Or navigate: **Messaging** → **Try it out** → **Send a WhatsApp message** → **Sandbox settings** tab
2. Under **"When a message comes in"**:
   - Method: **POST**
   - URL: `https://YOUR_DOMAIN/api/webhooks/whatsapp`
3. For local dev, use ngrok: `ngrok http 3000` and use the https ngrok URL

### Step D: For Production (optional)

1. Purchase a Twilio phone number with WhatsApp capability
2. Apply for a WhatsApp Business API profile in Twilio Console
3. Update `TWILIO_WHATSAPP_FROM` with your production number

Set in `.env.local`:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Push to Convex:
```bash
npx convex env set TWILIO_ACCOUNT_SID "ACxxxxxxxx"
npx convex env set TWILIO_AUTH_TOKEN "your_auth_token"
npx convex env set TWILIO_WHATSAPP_FROM "whatsapp:+14155238886"
```

---

## 5. Discord — NEW ⭐

### Step A: Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → Name it `Wire` → Create
3. You're now on the **General Information** page:
   - Copy **APPLICATION ID** → `NEXT_PUBLIC_DISCORD_CLIENT_ID`
   - Copy **PUBLIC KEY** → `DISCORD_PUBLIC_KEY`

### Step B: Get OAuth2 Credentials

1. Left sidebar → **OAuth2**
2. Copy **CLIENT SECRET** (click "Reset Secret" if needed) → `DISCORD_CLIENT_SECRET`
3. Under **Redirects** → Add Redirect:
   - `http://localhost:3000/api/auth/discord/callback`
4. Save Changes

### Step C: Create a Bot

1. Left sidebar → **Bot**
2. Click **Reset Token** → Copy the token → `DISCORD_BOT_TOKEN`
   > ⚠️ This token is shown only once! Save it immediately.
3. Scroll down to **Privileged Gateway Intents**:
   - Enable **MESSAGE CONTENT INTENT** (required to read DM text)
   - Enable **SERVER MEMBERS INTENT** (optional)
4. Save Changes

### Step D: Invite the Bot to Your Server

1. Left sidebar → **OAuth2** → **URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions: `Read Messages/View Channels`, `Send Messages`, `Read Message History`
4. Copy the generated URL → open in browser → select your test server → Authorize

### Step E: Configure Interactions Endpoint (optional, for webhooks)

1. Left sidebar → **General Information**
2. **Interactions Endpoint URL**: `https://YOUR_DOMAIN/api/webhooks/discord`
3. Discord will send a verification ping — your webhook handler already responds to `type: 1` pings

Set in `.env.local`:
```
NEXT_PUBLIC_DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=abcdefghijklmnop
DISCORD_PUBLIC_KEY=abcdef123456...
DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXX.XXXXXXXX
```

Push to Convex:
```bash
npx convex env set DISCORD_BOT_TOKEN "your_bot_token"
```

---

## 6. Anthropic AI (optional)

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up / Sign in
3. Navigate → **API Keys** → **Create Key**
4. Name: `wire-dev`
5. Copy the key (starts with `sk-ant-`) → `ANTHROPIC_API_KEY`

Push to Convex:
```bash
npx convex env set ANTHROPIC_API_KEY "sk-ant-..."
```

---

## 7. Pinecone (optional, for vector search)

1. Go to [app.pinecone.io](https://app.pinecone.io/) → Sign up / Sign in
2. Create a new **Index**:
   - Name: `wire`
   - Dimensions: `1536` (for OpenAI embeddings) or `1024` (for smaller models)
   - Metric: `cosine`
3. Dashboard → **API Keys** → Copy → `PINECONE_API_KEY`
4. Note your environment (e.g., `us-east-1-aws`) → `PINECONE_ENVIRONMENT`

---

## Summary: Where Each Var Goes

| Variable | `.env.local` | Convex (`npx convex env set`) |
|----------|:---:|:---:|
| `NEXT_PUBLIC_CONVEX_URL` | ✅ | — |
| `NEXT_PUBLIC_CLERK_*` | ✅ | — |
| `CLERK_SECRET_KEY` | ✅ | — |
| `CLERK_JWT_ISSUER_DOMAIN` | ✅ | ✅ |
| `GOOGLE_CLIENT_ID` | ✅ | ✅ |
| `GOOGLE_CLIENT_SECRET` | ✅ | ✅ |
| `GMAIL_PUBSUB_TOPIC` | ✅ | ✅ |
| `SLACK_CLIENT_ID` | ✅ | ✅ |
| `SLACK_CLIENT_SECRET` | ✅ | ✅ |
| `SLACK_SIGNING_SECRET` | ✅ | — |
| `TWILIO_ACCOUNT_SID` | ✅ | ✅ |
| `TWILIO_AUTH_TOKEN` | ✅ | ✅ |
| `TWILIO_WHATSAPP_FROM` | ✅ | ✅ |
| `DISCORD_CLIENT_SECRET` | ✅ | — |
| `DISCORD_PUBLIC_KEY` | ✅ | — |
| `DISCORD_BOT_TOKEN` | ✅ | ✅ |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | ✅ | — |
| `NEXT_PUBLIC_APP_URL` | ✅ | — |
| `ANTHROPIC_API_KEY` | ✅ | ✅ |
| `PINECONE_API_KEY` | ✅ | — |

> **Rule of thumb:** If the variable is used inside `convex/` files, it must be pushed via `npx convex env set`. If it starts with `NEXT_PUBLIC_`, it's client-side only (`.env.local` is enough).
