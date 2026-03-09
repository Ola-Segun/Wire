"use client";

import {
  clients as mockClients,
  messages as mockMessages,
} from "@/data/mockData";
import type { Client } from "@/data/mockData";
import { healthColor, healthBg } from "@/lib/helpers";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  ArrowLeft,
  Activity,
} from "lucide-react";

interface TimelineEntry {
  date: string;
  healthScore: number;
  messageCount: number;
  sentiment: "positive" | "neutral" | "negative";
  highlight?: string;
}

const generateTimeline = (client: Client): TimelineEntry[] => {
  const clientMessages = mockMessages.filter((m) => m.clientId === client.id);
  const base = client.healthScore;
  return [
    {
      date: "6 weeks ago",
      healthScore: Math.min(100, base + 8),
      messageCount: 3,
      sentiment: "positive",
      highlight: "Kickoff meeting went great",
    },
    {
      date: "5 weeks ago",
      healthScore: Math.min(100, base + 5),
      messageCount: 2,
      sentiment: "positive",
    },
    {
      date: "4 weeks ago",
      healthScore: Math.min(100, base + 2),
      messageCount: 4,
      sentiment: "neutral",
      highlight: "Scope change discussed",
    },
    {
      date: "3 weeks ago",
      healthScore: Math.max(0, base - 5),
      messageCount: 1,
      sentiment: "neutral",
    },
    {
      date: "2 weeks ago",
      healthScore: Math.max(0, base - 10),
      messageCount: 0,
      sentiment: "negative",
      highlight: "No response for 5 days",
    },
    {
      date: "Last week",
      healthScore: Math.max(0, base - 3),
      messageCount: 2,
      sentiment: "neutral",
    },
    {
      date: "This week",
      healthScore: base,
      messageCount: clientMessages.length,
      sentiment: clientMessages[0]?.sentiment || "neutral",
      highlight: clientMessages[0]?.subject,
    },
  ];
};

interface RelationshipTimelineProps {
  clientId: string | null;
  onBack?: () => void;
}

const RelationshipTimeline = ({
  clientId,
  onBack,
}: RelationshipTimelineProps) => {
  const selectedClient = clientId
    ? mockClients.find((c) => c.id === clientId)
    : null;
  const displayClients = selectedClient ? [selectedClient] : mockClients;

  return (
    <div className="p-5 space-y-5 animate-fade-in overflow-y-auto scrollbar-thin h-full">
      <div className="flex items-center gap-2.5">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors md:hidden"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-lg font-display font-semibold text-foreground">
          Relationship Timeline
        </h2>
      </div>

      {displayClients.map((client) => {
        const timeline = generateTimeline(client);
        const maxScore = Math.max(...timeline.map((t) => t.healthScore));
        const minScore = Math.min(...timeline.map((t) => t.healthScore));
        const trend =
          timeline[timeline.length - 1].healthScore -
          timeline[timeline.length - 2].healthScore;

        return (
          <div key={client.id} className="surface-raised rounded-xl p-5 space-y-4">
            {/* Client header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${healthBg(client.healthStatus)} ${healthColor(client.healthStatus)} ring-1 ring-inset ring-current/10`}
                >
                  {client.avatar}
                </div>
                <div>
                  <p className="text-[14px] font-display font-semibold text-foreground">
                    {client.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {client.company}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg ${
                    trend > 0
                      ? "bg-success/10"
                      : trend < 0
                        ? "bg-urgent/10"
                        : "bg-muted"
                  }`}
                >
                  {trend > 0 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-success" />
                  ) : trend < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-urgent" />
                  ) : (
                    <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span
                    className={`text-sm font-mono font-bold ${healthColor(client.healthStatus)}`}
                  >
                    {client.healthScore}
                  </span>
                </div>
              </div>
            </div>

            {/* Mini bar chart */}
            <div className="flex items-end gap-1.5 h-20 px-1">
              {timeline.map((entry, i) => {
                const height =
                  ((entry.healthScore - minScore + 10) /
                    (maxScore - minScore + 20)) *
                  100;
                const barColor =
                  entry.healthScore >= 75
                    ? "bg-success"
                    : entry.healthScore >= 50
                      ? "bg-warning"
                      : "bg-urgent";
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1 group relative"
                  >
                    <div
                      className={`w-full rounded-md ${barColor} transition-all duration-300 min-h-[4px] opacity-60 group-hover:opacity-100 group-hover:shadow-lg`}
                      style={{ height: `${height}%` }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                      <div className="glass rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap shadow-xl">
                        <p className="font-mono font-bold text-foreground">
                          {entry.healthScore}
                        </p>
                        <p className="text-muted-foreground">{entry.date}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Date labels */}
            <div className="flex gap-1.5 px-1">
              {timeline.map((entry, i) => (
                <div key={i} className="flex-1 text-center">
                  <span className="text-[8px] font-mono text-muted-foreground/60 leading-none hidden sm:inline">
                    {entry.date
                      .replace(" weeks ago", "w")
                      .replace("Last week", "1w")
                      .replace("This week", "Now")}
                  </span>
                </div>
              ))}
            </div>

            {/* Key events */}
            <div className="space-y-2 pt-3 border-t border-border/30">
              {timeline
                .filter((e) => e.highlight)
                .slice(-3)
                .map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 text-[11px] group"
                  >
                    <div className="w-5 h-5 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <MessageSquare className="w-2.5 h-2.5 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground font-mono shrink-0">
                      {entry.date}
                    </span>
                    <span className="text-secondary-foreground truncate group-hover:text-foreground transition-colors">
                      {entry.highlight}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RelationshipTimeline;
