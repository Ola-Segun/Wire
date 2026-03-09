"use client";

import { memo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Brain,
  AlertTriangle,
  DollarSign,
  Layers,
  MessageSquare,
  Eye,
} from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Intelligence {
  sentimentTrend?: string;
  topTopics?: string[];
  aggregateChurnRisk?: string;
  dominantPhase?: string;
  dealSignalCount?: number;
  expansionSignals?: number;
  contractionSignals?: number;
  hiddenRequests?: string[];
  analyzedMessageCount?: number;
  updatedAt?: number;
}

interface ClientIntelligencePanelProps {
  intelligence: Intelligence | null | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  discovery:   { label: "Discovery",   color: "bg-blue-100 text-blue-700" },
  negotiation: { label: "Negotiation", color: "bg-amber-100 text-amber-700" },
  active:      { label: "Active",      color: "bg-success/10 text-success" },
  delivery:    { label: "Delivery",    color: "bg-primary/10 text-primary" },
  closing:     { label: "Closing",     color: "bg-purple-100 text-purple-700" },
  dormant:     { label: "Dormant",     color: "bg-muted text-muted-foreground" },
};

const CHURN_STYLES: Record<string, { label: string; color: string }> = {
  none:   { label: "None",   color: "text-success" },
  low:    { label: "Low",    color: "text-primary" },
  medium: { label: "Medium", color: "text-warning" },
  high:   { label: "High",   color: "text-urgent" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ClientIntelligencePanel = memo(function ClientIntelligencePanel({
  intelligence,
}: ClientIntelligencePanelProps) {
  const [expanded, setExpanded] = useState(true);

  // If no intelligence computed yet, show a placeholder
  if (!intelligence || !intelligence.analyzedMessageCount) {
    return (
      <div className="surface-raised rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          <h3 className="text-sm font-display font-semibold text-foreground">
            AI Intelligence
          </h3>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          Intelligence builds as messages are analyzed. Check back after a few conversations.
        </p>
      </div>
    );
  }

  const {
    sentimentTrend,
    topTopics,
    aggregateChurnRisk,
    dominantPhase,
    dealSignalCount,
    expansionSignals,
    contractionSignals,
    hiddenRequests,
    analyzedMessageCount,
    updatedAt,
  } = intelligence;

  const phaseInfo = PHASE_LABELS[dominantPhase ?? "active"] ?? PHASE_LABELS.active;
  const churnInfo = CHURN_STYLES[aggregateChurnRisk ?? "none"] ?? CHURN_STYLES.none;

  const hasRevenueSignals = (dealSignalCount ?? 0) > 0 || (expansionSignals ?? 0) > 0 || (contractionSignals ?? 0) > 0;
  const hasHiddenRequests = (hiddenRequests?.length ?? 0) > 0;

  return (
    <div className="surface-raised rounded-xl p-5">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          AI Intelligence
          <span className="text-[10px] font-mono font-normal text-muted-foreground">
            {analyzedMessageCount} msgs
          </span>
        </h3>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">

          {/* Row 1: Sentiment trend + Project phase */}
          <div className="grid grid-cols-2 gap-2">
            {/* Sentiment Trend */}
            <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-accent/30">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Sentiment trend
              </span>
              <div className="flex items-center gap-1.5">
                {sentimentTrend === "improving" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-success" />
                ) : sentimentTrend === "declining" ? (
                  <TrendingDown className="h-3.5 w-3.5 text-urgent" />
                ) : (
                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className={`text-xs font-medium capitalize ${
                  sentimentTrend === "improving" ? "text-success" :
                  sentimentTrend === "declining" ? "text-urgent" :
                  "text-muted-foreground"
                }`}>
                  {sentimentTrend ?? "Stable"}
                </span>
              </div>
            </div>

            {/* Project Phase */}
            <div className="flex flex-col gap-1 p-2.5 rounded-lg bg-accent/30">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Phase
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full w-fit ${phaseInfo.color}`}>
                {phaseInfo.label}
              </span>
            </div>
          </div>

          {/* Row 2: Churn risk */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-accent/30">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Churn risk
              </span>
            </div>
            <span className={`text-xs font-semibold ${churnInfo.color}`}>
              {churnInfo.label}
            </span>
          </div>

          {/* Row 3: Top topics */}
          {topTopics && topTopics.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Top topics
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {topTopics.map((topic) => (
                  <span
                    key={topic}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-border text-muted-foreground capitalize"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Revenue signals */}
          {hasRevenueSignals && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Revenue signals
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(dealSignalCount ?? 0) > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                    {dealSignalCount} deal signal{dealSignalCount !== 1 ? "s" : ""}
                  </span>
                )}
                {(expansionSignals ?? 0) > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {expansionSignals} upsell
                  </span>
                )}
                {(contractionSignals ?? 0) > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-urgent/10 text-urgent border border-urgent/20">
                    {contractionSignals} contraction
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Row 5: Hidden requests */}
          {hasHiddenRequests && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  Hidden requests
                </span>
              </div>
              <div className="space-y-1">
                {hiddenRequests!.slice(0, 4).map((req, i) => (
                  <p key={i} className="text-[11px] text-foreground/70 pl-1 border-l-2 border-primary/30">
                    {req}
                  </p>
                ))}
                {hiddenRequests!.length > 4 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{hiddenRequests!.length - 4} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Footer: last computed */}
          {updatedAt && (
            <p className="text-[10px] font-mono text-muted-foreground/50 pt-1 border-t border-border/20">
              Updated {formatTimeAgo(updatedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
