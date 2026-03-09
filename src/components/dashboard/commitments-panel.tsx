"use client";

import { useState, memo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  deadline: { label: "Deadline", color: "text-urgent bg-urgent/10" },
  deliverable: { label: "Deliverable", color: "text-primary bg-primary/10" },
  payment: { label: "Payment", color: "text-success bg-success/10" },
  meeting: { label: "Meeting", color: "text-chart-4 bg-chart-4/10" },
};

interface CommitmentsPanelProps {
  clientId: string;
}

export const CommitmentsPanel = memo(function CommitmentsPanel({
  clientId,
}: CommitmentsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const commitments = useQuery(api.commitments.getByClient, {
    clientId: clientId as any,
  });
  const completeMutation = useMutation(api.commitments.complete);
  const cancelMutation = useMutation(api.commitments.cancel);

  const handleComplete = async (id: string) => {
    setActioningId(id);
    try {
      await completeMutation({ id: id as any });
    } catch (err) {
      console.error("Complete commitment failed:", err);
    } finally {
      setActioningId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setActioningId(id);
    try {
      await cancelMutation({ id: id as any });
    } catch (err) {
      console.error("Cancel commitment failed:", err);
    } finally {
      setActioningId(null);
    }
  };

  if (!commitments) return null;

  const pending = commitments.filter((c) => c.status === "pending");
  const completed = commitments.filter((c) => c.status === "completed");
  const now = Date.now();

  return (
    <div className="surface-raised rounded-xl p-5">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          Commitments
          {pending.length > 0 && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning">
              {pending.length} pending
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
          {pending.length === 0 && completed.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No commitments tracked yet. AI will extract them from conversations.
            </p>
          )}

          {pending.map((c) => {
            const isOverdue = c.dueDate ? c.dueDate < now : false;
            const typeInfo = TYPE_LABELS[c.type] ?? {
              label: c.type,
              color: "text-muted-foreground bg-muted",
            };

            return (
              <div
                key={c._id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                  isOverdue
                    ? "border-urgent/30 bg-urgent/5"
                    : "border-border/30 bg-card"
                }`}
              >
                <Clock
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    isOverdue ? "text-urgent" : "text-warning"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">
                    {c.text}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${typeInfo.color}`}
                    >
                      {typeInfo.label}
                    </span>
                    {c.dueDate && (
                      <span
                        className={`text-[10px] font-mono ${
                          isOverdue
                            ? "text-urgent font-bold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isOverdue && (
                          <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5" />
                        )}
                        Due {new Date(c.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {(c as any).sourceMessageText && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-snug line-clamp-2 border-l border-border/40 pl-2 italic">
                      "{(c as any).sourceMessageText}"
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    title="Mark complete"
                    disabled={actioningId === c._id}
                    onClick={() => handleComplete(c._id)}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-success/10 text-muted-foreground hover:text-success transition-colors disabled:opacity-50"
                  >
                    {actioningId === c._id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    title="Cancel"
                    disabled={actioningId === c._id}
                    onClick={() => handleCancel(c._id)}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-urgent/10 text-muted-foreground hover:text-urgent transition-colors disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Completed items — collapsed summary */}
          {completed.length > 0 && (
            <div className="pt-2 border-t border-border/20">
              <p className="text-[10px] font-mono text-muted-foreground/60">
                {completed.length} completed
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
