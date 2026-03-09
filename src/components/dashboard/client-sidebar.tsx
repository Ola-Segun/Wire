"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { clients as mockClients } from "@/data/mockData";
import type { HealthStatus } from "@/data/mockData";
import { healthColor, healthBg } from "@/lib/helpers";
import { AlertTriangle, Clock, Zap } from "lucide-react";

interface ClientSidebarProps {
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
}

export default function ClientSidebar({
  selectedClientId,
  onSelectClient,
}: ClientSidebarProps) {
  const pathname = usePathname();
  const convexClients = useQuery(api.clients.getByUser, { sortBy: "health" });

  // Use Convex clients if available, otherwise fall back to mock data
  const hasConvexClients = convexClients && convexClients.length > 0;

  const normalizedClients = hasConvexClients
    ? convexClients.map((c: Record<string, any>) => {
        const health = c.relationshipHealth ?? 50;
        const status: HealthStatus =
          health >= 70 ? "healthy" : health >= 40 ? "attention" : "at-risk";
        const initials = c.name
          .split(" ")
          .map((n: string) => n[0])
          .join("")
          .slice(0, 2);
        return {
          id: c._id as string,
          name: c.name as string,
          company: (c.company ?? "") as string,
          avatar: initials,
          healthScore: health,
          healthStatus: status,
          lastContact: c.lastContactDate
            ? formatTimeAgo(c.lastContactDate)
            : "—",
        };
      })
    : mockClients.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company,
        avatar: c.avatar,
        healthScore: c.healthScore,
        healthStatus: c.healthStatus,
        lastContact: c.lastContact,
      }));

  return (
    <div className="w-64 border-r border-border bg-sidebar h-full flex flex-col shrink-0">
      {/* Brand */}
      <div className="p-4 pb-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <h1 className="text-sm font-display font-semibold text-gradient">
            ClientPulse
          </h1>
        </Link>
      </div>

      {/* Section label */}
      <div className="px-3 pb-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-2">
          Clients
        </p>
      </div>

      {/* Client list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-0.5">
        {/* All Messages button */}
        <button
          onClick={() => onSelectClient(null)}
          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
            !selectedClientId
              ? "bg-accent text-accent-foreground font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          All Messages
        </button>

        {normalizedClients.map((client) => (
          <button
            key={client.id}
            onClick={() => onSelectClient(client.id)}
            className={`w-full text-left px-3 py-3 rounded-lg transition-all duration-150 group ${
              selectedClientId === client.id
                ? "bg-accent shadow-sm"
                : "hover:bg-sidebar-accent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${healthBg(client.healthStatus)} ${healthColor(client.healthStatus)} ring-1 ring-inset ring-current/10`}
              >
                {client.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[13px] font-medium text-foreground truncate">
                    {client.name}
                  </span>
                  {client.healthStatus === "at-risk" && (
                    <AlertTriangle className="w-3 h-3 text-urgent shrink-0 animate-pulse-glow" />
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground truncate block">
                  {client.company}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 pl-[46px]">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                <span className="text-[10px]">{client.lastContact}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-12 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      client.healthScore >= 75
                        ? "bg-success"
                        : client.healthScore >= 50
                          ? "bg-warning"
                          : "bg-urgent"
                    }`}
                    style={{ width: `${client.healthScore}%` }}
                  />
                </div>
                <span
                  className={`text-[10px] font-mono font-bold ${healthColor(client.healthStatus)}`}
                >
                  {client.healthScore}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
