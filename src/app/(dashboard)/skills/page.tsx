"use client";

import { useState, memo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Shield,
  Brain,
  Zap,
  ChevronDown,
  Bell,
  Check,
  X,
  AlertTriangle,
  Info,
  AlertCircle,
  Eye,
  Save,
} from "lucide-react";

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; description: string }
> = {
  guardian: {
    label: "Guardian",
    icon: <Shield className="h-4 w-4" />,
    color: "text-warning",
    description: "Protect your business from scope creep, missed deadlines, and silent churn",
  },
  intelligence: {
    label: "Intelligence",
    icon: <Brain className="h-4 w-4" />,
    color: "text-primary",
    description: "Surface hidden signals from client conversations",
  },
  productivity: {
    label: "Productivity",
    icon: <Zap className="h-4 w-4" />,
    color: "text-success",
    description: "Save time with AI-powered reply suggestions and summaries",
  },
};

const TRIGGER_LABELS: Record<string, string> = {
  reactive: "Runs automatically on new messages",
  cron: "Runs on schedule (every 4 hours)",
  on_demand: "Runs when you request it",
};

const SEVERITY_STYLES: Record<string, { icon: React.ReactNode; bg: string; text: string }> = {
  critical: { icon: <AlertCircle className="h-3.5 w-3.5" />, bg: "bg-urgent/10", text: "text-urgent" },
  warning: { icon: <AlertTriangle className="h-3.5 w-3.5" />, bg: "bg-warning/10", text: "text-warning" },
  info: { icon: <Info className="h-3.5 w-3.5" />, bg: "bg-primary/10", text: "text-primary" },
};

export default function SkillsPage() {
  const skills = useQuery(api.skills.getAll);
  const clients = useQuery(api.clients.getByUser, {});
  const outputs = useQuery(api.skills.getOutputs, { limit: 30 });
  const unreadCount = useQuery(api.skills.getUnreadCount);
  const toggleSkill = useMutation(api.skills.toggle);
  const dismissOutput = useMutation(api.skills.dismissOutput);
  const markOutputRead = useMutation(api.skills.markOutputRead);
  const markAllRead = useMutation(api.skills.markAllOutputsRead);

  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"skills" | "feed">("skills");

  if (!skills) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const grouped = {
    guardian: skills.filter((s) => s.category === "guardian"),
    intelligence: skills.filter((s) => s.category === "intelligence"),
    productivity: skills.filter((s) => s.category === "productivity"),
  };

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-display font-bold text-foreground">
          AI Skills
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Toggle AI capabilities that analyze your conversations and surface insights
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 w-fit mb-6">
        <button
          onClick={() => setActiveTab("skills")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === "skills"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Skills
        </button>
        <button
          onClick={() => setActiveTab("feed")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            activeTab === "feed"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bell className="h-3 w-3" />
          Feed
          {(unreadCount ?? 0) > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "skills" ? (
        <div className="space-y-6">
          {(["guardian", "intelligence", "productivity"] as const).map((category) => {
            const meta = CATEGORY_META[category];
            const categorySkills = grouped[category];

            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={meta.color}>{meta.icon}</div>
                  <div>
                    <h2 className="text-sm font-display font-semibold text-foreground">
                      {meta.label}
                    </h2>
                    <p className="text-[10px] text-muted-foreground">
                      {meta.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {categorySkills.map((skill) => (
                    <SkillCard
                      key={skill.slug}
                      skill={skill}
                      clients={clients ?? []}
                      expanded={expandedSkill === skill.slug}
                      onToggleExpand={() =>
                        setExpandedSkill(
                          expandedSkill === skill.slug ? null : skill.slug
                        )
                      }
                      onToggleEnabled={(enabled) =>
                        toggleSkill({ skillSlug: skill.slug, enabled })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Cost note */}
          <div className="flex items-start gap-2.5 p-4 rounded-xl border border-border/30 bg-muted/30">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Cost transparency:</span>{" "}
              Guardian and Intelligence skills use zero AI API calls — they analyze
              existing metadata from your message pipeline. Only Productivity skills
              (Smart Replies, Thread Summarizer) make additional AI calls using the
              cheapest model (Haiku) when you explicitly request them.
            </div>
          </div>
        </div>
      ) : (
        <SkillFeed
          outputs={outputs ?? []}
          onDismiss={(id) => dismissOutput({ id })}
          onMarkRead={(id) => markOutputRead({ id })}
          onMarkAllRead={() => markAllRead({})}
          unreadCount={unreadCount ?? 0}
        />
      )}
    </div>
  );
}

// ============================================
// CONFIG FIELD SCHEMAS — per-skill editable fields
// ============================================

interface ConfigField {
  key: string;
  label: string;
  type: "select" | "number";
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  hint?: string;
}

const SKILL_CONFIG_FIELDS: Record<string, ConfigField[]> = {
  scope_guardian: [
    {
      key: "sensitivity",
      label: "Sensitivity",
      type: "select",
      options: [
        { value: "low", label: "Low — only obvious requests" },
        { value: "medium", label: "Medium — balanced (default)" },
        { value: "high", label: "High — flag any ambiguity" },
      ],
      hint: "How aggressively to flag scope creep",
    },
  ],
  commitment_watchdog: [
    {
      key: "warningDaysBeforeDue",
      label: "Warn before due (days)",
      type: "number",
      min: 0,
      max: 7,
      hint: "Alert this many days before a commitment is due",
    },
  ],
  ghosting_detector: [
    {
      key: "silenceMultiplier",
      label: "Silence threshold",
      type: "number",
      min: 1,
      max: 10,
      hint: "Alert when silence exceeds (average response time × this value)",
    },
  ],
  smart_replies: [
    {
      key: "replyCount",
      label: "Suggestions to generate",
      type: "number",
      min: 1,
      max: 5,
      hint: "How many reply options to generate per message",
    },
  ],
};

// ============================================
// SKILL CARD
// ============================================

const SkillCard = memo(function SkillCard({
  skill,
  clients,
  expanded,
  onToggleExpand,
  onToggleEnabled,
}: {
  skill: Record<string, any>;
  clients: Array<Record<string, any>>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const updateConfig = useMutation(api.skills.updateConfig);
  const [draftConfig, setDraftConfig] = useState<Record<string, any>>(skill.config ?? {});
  // clientScope: null = all clients; string[] = scoped client IDs
  const [draftScope, setDraftScope] = useState<string[] | null>(skill.clientScope ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const configFields = SKILL_CONFIG_FIELDS[skill.slug] ?? [];
  const hasConfig = configFields.length > 0;

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await updateConfig({
        skillSlug: skill.slug,
        config: draftConfig,
        clientScope: draftScope ?? undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Config save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleClientScope = (clientId: string) => {
    setDraftScope((prev) => {
      if (prev === null) {
        // Was "all clients" → scope to just this one
        return [clientId];
      }
      if (prev.includes(clientId)) {
        const next = prev.filter((id) => id !== clientId);
        // Empty scope array = all clients
        return next.length === 0 ? null : next;
      }
      return [...prev, clientId];
    });
  };

  const isConfigDirty = JSON.stringify(draftConfig) !== JSON.stringify(skill.config ?? {});
  const isScopeDirty = JSON.stringify(draftScope) !== JSON.stringify(skill.clientScope ?? null);
  const isDirty = isConfigDirty || isScopeDirty;

  return (
    <div
      className={`surface-raised rounded-xl p-4 transition-all ${
        skill.enabled ? "border border-border/30" : "border border-border/10 opacity-70"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {skill.name}
              </span>
              {skill.requiresAiCall && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
                  AI call
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {skill.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle switch */}
          <button
            onClick={() => onToggleEnabled(!skill.enabled)}
            className={`relative w-10 rounded-full transition-colors ${
              skill.enabled ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            style={{ height: "22px" }}
          >
            <span
              className={`absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
                skill.enabled ? "translate-x-[18px]" : ""
              }`}
            />
          </button>

          {/* Expand details */}
          <button
            onClick={onToggleExpand}
            className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/20 space-y-3">
          {/* Trigger label */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider w-16 shrink-0">
              Trigger
            </span>
            <span className="text-[11px] text-muted-foreground">
              {TRIGGER_LABELS[skill.trigger] ?? skill.trigger}
            </span>
          </div>

          {/* Config fields */}
          {hasConfig && (
            <div className="space-y-2.5">
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                Configuration
              </span>
              {configFields.map((field) => (
                <div key={field.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-foreground">
                      {field.label}
                    </label>
                    {field.hint && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {field.hint}
                      </span>
                    )}
                  </div>
                  {field.type === "select" ? (
                    <select
                      value={draftConfig[field.key] ?? field.options![0].value}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="w-full text-[11px] rounded-lg border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {field.options!.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={draftConfig[field.key] ?? ""}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          [field.key]: Number(e.target.value),
                        }))
                      }
                      className="w-24 text-[11px] rounded-lg border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Per-client scope — only show when user has more than one client */}
          {clients.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                  Apply to clients
                </span>
                {draftScope !== null && (
                  <button
                    onClick={() => setDraftScope(null)}
                    className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                  >
                    Reset to all
                  </button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                {draftScope === null
                  ? "Running for all clients"
                  : draftScope.length === 0
                    ? "No clients selected — skill is effectively paused"
                    : `Running for ${draftScope.length} client${draftScope.length !== 1 ? "s" : ""}`}
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin">
                {clients.filter((c) => !c.isArchived).map((client) => {
                  const isChecked = draftScope === null || draftScope.includes(client._id);
                  return (
                    <label
                      key={client._id}
                      className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleClientScope(client._id)}
                        className="w-3.5 h-3.5 rounded accent-primary"
                      />
                      <span className="text-[11px] text-foreground truncate">
                        {client.name}
                      </span>
                      {client.company && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {client.company}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save button — shows when config OR scope has unsaved changes */}
          {isDirty && (
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saved ? (
                <Check className="h-3 w-3" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================
// SKILL FEED — Real-time alerts and insights
// ============================================

const SkillFeed = memo(function SkillFeed({
  outputs,
  onDismiss,
  onMarkRead,
  onMarkAllRead,
  unreadCount,
}: {
  outputs: Array<Record<string, any>>;
  onDismiss: (id: any) => void;
  onMarkRead: (id: any) => void;
  onMarkAllRead: () => void;
  unreadCount: number;
}) {
  if (outputs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm">No skill outputs yet</p>
        <p className="text-[11px] mt-1">
          Insights and alerts will appear here as your skills process messages
        </p>
      </div>
    );
  }

  return (
    <div>
      {unreadCount > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground">
            {unreadCount} unread
          </span>
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Eye className="h-3 w-3" />
            Mark all read
          </button>
        </div>
      )}

      <div className="space-y-2">
        {outputs.map((output, index) => {
          const severity = SEVERITY_STYLES[output.severity ?? "info"] ?? SEVERITY_STYLES.info;

          return (
            <div
              key={output._id}
              className={`surface-raised rounded-xl p-4 transition-all animate-slide-in ${
                !output.isRead ? "border-l-2 border-l-primary" : ""
              }`}
              style={{ animationDelay: `${index * 30}ms` }}
              onClick={() => {
                if (!output.isRead) onMarkRead(output._id);
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${severity.bg} ${severity.text}`}
                >
                  {severity.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {output.title}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {output.skillSlug.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {output.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {formatTimeAgo(output.createdAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(output._id);
                  }}
                  className="p-1 rounded-lg hover:bg-accent/50 transition-colors shrink-0"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
