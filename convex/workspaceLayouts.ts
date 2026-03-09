import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
// DEFAULT LAYOUTS — Created on first access
// ============================================

const DEFAULT_LAYOUT = {
  name: "Overview",
  widgets: [
    { id: "stat-unread", type: "stat_card", size: "1x1", config: { metric: "unread" } },
    { id: "stat-urgent", type: "stat_card", size: "1x1", config: { metric: "urgent" } },
    { id: "stat-actions", type: "stat_card", size: "1x1", config: { metric: "actions" } },
    { id: "stat-clients", type: "stat_card", size: "1x1", config: { metric: "clients" } },
    { id: "priority-inbox", type: "priority_inbox", size: "2x2" },
    { id: "skill-feed", type: "skill_feed", size: "2x2" },
    { id: "client-health", type: "client_health", size: "2x1" },
    { id: "recent-actions", type: "recent_actions", size: "2x1" },
  ],
};

// ============================================
// QUERIES
// ============================================

// Get all layouts for the current user
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return [];

    return await ctx.db
      .query("workspace_layouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

// Get the default (active) layout
export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) return null;

    const layouts = await ctx.db
      .query("workspace_layouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Return the default, or the first one, or null
    return layouts.find((l) => l.isDefault) ?? layouts[0] ?? null;
  },
});

// ============================================
// MUTATIONS
// ============================================

// Initialize default layout for a user (idempotent)
export const ensureDefault = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("workspace_layouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("workspace_layouts", {
      userId: user._id,
      name: DEFAULT_LAYOUT.name,
      isDefault: true,
      widgets: DEFAULT_LAYOUT.widgets,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update widgets in a layout
export const updateWidgets = mutation({
  args: {
    layoutId: v.id("workspace_layouts"),
    widgets: v.array(
      v.object({
        id: v.string(),
        type: v.string(),
        size: v.string(),
        config: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const layout = await ctx.db.get(args.layoutId);
    if (!layout || layout.userId !== user._id) throw new Error("Not found");

    await ctx.db.patch(args.layoutId, {
      widgets: args.widgets,
      updatedAt: Date.now(),
    });
  },
});

// Add a widget to a layout
export const addWidget = mutation({
  args: {
    layoutId: v.id("workspace_layouts"),
    widget: v.object({
      id: v.string(),
      type: v.string(),
      size: v.string(),
      config: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const layout = await ctx.db.get(args.layoutId);
    if (!layout || layout.userId !== user._id) throw new Error("Not found");

    // Prevent duplicate widget IDs
    if (layout.widgets.some((w) => w.id === args.widget.id)) return;

    await ctx.db.patch(args.layoutId, {
      widgets: [...layout.widgets, args.widget],
      updatedAt: Date.now(),
    });
  },
});

// Remove a widget from a layout
export const removeWidget = mutation({
  args: {
    layoutId: v.id("workspace_layouts"),
    widgetId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const layout = await ctx.db.get(args.layoutId);
    if (!layout || layout.userId !== user._id) throw new Error("Not found");

    await ctx.db.patch(args.layoutId, {
      widgets: layout.widgets.filter((w) => w.id !== args.widgetId),
      updatedAt: Date.now(),
    });
  },
});

// Create a new layout preset
export const create = mutation({
  args: {
    name: v.string(),
    widgets: v.array(
      v.object({
        id: v.string(),
        type: v.string(),
        size: v.string(),
        config: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const now = Date.now();
    return await ctx.db.insert("workspace_layouts", {
      userId: user._id,
      name: args.name,
      isDefault: false,
      widgets: args.widgets,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Set a layout as the default
export const setDefault = mutation({
  args: { layoutId: v.id("workspace_layouts") },
  handler: async (ctx, args) => {
    const user = await resolveUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const layout = await ctx.db.get(args.layoutId);
    if (!layout || layout.userId !== user._id) throw new Error("Not found");

    // Un-default all others
    const all = await ctx.db
      .query("workspace_layouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const l of all) {
      if (l.isDefault && l._id !== args.layoutId) {
        await ctx.db.patch(l._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.layoutId, { isDefault: true });
  },
});
