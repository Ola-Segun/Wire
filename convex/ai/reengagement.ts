import { v } from "convex/values";
import { internalAction, internalMutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";

// ============================================
// PROACTIVE RE-ENGAGEMENT SCHEDULER
// Identifies dormant clients and generates personalised outreach.
//
// Logic:
//   - A client is "dormant" if silence > responseTimeAvg * dormancyMultiplier
//   - dormancyMultiplier defaults to 2 (configurable in skill settings)
//   - Generates a personalised re-engagement template via 1 Haiku call
//   - Creates a skill output with the template + optimal send time hint
//   - Auto-creates a follow-up commitment for tracking
//
// Cost: 1 Haiku call per dormant client (50/day max across all users)
// ============================================

export const runForUser = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    // Check skill enabled
    const skillConfig: any = await ctx.runQuery(internal.skills.getSkillConfig, {
      userId,
      skillSlug: "reengagement_scheduler",
    });
    if (!skillConfig.enabled) return;

    const multiplier: number = (skillConfig.config as any)?.dormancyMultiplier ?? 2;
    const MIN_SILENCE_MS = 3 * 24 * 60 * 60 * 1000; // never flag clients silent for < 3 days

    const clients: any[] = await ctx.runQuery(internal.clients.getActiveByUserInternal, { userId });
    const now = Date.now();

    for (const client of clients) {
      try {
        // Skip clients with no established response cadence
        if (!client.responseTimeAvg || client.responseTimeAvg <= 0) continue;

        const silenceMs = now - client.lastContactDate;
        const thresholdMs = Math.max(MIN_SILENCE_MS, client.responseTimeAvg * multiplier);

        if (silenceMs <= thresholdMs) continue; // Not dormant yet

        // Only fire once per 7-day window per client
        const recent: boolean = await ctx.runQuery(internal.skillDispatcher.hasRecentOutput, {
          userId,
          skillSlug: "reengagement_scheduler",
          clientId: client._id,
          withinMs: 7 * 24 * 60 * 60 * 1000,
        });
        if (recent) continue;

        // Get send time hint from optimization data
        const sendTimeData: any = await ctx.runQuery(
          internal.ai.sendTimeOptimization.getBestTimeForClient,
          { clientId: client._id }
        );

        // Generate personalised outreach template via Claude Haiku
        const template = await generateReengagementTemplate(client, silenceMs, sendTimeData);

        // Build send time hint string
        const sendTimeHint = sendTimeData
          ? `Best time to reach ${client.name}: ${formatHour(sendTimeData.bestHour)} on ${formatDay(sendTimeData.bestDayOfWeek)} (${sendTimeData.confidence} confidence)`
          : null;

        // Create skill output with the template
        await ctx.runMutation(internal.skills.createOutput, {
          userId,
          skillSlug: "reengagement_scheduler",
          clientId: client._id,
          type: "suggestion",
          severity: "info",
          title: `Re-engage ${client.name} — ${Math.round(silenceMs / (24 * 60 * 60 * 1000))} days quiet`,
          content: `This client has gone dormant beyond their usual cadence. A personalised outreach message has been drafted.${sendTimeHint ? ` ${sendTimeHint}.` : ""}`,
          metadata: {
            reengagementTemplate: template,
            silenceDays: Math.round(silenceMs / (24 * 60 * 60 * 1000)),
            avgResponseDays: Math.round(client.responseTimeAvg / (24 * 60 * 60 * 1000)),
            sendTimeHint,
            bestHour: sendTimeData?.bestHour,
            bestDayOfWeek: sendTimeData?.bestDayOfWeek,
          },
          actionable: true,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        // Auto-create a follow-up commitment
        await ctx.runMutation(internal.ai.reengagement.createFollowUpCommitment, {
          userId,
          clientId: client._id,
          clientName: client.name,
          daysOverdue: Math.round(silenceMs / (24 * 60 * 60 * 1000)),
        });
      } catch (err) {
        console.error(
          `[Reengagement] Failed for client ${client._id}:`,
          String(err).split("\n")[0]
        );
      }
    }
  },
});

// ---- Internal mutation: create follow-up commitment ----
export const createFollowUpCommitment = internalMutation({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
    clientName: v.string(),
    daysOverdue: v.number(),
  },
  handler: async (ctx, args) => {
    // Due in 2 days from now
    const dueDate = Date.now() + 2 * 24 * 60 * 60 * 1000;

    await ctx.db.insert("commitments", {
      userId: args.userId,
      clientId: args.clientId,
      text: `Follow up with ${args.clientName} — dormant ${args.daysOverdue} days`,
      type: "check_in",
      status: "pending",
      dueDate,
      dueDateConfidence: "inferred",
      createdAt: Date.now(),
    });
  },
});

// ---- Query: get send time best time for a client ----
// (Thin wrapper used by runForUser above)

// ---- Helper: generate personalised template ----
async function generateReengagementTemplate(
  client: any,
  silenceMs: number,
  sendTimeData: any
): Promise<string> {
  const silenceDays = Math.round(silenceMs / (24 * 60 * 60 * 1000));
  const firstName = client.name.split(" ")[0];

  // Build context about the client
  const intelligence = client.intelligence ?? {};
  const topics = intelligence.topTopics?.slice(0, 3)?.join(", ") ?? "your project";
  const phase = intelligence.dominantPhase ?? "active";

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are a freelancer's AI assistant. Write a short, warm re-engagement message for a client who has been quiet for ${silenceDays} days.

Client name: ${client.name}
Recent topics of conversation: ${topics}
Current project phase: ${phase}

Requirements:
- 2–3 sentences maximum
- Warm but professional tone
- Reference their name naturally
- Mention value or checking in on progress
- Include one specific question
- No salesy language
- End with a soft call-to-action

Write ONLY the message body (no subject line, no greeting prefix like "Hi,"):`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    return (response.content[0] as { type: string; text: string }).text.trim();
  } catch {
    // Fallback template if AI fails
    return `Hi ${firstName},\n\nI wanted to check in and see how things are going with ${topics}. It's been a little while since we last connected, and I'd love to hear how you're progressing.\n\nAre you available for a quick catch-up this week?`;
  }
}

// ---- Helpers ----
function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${period}`;
}

function formatDay(day: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}
