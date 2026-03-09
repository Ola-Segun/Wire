import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// REMINDERS — Convex scheduler-fired skill outputs
// ============================================
//
// Called via ctx.scheduler.runAt() from commitments.createFromExtractedActions.
// Each fired reminder creates a skill_output (commitment_watchdog) so it appears
// in the skills feed and triggers the unread badge — zero extra infrastructure.
//
// Three reminder offsets per commitment (scheduled in commitments.ts):
//   1. 24h before due     → severity: "warning"
//   2. 2h before due      → severity: "warning"
//   3. At due time        → severity: "critical"
//
// Cancelled automatically when commitment is marked complete or cancelled.
// ============================================

export const fireReminder = internalMutation({
  args: {
    commitmentId: v.id("commitments"),
    userId: v.id("users"),
    clientId: v.id("clients"),
    text: v.string(),
    dueDate: v.number(),
    reminderType: v.string(), // "24h_before" | "2h_before" | "at_due"
  },
  handler: async (ctx, args) => {
    // Skip if commitment is no longer pending (completed/cancelled before reminder fired)
    const commitment = await ctx.db.get(args.commitmentId);
    if (!commitment || commitment.status !== "pending") return;

    const now = Date.now();
    const msUntilDue = args.dueDate - now;

    let severity: "info" | "warning" | "critical";
    let title: string;
    let content: string;

    if (args.reminderType === "at_due") {
      severity = "critical";
      title = "Commitment Due Now";
      content = args.text;
    } else if (args.reminderType === "2h_before") {
      severity = "warning";
      title = "Due in 2 hours";
      content = args.text;
    } else {
      // 24h_before
      severity = "warning";
      title = "Due Tomorrow";
      content = args.text;
    }

    // If we're already past due when this fires (clock drift / system lag), escalate
    if (msUntilDue < 0 && args.reminderType !== "at_due") {
      severity = "critical";
      title = "Overdue";
      content = args.text;
    }

    await ctx.runMutation(internal.skills.createOutput, {
      userId: args.userId,
      skillSlug: "commitment_watchdog",
      clientId: args.clientId,
      type: "commitment_reminder",
      severity,
      title,
      content,
      metadata: {
        commitmentId: args.commitmentId,
        dueDate: args.dueDate,
        reminderType: args.reminderType,
        firedAt: now,
      },
      actionable: true,
    });
  },
});
