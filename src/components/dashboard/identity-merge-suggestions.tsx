"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, Mail, MessageSquare, GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  gmail: <Mail className="h-3.5 w-3.5 text-urgent" />,
  slack: <MessageSquare className="h-3.5 w-3.5 text-chart-4" />,
};

interface IdentityMergeSuggestionsProps {
  /** Optional className for the wrapping element */
  className?: string;
}

export function IdentityMergeSuggestions({ className }: IdentityMergeSuggestionsProps) {
  const proposals = useQuery(api.identityProposals.getAll, {});
  const acceptProposal = useMutation(api.identityProposals.accept);
  const rejectProposal = useMutation(api.identityProposals.reject);

  const [loading, setLoading] = useState<string | null>(null);

  if (!proposals || proposals.length === 0) return null;

  const handleAccept = async (proposalId: string) => {
    setLoading(proposalId);
    try {
      await acceptProposal({ proposalId: proposalId as any });
      toast.success("Identities merged");
    } catch {
      toast.error("Failed to merge");
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (proposalId: string) => {
    setLoading(proposalId);
    try {
      await rejectProposal({ proposalId: proposalId as any });
      toast.success("Suggestion dismissed");
    } catch {
      toast.error("Failed to dismiss");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`surface-raised rounded-xl p-5 ${className ?? ""}`}>
      <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2 mb-4">
        <GitMerge className="h-4 w-4 text-primary" />
        Contact Match Suggestions
        <Badge variant="secondary" className="text-[10px] font-mono ml-auto">
          {proposals.length}
        </Badge>
      </h3>
      <p className="text-[10px] text-muted-foreground mb-4">
        We found contacts across different platforms that may be the same person.
        Merging them unifies their message history under one client.
      </p>

      <div className="space-y-3">
        {proposals.map((proposal: Record<string, any>) => {
          const [primary, secondary] = proposal.identityDetails ?? [];
          if (!primary || !secondary) return null;

          const confidence = Math.round(proposal.confidence * 100);
          const isLoading = loading === proposal._id;

          return (
            <div
              key={proposal._id}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 bg-card"
            >
              {/* Primary identity */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  {PLATFORM_ICONS[primary.platform] ?? (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {primary.displayName}
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground truncate">
                    {primary.email ?? primary.username}
                  </div>
                </div>
              </div>

              {/* Match indicator */}
              <div className="flex flex-col items-center shrink-0">
                <GitMerge className="h-4 w-4 text-primary/60" />
                <span className="text-[9px] font-mono text-primary/60">{confidence}%</span>
              </div>

              {/* Secondary identity */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  {PLATFORM_ICONS[secondary.platform] ?? (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {secondary.displayName}
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground truncate">
                    {secondary.email ?? secondary.username}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-success hover:text-success hover:bg-success/10"
                      onClick={() => handleAccept(proposal._id)}
                      title="Accept — merge these contacts"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-urgent hover:bg-urgent/10"
                      onClick={() => handleReject(proposal._id)}
                      title="Dismiss — not the same person"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
