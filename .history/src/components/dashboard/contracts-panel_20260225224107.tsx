"use client";

import { useState, memo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Calendar,
  DollarSign,
} from "lucide-react";

interface ContractsPanelProps {
  clientId: string;
}

export const ContractsPanel = memo(function ContractsPanel({
  clientId,
}: ContractsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [expandedContract, setExpandedContract] = useState<string | null>(null);

  const contracts = useQuery(api.contracts.getByClient, {
    clientId: clientId as any,
  });

  if (!contracts) return null;

  const active = contracts.filter((c) => c.status === "active");
  const completed = contracts.filter((c) => c.status === "completed");

  return (
    <div className="surface-raised rounded-xl p-5">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Contracts & SOWs
          {active.length > 0 && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {active.length} active
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
          {active.length === 0 && completed.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No contracts recorded yet. Add contracts to enable scope creep detection.
            </p>
          )}

          {[...active, ...completed].map((contract) => {
            const isExpanded = expandedContract === contract._id;
            const isActive = contract.status === "active";
            const now = Date.now();
            const isExpiring =
              isActive && contract.endDate && contract.endDate - now < 30 * 24 * 60 * 60 * 1000;

            return (
              <div
                key={contract._id}
                className={`rounded-lg border transition-all ${
                  isActive
                    ? isExpiring
                      ? "border-warning/30 bg-warning/5"
                      : "border-border/30 bg-card"
                    : "border-border/20 bg-muted/30 opacity-70"
                }`}
              >
                <button
                  className="w-full flex items-center gap-3 p-3 text-left"
                  onClick={() =>
                    setExpandedContract(isExpanded ? null : contract._id)
                  }
                >
                  <FileText
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {contract.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span
                        className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${
                          isActive
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {contract.status}
                      </span>
                      {contract.value && (
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-0.5">
                          <DollarSign className="h-2.5 w-2.5" />
                          {contract.value.toLocaleString()}{" "}
                          {contract.currency ?? "USD"}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border/20 pt-3">
                    {contract.description && (
                      <p className="text-xs text-foreground/70">
                        {contract.description}
                      </p>
                    )}

                    {/* Dates */}
                    {(contract.startDate || contract.endDate) && (
                      <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {contract.startDate && (
                          <span>
                            Start:{" "}
                            {new Date(contract.startDate).toLocaleDateString()}
                          </span>
                        )}
                        {contract.endDate && (
                          <span
                            className={isExpiring ? "text-warning font-bold" : ""}
                          >
                            End:{" "}
                            {new Date(contract.endDate).toLocaleDateString()}
                            {isExpiring && " (expiring soon)"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Deliverables */}
                    {contract.deliverables && contract.deliverables.length > 0 && (
                      <div>
                        <p className="text-[10px] font-mono text-muted-foreground font-medium mb-1.5">
                          Deliverables
                        </p>
                        <div className="space-y-1">
                          {contract.deliverables.map(
                            (d: string, i: number) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-xs text-foreground/80"
                              >
                                <CheckCircle2 className="h-3 w-3 text-success mt-0.5 shrink-0" />
                                {d}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
