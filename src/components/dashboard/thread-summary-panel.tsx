"use client";

import { memo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ListChecks,
  HelpCircle,
} from "lucide-react";

const ARC_STYLES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  stable:      { label: "Stable",      color: "text-success",          icon: <Minus className="h-3.5 w-3.5" /> },
  improving:   { label: "Improving",   color: "text-success",          icon: <TrendingUp className="h-3.5 w-3.5" /> },
  escalating:  { label: "Escalating",  color: "text-urgent",           icon: <TrendingUp className="h-3.5 w-3.5" /> },
  resolving:   { label: "Resolving",   color: "text-primary",          icon: <TrendingDown className="h-3.5 w-3.5" /> },
  stalling:    { label: "Stalling",    color: "text-muted-foreground", icon: <Minus className="h-3.5 w-3.5" /> },
  discovery:   { label: "Discovery",   color: "text-blue-600",         icon: <Minus className="h-3.5 w-3.5" /> },
  negotiation: { label: "Negotiation", color: "text-amber-600",        icon: <Minus className="h-3.5 w-3.5" /> },
  active:      { label: "Active",      color: "text-success",          icon: <Minus className="h-3.5 w-3.5" /> },
  delivery:    { label: "Delivery",    color: "text-primary",          icon: <Minus className="h-3.5 w-3.5" /> },
  closing:     { label: "Closing",     color: "text-purple-600",       icon: <Minus className="h-3.5 w-3.5" /> },
  dormant:     { label: "Dormant",     color: "text-muted-foreground", icon: <Minus className="h-3.5 w-3.5" /> },
};

interface SummaryResult {
  summary: string;
  arc: string;
  keyDecisions: string[];
  openItems: string[];
  toneShift: string | null;
  actionItems: string[];
}

interface ThreadSummaryPanelProps {
  clientId: string;
  clientName: string;
}

export const ThreadSummaryPanel = memo(function ThreadSummaryPanel({
  clientId,
  clientName,
}: ThreadSummaryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch the latest conversation so we can pass conversationId to summarizeThread.
  // This allows the summary to be persisted to conversation_summaries and appear
  // in the workspace ConversationSummariesWidget.
  const latestConversation = useQuery(api.conversations.getLatestByClient, {
    clientId: clientId as any,
  });

  const summarize = useAction(api.ai.onDemandSkills.summarizeThread);

  const handleSummarize = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await summarize({
        clientId: clientId as any,
        // Pass conversationId only when available — enables DB persistence + workspace widget
        conversationId: latestConversation?._id ?? undefined,
      });
      setResult(data);
      setExpanded(true);
    } catch (err: any) {
      setError(err.message ?? "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  const arcInfo = ARC_STYLES[result?.arc ?? "stable"] ?? ARC_STYLES.stable;

  return (
    <div className="surface-raised rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Thread Summary
        </h3>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
          <button
            onClick={handleSummarize}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? "Summarizing…" : result ? "Refresh" : "Summarize"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-urgent/5 border border-urgent/20 text-xs text-urgent">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && expanded && (
        <div className="mt-3 space-y-3">

          {/* Arc + tone shift */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className={arcInfo.color}>{arcInfo.icon}</span>
              <span className={`text-xs font-medium ${arcInfo.color}`}>
                {arcInfo.label}
              </span>
            </div>
            {result.toneShift && result.toneShift !== "stable" && (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                result.toneShift === "improving"
                  ? "bg-success/10 text-success"
                  : "bg-urgent/10 text-urgent"
              }`}>
                Tone: {result.toneShift}
              </span>
            )}
          </div>

          {/* Summary */}
          <p className="text-xs text-foreground/80 leading-relaxed border-l-2 border-primary/30 pl-3">
            {result.summary}
          </p>

          {/* Key decisions */}
          {result.keyDecisions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Decisions made
                </span>
              </div>
              <ul className="space-y-1">
                {result.keyDecisions.map((d, i) => (
                  <li key={i} className="text-[11px] text-foreground/70 flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-success mt-1.5 shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Open items */}
          {result.openItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-warning" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Open items
                </span>
              </div>
              <ul className="space-y-1">
                {result.openItems.map((item, i) => (
                  <li key={i} className="text-[11px] text-foreground/70 flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-warning mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action items */}
          {result.actionItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ListChecks className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Action items
                </span>
              </div>
              <ul className="space-y-1">
                {result.actionItems.map((a, i) => (
                  <li key={i} className="text-[11px] text-foreground/70 flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Collapsed result hint */}
      {result && !expanded && (
        <p
          className="mt-2 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors line-clamp-2"
          onClick={() => setExpanded(true)}
        >
          {result.summary}
        </p>
      )}

      {/* Pre-generate nudge */}
      {!result && !loading && !error && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Get a TL;DR of your conversations with {clientName}.
        </p>
      )}
    </div>
  );
});
