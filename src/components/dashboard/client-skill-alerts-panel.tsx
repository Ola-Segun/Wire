"use client";

import { memo, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Check,
  FileText,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

const SEVERITY_STYLES: Record<string, { icon: React.ReactNode; ring: string; text: string; bg: string }> = {
  critical: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    ring: "border-urgent/30",
    text: "text-urgent",
    bg: "bg-urgent/5",
  },
  warning: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    ring: "border-warning/30",
    text: "text-warning",
    bg: "bg-warning/5",
  },
  info: {
    icon: <Info className="h-3.5 w-3.5" />,
    ring: "border-primary/20",
    text: "text-primary",
    bg: "bg-primary/5",
  },
};

interface ClientSkillAlertsPanelProps {
  clientId: string;
}

export const ClientSkillAlertsPanel = memo(function ClientSkillAlertsPanel({
  clientId,
}: ClientSkillAlertsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const outputs = useQuery(api.skills.getOutputs, {
    clientId: clientId as any,
    limit: 10,
  });
  const dismiss       = useMutation(api.skills.dismissOutput);
  const markRead      = useMutation(api.skills.markOutputRead);
  const markActioned  = useMutation(api.skills.markActionTaken);

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  const toggleAction = useCallback((id: string) => {
    setExpandedAction((prev) => (prev === id ? null : id));
  }, []);

  if (!outputs) return null;
  if (outputs.length === 0) return null;

  const unreadCount = outputs.filter((o) => !o.isRead).length;

  return (
    <div className="surface-raised rounded-xl p-5">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          AI Alerts
          {unreadCount > 0 && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning">
              {unreadCount} new
            </span>
          )}
        </h3>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {outputs.map((output) => {
            const style = SEVERITY_STYLES[output.severity ?? "info"] ?? SEVERITY_STYLES.info;
            const meta = output.metadata as Record<string, any> | undefined;
            const isActionExpanded = expandedAction === output._id;

            // Determine which action panel to show
            const showRateCard = output.skillSlug === "scope_guardian";
            const showRecovery = output.skillSlug === "churn_predictor" && meta?.crisisMode === true;
            const hasAction = showRateCard || showRecovery;

            return (
              <div key={output._id} className="space-y-1.5">
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${style.ring} ${style.bg} ${
                    !output.isRead ? "ring-1 ring-primary/20" : ""
                  }`}
                  onClick={() => {
                    if (!output.isRead) markRead({ id: output._id });
                  }}
                >
                  <span className={`mt-0.5 shrink-0 ${style.text}`}>
                    {style.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {output.title}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {output.skillSlug.replace(/_/g, " ")}
                      </span>
                      {!output.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {output.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <p className="text-[10px] font-mono text-muted-foreground/50">
                        {formatTimeAgo(output.createdAt)}
                      </p>
                      {/* Action buttons */}
                      {hasAction && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAction(output._id);
                          }}
                          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                            isActionExpanded
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {showRateCard ? (
                            <>
                              <FileText className="h-2.5 w-2.5" />
                              Rate Card
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-2.5 w-2.5" />
                              Recovery Template
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    title="Dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss({ id: output._id });
                    }}
                    className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Rate Card Template (scope_guardian) */}
                {showRateCard && isActionExpanded && (
                  <RateCardPanel
                    outputId={output._id}
                    deliverables={meta?.deliverables as string[] | undefined}
                    onCopy={handleCopy}
                    copied={copied}
                    onActionTaken={() => markActioned({ id: output._id })}
                  />
                )}

                {/* Crisis Recovery Template (churn_predictor in crisis mode) */}
                {showRecovery && isActionExpanded && meta?.recoveryTemplate && (
                  <RecoveryTemplatePanel
                    outputId={output._id}
                    template={meta.recoveryTemplate as string}
                    clientName={meta.clientName as string}
                    onCopy={handleCopy}
                    copied={copied}
                    onActionTaken={() => markActioned({ id: output._id })}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

// ─── Rate Card Panel ──────────────────────────────────────────────────────────

const RateCardPanel = memo(function RateCardPanel({
  outputId,
  deliverables,
  onCopy,
  copied,
  onActionTaken,
}: {
  outputId: string;
  deliverables?: string[];
  onCopy: (id: string, text: string) => void;
  copied: string | null;
  onActionTaken: () => void;
}) {
  const scopeContext = deliverables?.length
    ? `\n\nFor reference, our current agreement covers: ${deliverables.join(", ")}.`
    : "";

  const template = `Thanks for reaching out! After reviewing your request, this appears to fall outside the scope of our current agreement.${scopeContext}

My rate for additional work of this type is [your rate]. I'd be happy to put together a quick proposal — shall I send one over, or would you prefer to hop on a brief call to discuss?

Best,
[Your name]`;

  return (
    <div className="ml-7 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
          Rate Card Reply Template
        </span>
        <button
          onClick={() => onCopy(outputId, template)}
          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {copied === outputId ? (
            <>
              <Check className="h-3 w-3" />
              Copied!
            </>
          ) : (
            <>
              <ClipboardCopy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap leading-relaxed font-sans">
        {template}
      </pre>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-muted-foreground/60">
          Tip: Fill in your rate and send via the Reply Composer below.
        </p>
        <button
          onClick={() => {
            onActionTaken();
            toast.success("Marked as actioned — alert won't re-fire.");
          }}
          className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
        >
          <Check className="h-3 w-3" />
          Outreach Sent
        </button>
      </div>
    </div>
  );
});

// ─── Crisis Recovery Panel ─────────────────────────────────────────────────────

const RecoveryTemplatePanel = memo(function RecoveryTemplatePanel({
  outputId,
  template,
  clientName,
  onCopy,
  copied,
  onActionTaken,
}: {
  outputId: string;
  template: string;
  clientName: string;
  onCopy: (id: string, text: string) => void;
  copied: string | null;
  onActionTaken: () => void;
}) {
  return (
    <div className="ml-7 rounded-lg border border-urgent/20 bg-urgent/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-bold text-urgent uppercase tracking-wider">
          Recovery Message — {clientName}
        </span>
        <button
          onClick={() => onCopy(outputId, template)}
          className="flex items-center gap-1 text-[10px] font-medium text-urgent hover:text-urgent/80 transition-colors"
        >
          {copied === outputId ? (
            <>
              <Check className="h-3 w-3" />
              Copied!
            </>
          ) : (
            <>
              <ClipboardCopy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap leading-relaxed font-sans">
        {template}
      </pre>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-muted-foreground/60">
          Send this via the Reply Composer to begin recovery. Speed matters — respond within the hour.
        </p>
        <button
          onClick={() => {
            onActionTaken();
            toast.success("Recovery outreach marked as sent.");
          }}
          className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
        >
          <Check className="h-3 w-3" />
          Outreach Sent
        </button>
      </div>
    </div>
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
