"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Archive,
  ArchiveRestore,
  Loader2,
  Search,
  X,
  UserPlus,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/lib/date-utils";
import Link from "next/link";
import { toast } from "sonner";

// ── Skeleton ─────────────────────────────────────────────────────────────────

function ClientsSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/30">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-20 bg-muted/60 rounded-lg animate-pulse" />
            <div className="h-3 w-28 bg-muted/40 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-40 bg-muted/30 rounded-xl animate-pulse hidden sm:block" />
            <div className="h-8 w-36 bg-muted/40 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex-1 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 8].map((i) => (
            <div key={i} className="surface-raised rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-muted/50 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
                  <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-1.5 w-full bg-muted/40 rounded-full animate-pulse mb-3" />
              <div className="flex justify-between pt-2 border-t border-border/20">
                <div className="h-3 w-20 bg-muted/30 rounded animate-pulse" />
                <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "health" | "name">("recent");

  const activeClients = useQuery(api.clients.getByUser, {
    sortBy: "recent", // Fetch once, sort strictly client-side to prevent skeleton flashes
  });
  const archivedClients = useQuery(api.clients.getArchived);
  const unarchive = useMutation(api.clients.unarchive);

  const handleRestore = async (
    e: React.MouseEvent,
    clientId: string,
    name: string
  ) => {
    e.preventDefault();
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

  // Show skeleton only on first load
  if (activeClients === undefined) return <ClientsSkeleton />;

  const rawClients = tab === "active" ? activeClients : (archivedClients ?? []);
  const archivedCount = archivedClients?.length ?? 0;

  // Apply search filter
  const searchFiltered = search
    ? rawClients.filter(
        (c: any) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
      )
    : rawClients;

  // Apply client-side sort
  const clients = [...searchFiltered].sort((a: any, b: any) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "health") return (a.relationshipHealth ?? 50) - (b.relationshipHealth ?? 50); // at-risk first
    if (sortBy === "recent") return b.lastContactDate - a.lastContactDate; // newest first
    return 0;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Clients</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tab === "active"
                ? `${activeClients.length} active client${activeClients.length !== 1 ? "s" : ""}`
                : `${archivedCount} archived client${archivedCount !== 1 ? "s" : ""}`}
              {search && clients.length !== rawClients.length && (
                <span className="text-primary ml-1">
                  · {clients.length} matched
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Sort dropdown */}
            {tab === "active" && (
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="h-8 w-36 text-xs rounded-xl">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recent</SelectItem>
                  <SelectItem value="health">At-risk first</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
            )}
            {/* Search — desktop */}
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 pr-3 rounded-xl border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors w-44"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                </button>
              )}
            </div>

            {/* Tab switcher */}
            <div className="relative flex items-center bg-secondary/60 rounded-xl p-1 gap-0.5">
              {(["active", "archived"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors z-10 ${
                    tab === t ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === t && (
                    <motion.div
                      layoutId="clients-tab-pill"
                      className="absolute inset-0 bg-primary rounded-lg"
                      transition={{ type: "spring", stiffness: 300, damping: 26 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {t === "archived" && <Archive className="h-3 w-3" />}
                    {t === "active" ? "Active" : "Archived"}
                    {t === "archived" && archivedCount > 0 && (
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                          tab === "archived"
                            ? "bg-white/20"
                            : "bg-muted-foreground/20 text-muted-foreground"
                        }`}
                      >
                        {archivedCount}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search — mobile */}
        <div className="relative sm:hidden mt-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-xl border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 pb-28">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {clients.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {clients.map((client: Record<string, any>, index: number) => {
                  const health = client.relationshipHealth ?? 50;
                  const status =
                    health >= 70 ? "healthy" : health >= 40 ? "attention" : "at-risk";
                  const isArchived = client.isArchived;

                  return (
                    <Link
                      key={client._id}
                      href={`/clients/${client._id}`}
                      className={`relative p-5 rounded-xl block transition-all animate-slide-in ${
                        isArchived
                          ? "border border-border/30 bg-card opacity-70 hover:opacity-100"
                          : "glass-hover"
                      }`}
                      style={{ animationDelay: `${index * 30}ms` }}
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
                          className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
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
                        <div className="flex-1 min-w-0 pr-6">
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

                      {/* Health bar */}
                      {!isArchived && health > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="text-muted-foreground font-mono">Health</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`font-mono font-bold cursor-help ${
                                    status === "healthy"
                                      ? "text-success"
                                      : status === "attention"
                                        ? "text-warning"
                                        : "text-urgent"
                                  }`}
                                >
                                  {health}%
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Relationship health score {health}/100 — based on response time, sentiment trend, and recency of contact</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-border/30 overflow-hidden">
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
                          {client.totalMessages} msg
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {client.lastContactDate
                            ? formatRelativeTime(client.lastContactDate)
                            : "No messages"}
                        </span>
                      </div>

                      {client.connectedPlatforms && client.connectedPlatforms.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
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

                      {/* Restore button */}
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
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                  {tab === "archived" ? (
                    <Archive className="h-8 w-8 text-muted-foreground/30" />
                  ) : search ? (
                    <Search className="h-8 w-8 text-muted-foreground/30" />
                  ) : (
                    <UserPlus className="h-8 w-8 text-muted-foreground/30" />
                  )}
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {search
                    ? "No clients matched your search"
                    : tab === "archived"
                      ? "No archived clients"
                      : "No clients yet"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {search
                    ? "Try a different name or company"
                    : tab === "archived"
                      ? "Archived clients will appear here"
                      : "Connect a platform to start tracking client communications"}
                </p>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="mt-4 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
