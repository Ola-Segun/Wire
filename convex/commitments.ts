import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ─── Reminder scheduling helpers ──────────────────────────────────────────────

// Offsets (ms) before due date at which reminders fire.
// Only schedule offsets that are still in the future at insert time.
const REMINDER_OFFSETS: Array<{ ms: number; type: string }> = [
  { ms: 24 * 60 * 60 * 1000, type: "24h_before" },
  { ms: 2 * 60 * 60 * 1000,  type: "2h_before"  },
  { ms: 0,                    type: "at_due"      },
];

// ============================================
// HELPERS
// ============================================

async function resolveUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
}

// ============================================
// COMMITMENTS — Extracted action items / deadlines
// ============================================
// Foundation for wire2.md's "Commitment Tracker":
// AI extracts "send revised logo by Thursday" → tracked task.
// This module provides CRUD; AI wiring comes in the AI phase.

// Internal mutation: persist AI-extracted actions as commitments.
// Called from ai/unified.ts after analyzeMessage completes — no auth needed
// since the AI pipeline runs server-side with validated message ownership.
//
// actionsWithDates (from field 13 in unified.ts) carries AI-resolved due timestamps
// and confidence scores. When a resolved timestamp is present, Convex scheduler
// jobs are scheduled for 24h-before, 2h-before, and at-due reminders.
export const createFromExtractedActions = internalMutation({
  args: {
    userId: v.id("users"),
    clientId: v.id("clients"),
    conversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.id("messages"),
    actions: v.array(v.string()),
    // Optional: parallel array matching actions[], carrying AI-resolved dates
    actionsWithDates: v.optional(v.array(v.object({
      text: v.string(),
      dueDateIso: v.optional(v.string()),
      dueTimeOfDay: v.optional(v.string()),
      confidence: v.string(),
      resolvedTimestamp: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args) => {
    if (args.actions.length === 0) return;

    const now = Date.now();
    const dateMap = new Map<string, {
      resolvedTimestamp?: number;
      confidence: string;
      dueTimeOfDay?: string;
    }>();
    for (const entry of args.actionsWithDates ?? []) {
      dateMap.set(entry.text, {
        resolvedTimestamp: entry.resolvedTimestamp,
        confidence: entry.confidence,
        dueTimeOfDay: entry.dueTimeOfDay,
      });
    }

    for (const text of args.actions) {
      const dateInfo = dateMap.get(text);
      const dueDate = dateInfo?.resolvedTimestamp;
      const dueDateConfidence =
        dateInfo?.confidence === "explicit" || dateInfo?.confidence === "inferred"
          ? dateInfo.confidence
          : undefined;

      const commitmentId = await ctx.db.insert("commitments", {
        userId: args.userId,
        clientId: args.clientId,
        conversationId: args.conversationId,
        sourceMessageId: args.sourceMessageId,
        text,
        type: "deliverable",
        status: "pending",
        dueDate,
        dueDateConfidence,
        // Persist time-of-day hint so calendar/agenda can surface it without re-reading messages
        dueTimeOfDay: dateInfo?.dueTimeOfDay ?? undefined,
        createdAt: now,
      });

      // Schedule reminders only when a due date was extracted
      if (dueDate) {
        const jobIds: string[] = [];

        for (const { ms, type: reminderType } of REMINDER_OFFSETS) {
          const fireAt = dueDate - ms;
          // Only schedule future reminders (skip if already past)
          if (fireAt > now) {
            const jobId = await ctx.scheduler.runAt(fireAt, internal.reminders.fireReminder, {
              commitmentId,
              userId: args.userId,
              clientId: args.clientId,
              text,
              dueDate,
              reminderType,
            });
            jobIds.push(jobId);
          }
        }

        if (jobIds.length > 0) {
          await ctx.db.patch(commitmentId, { schedulerJobIds: jobIds });
        }
      }
    }
  },
});

// Create a commitment (called by AI extraction or manually by user)
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    conversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.optional(v.id("messages")), // Optional: manual commitments may have no source message
    text: v.string(),
    type: v.string(),     // "deadline" | "deliverable" | "payment" | "meeting" | "check_in"
    dueDate: v.optional(v.number()),
    dueTimeOfDay: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify client belongs to user
    const client = await ctx.db.get(args.clientId);
    if (!client || client.userId !== user._id)
      throw new Error("Unauthorized");

    return await ctx.db.insert("commitments", {
      userId: user._id,
      clientId: args.clientId,
      conversationId: args.conversationId,
      sourceMessageId: args.sourceMessageId,
      text: args.text,
      type: args.type,
      status: "pending",
      dueDate: args.dueDate,
      dueTimeOfDay: args.dueTimeOfDay,
      createdAt: Date.now(),
    });
  },
});

// Mark commitment as complete — cancels any pending reminders
export const complete = mutation({
  args: { id: v.id("commitments") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const commitment = await ctx.db.get(args.id);
    if (!commitment) throw new Error("Commitment not found");
    if (commitment.userId !== user._id) throw new Error("Unauthorized");

    // Cancel all pending scheduler jobs before marking complete
    for (const jobId of commitment.schedulerJobIds ?? []) {
      try { await ctx.scheduler.cancel(jobId as Id<"_scheduled_functions">); } catch { /* already fired */ }
    }

    await ctx.db.patch(args.id, {
      status: "completed",
      completedAt: Date.now(),
      schedulerJobIds: [],
    });
  },
});

// Cancel a commitment — cancels any pending reminders
export const cancel = mutation({
  args: { id: v.id("commitments") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const commitment = await ctx.db.get(args.id);
    if (!commitment) throw new Error("Commitment not found");
    if (commitment.userId !== user._id) throw new Error("Unauthorized");

    // Cancel all pending scheduler jobs before marking cancelled
    for (const jobId of commitment.schedulerJobIds ?? []) {
      try { await ctx.scheduler.cancel(jobId as Id<"_scheduled_functions">); } catch { /* already fired */ }
    }

    await ctx.db.patch(args.id, { status: "cancelled", schedulerJobIds: [] });
  },
});

// Get commitments for a client, enriched with a short snippet of the source message.
export const getByClient = query({
  args: {
    clientId: v.id("clients"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const commitments = await ctx.db
      .query("commitments")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    const filtered = commitments.filter(
      (c) =>
        c.userId === user._id && (!args.status || c.status === args.status)
    );

    if (filtered.length === 0) return [];

    // Batch-fetch unique source messages to avoid N+1
    // Guard: sourceMessageId is optional (system-generated check-ins have none)
    const uniqueMessageIds = [
      ...new Set(filtered.filter((c) => c.sourceMessageId).map((c) => c.sourceMessageId as string)),
    ];
    const messages = await Promise.all(
      uniqueMessageIds.map((id) => ctx.db.get(id as Id<"messages">))
    );
    const msgMap = new Map<string, string>();
    for (let i = 0; i < uniqueMessageIds.length; i++) {
      const text = messages[i]?.text;
      if (text) {
        msgMap.set(uniqueMessageIds[i], text.length > 100 ? text.slice(0, 100) + "…" : text);
      }
    }

    return filtered.map((c) => ({
      ...c,
      sourceMessageText: c.sourceMessageId ? (msgMap.get(c.sourceMessageId) ?? undefined) : undefined,
    }));
  },
});

// Get all pending/overdue commitments for current user
export const getPending = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const commitments = await ctx.db
      .query("commitments")
      .withIndex("by_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .collect();

    // Check for overdue items
    const now = Date.now();
    return commitments.map((c) => ({
      ...c,
      isOverdue: c.dueDate ? c.dueDate < now : false,
    }));
  },
});

// Internal query: fetch pending commitments without auth context.
// Used by skillDispatcher (commitment_watchdog, payment_sentinel) from cron.
export const getPendingInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commitments")
      .withIndex("by_status", (q) =>
        q.eq("userId", args.userId).eq("status", "pending")
      )
      .collect();
  },
});

// Get pending commitments enriched with client names and source message snippets
// — used by the dashboard. Returns at most 20 records, newest first.
export const getPendingWithClients = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const commitments = await ctx.db
      .query("commitments")
      .withIndex("by_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .order("desc")
      .take(20);

    if (commitments.length === 0) return [];

    // Batch-fetch unique clients to avoid N+1
    const uniqueClientIds = [...new Set(commitments.map((c) => c.clientId as string))];
    const clientDocs = await Promise.all(
      uniqueClientIds.map((id) => ctx.db.get(id as Id<"clients">))
    );
    const clientMap = new Map<string, string>();
    for (let i = 0; i < uniqueClientIds.length; i++) {
      clientMap.set(uniqueClientIds[i], clientDocs[i]?.name ?? "Unknown");
    }

    // Batch-fetch unique source messages for context snippets
    // Guard: sourceMessageId is optional (system-generated check-ins have none)
    const uniqueMessageIds = [
      ...new Set(commitments.filter((c) => c.sourceMessageId).map((c) => c.sourceMessageId as string)),
    ];
    const messageDocs = await Promise.all(
      uniqueMessageIds.map((id) => ctx.db.get(id as Id<"messages">))
    );
    const msgMap = new Map<string, string>();
    for (let i = 0; i < uniqueMessageIds.length; i++) {
      const text = messageDocs[i]?.text;
      if (text) {
        msgMap.set(uniqueMessageIds[i], text.length > 100 ? text.slice(0, 100) + "…" : text);
      }
    }

    const now = Date.now();
    return commitments.map((c) => ({
      ...c,
      clientName: clientMap.get(c.clientId as string) ?? "Unknown",
      isOverdue: c.dueDate ? c.dueDate < now : false,
      sourceMessageText: c.sourceMessageId ? (msgMap.get(c.sourceMessageId) ?? undefined) : undefined,
    }));
  },
});

// Get all non-cancelled commitments within a date range — calendar grid view.
// Returns pending + completed (for historical reference). Excludes cancelled.
// Sorted ascending by dueDate so earliest events render first.
//
// OPTIMISED: uses by_user_due index for a bounded date-range read instead of
// scanning ALL pending + ALL completed records and filtering in memory.
// Previous version: O(n) full-table scans × 2.  New version: O(range) only.
export const getAllForCalendar = query({
  args: {
    startDate: v.number(), // epoch ms — start of visible range
    endDate: v.number(),   // epoch ms — end of visible range
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    // Single index scan: only records whose dueDate falls inside the window.
    // Records with dueDate=undefined are excluded automatically by the index.
    const inRange = await ctx.db
      .query("commitments")
      .withIndex("by_user_due", (q) =>
        q.eq("userId", user._id)
          .gte("dueDate", args.startDate)
          .lte("dueDate", args.endDate)
      )
      .filter((q) => q.neq(q.field("status"), "cancelled"))
      .collect();

    if (inRange.length === 0) return [];

    // Batch-fetch client names
    const uniqueClientIds = [...new Set(inRange.map((c) => c.clientId as string))];
    const clientDocs = await Promise.all(uniqueClientIds.map((id) => ctx.db.get(id as Id<"clients">)));
    const clientMap = new Map(uniqueClientIds.map((id, i) => [id, clientDocs[i]?.name ?? "Unknown"]));

    const now = Date.now();
    return inRange
      .map((c) => ({
        ...c,
        clientName: clientMap.get(c.clientId as string) ?? "Unknown",
        isOverdue: c.dueDate ? c.dueDate < now : false,
      }))
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
  },
});

// Get today's agenda: overdue items first, then commitments due within the requested range.
// Enriched with client names. Used by agenda_today and agenda_week widgets.
//
// OPTIMISED: two bounded index scans instead of scanning ALL pending records.
// Previous: collect() all pending → filter in memory.
// New: by_user_due range scan for in-range + a separate bounded scan for overdue.
export const getAgendaForDateRange = query({
  args: {
    startDate: v.number(), // epoch ms — start of range (usually start of today)
    endDate: v.number(),   // epoch ms — end of range (today EOD or week end)
    includeOverdue: v.optional(v.boolean()), // also include items past-due (default true)
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    const includeOverdue = args.includeOverdue !== false;
    const now = Date.now();

    // In-range pending items via index — O(range) not O(all pending)
    const inRange = await ctx.db
      .query("commitments")
      .withIndex("by_user_due", (q) =>
        q.eq("userId", user._id)
          .gte("dueDate", args.startDate)
          .lte("dueDate", args.endDate)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // Overdue: pending items whose dueDate is before startDate.
    // Use by_status index (reads ONLY pending records) then filter by date in memory.
    // This avoids reading completed/cancelled records via by_user_due which could
    // be large when many historical commitments have been completed.
    let overdue: typeof inRange = [];
    if (includeOverdue) {
      const allPending = await ctx.db
        .query("commitments")
        .withIndex("by_status", (q) =>
          q.eq("userId", user._id).eq("status", "pending")
        )
        .collect();
      overdue = allPending.filter(
        (c) => c.dueDate != null && c.dueDate < args.startDate
      );
    }

    const combined = [...overdue, ...inRange].sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

    if (combined.length === 0) return [];

    // Batch-fetch client names
    const uniqueClientIds = [...new Set(combined.map((c) => c.clientId as string))];
    const clientDocs = await Promise.all(uniqueClientIds.map((id) => ctx.db.get(id as Id<"clients">)));
    const clientMap = new Map(uniqueClientIds.map((id, i) => [id, clientDocs[i]?.name ?? "Unknown"]));

    return combined.map((c) => ({
      ...c,
      clientName: clientMap.get(c.clientId as string) ?? "Unknown",
      isOverdue: c.dueDate ? c.dueDate < now : false,
    }));
  },
});

// Get commitments for a conversation
export const getByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("commitments")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
  },
});
