"use client";

import { memo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  Bell,
} from "lucide-react";

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

  const outputs = useQuery(api.skills.getOutputs, {
    clientId: clientId as any,
    limit: 10,
  });
  const dismiss = useMutation(api.skills.dismissOutput);
  const markRead = useMutation(api.skills.markOutputRead);

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
            return (
              <div
                key={output._id}
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
                  <p className="text-[10px] font-mono text-muted-foreground/50 mt-1">
                    {formatTimeAgo(output.createdAt)}
                  </p>
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
            );
          })}
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
