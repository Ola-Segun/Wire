"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Users, Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/date-utils";
import Link from "next/link";
import { toast } from "sonner";

export default function ClientsPage() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const activeClients = useQuery(api.clients.getByUser, { sortBy: "recent" });
  const archivedClients = useQuery(api.clients.getArchived);
  const unarchive = useMutation(api.clients.unarchive);

  const handleRestore = async (e: React.MouseEvent, clientId: string, name: string) => {
    e.preventDefault(); // don't navigate to client detail
    setRestoringId(clientId);
    try {
      await unarchive({ id: clientId as any });
      toast.success(`${name} restored`);
    } catch {
      toast.error("Failed to restore client");
    } finally {
      setRestoringId(null);
    }
  };

  const clients = tab === "active" ? activeClients : archivedClients;
  const archivedCount = archivedClients?.length ?? 0;

  return (
    <div className="max-w-6xl mx-auto p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">
            Clients
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tab === "active"
              ? `${activeClients?.length ?? 0} active clients`
              : `${archivedCount} archived client${archivedCount !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Active / Archived tabs */}
        <div className="flex items-center gap-1 bg-secondary/60 rounded-lg p-0.5">
          <button
            onClick={() => setTab("active")}
            className={`px-3 py-1.5 rounded-md text-[10px] font-medium transition-all ${
              tab === "active"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setTab("archived")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium transition-all ${
              tab === "archived"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Archive className="h-3 w-3" />
            Archived
            {archivedCount > 0 && (
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                  tab === "archived"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted-foreground/20 text-muted-foreground"
                }`}
              >
                {archivedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {clients && clients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {clients.map((client: Record<string, any>, index: number) => {
            const health = client.relationshipHealth ?? 50;
            const status =
              health >= 70
                ? "healthy"
                : health >= 40
                  ? "attention"
                  : "at-risk";
            const isArchived = client.isArchived;

            return (
              <Link
                key={client._id}
                href={`/clients/${client._id}`}
                className={`relative p-5 rounded-xl block animate-slide-in transition-all ${
                  isArchived
                    ? "border border-border/30 bg-card opacity-70 hover:opacity-100"
                    : "glass-hover"
                }`}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {/* Archived badge */}
                {isArchived && (
                  <div className="absolute top-3 right-3">
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-border text-muted-foreground/60">
                      archived
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold ${
                      isArchived
                        ? "bg-muted text-muted-foreground"
                        : status === "healthy"
                          ? "bg-success/10 text-success"
                          : status === "attention"
                            ? "bg-warning/10 text-warning"
                            : "bg-urgent/10 text-urgent"
                    } ${!isArchived && status === "at-risk" ? "animate-pulse-glow" : ""}`}
                  >
                    {client.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0 pr-8">
                    <div className="text-sm font-display font-semibold text-foreground truncate">
                      {client.name}
                    </div>
                    {client.company && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {client.company}
                      </div>
                    )}
                  </div>
                </div>

                {/* Health bar — only for active */}
                {!isArchived && health > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-muted-foreground font-mono">Health</span>
                      <span
                        className={`font-mono font-bold ${
                          status === "healthy"
                            ? "text-success"
                            : status === "attention"
                              ? "text-warning"
                              : "text-urgent"
                        }`}
                      >
                        {health}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-border/30">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          status === "healthy"
                            ? "bg-success"
                            : status === "attention"
                              ? "bg-warning"
                              : "bg-urgent"
                        }`}
                        style={{ width: `${health}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border/20">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {client.totalMessages} messages
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {client.lastContactDate
                      ? formatRelativeTime(client.lastContactDate)
                      : "No messages"}
                  </span>
                </div>

                {client.connectedPlatforms && client.connectedPlatforms.length > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {client.connectedPlatforms.map((p: string) => (
                      <Badge
                        key={p}
                        variant="secondary"
                        className="text-[8px] font-mono bg-secondary/60 text-muted-foreground px-1.5 py-0"
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Restore button — archived tab only */}
                {isArchived && (
                  <button
                    onClick={(e) => handleRestore(e, client._id, client.name)}
                    disabled={restoringId === client._id}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {restoringId === client._id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArchiveRestore className="h-3 w-3" />
                    )}
                    Restore client
                  </button>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          {tab === "archived" ? (
            <>
              <Archive className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
              <p className="font-display">No archived clients</p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                Archived clients will appear here
              </p>
            </>
          ) : (
            <>
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
              <p className="font-display">No clients yet</p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                Connect a platform to start tracking client communications
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
