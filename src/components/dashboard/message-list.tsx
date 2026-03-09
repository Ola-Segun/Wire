"use client";

import { channelIcon, priorityColor, sentimentLabel } from "@/lib/helpers";
import { CheckCircle2, Zap, Sparkles } from "lucide-react";

export interface MessageItem {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  subject: string;
  preview: string;
  channel: string;
  priority: string;
  sentiment: string;
  timestamp: string;
  isRead: boolean;
  hasActionItems: boolean;
  suggestedReply?: string;
}

interface MessageListProps {
  messages: MessageItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function MessageList({
  messages,
  selectedId,
  onSelect,
}: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      {messages.map((msg, index) => {
        const ChannelIcon = channelIcon(msg.channel as any);
        const sentiment = sentimentLabel(msg.sentiment as any);
        const isSelected = selectedId === msg.id;

        return (
          <button
            key={msg.id}
            onClick={() => onSelect(msg.id)}
            className={`w-full text-left px-4 py-4 border-b border-border/40 transition-all duration-150 relative group animate-slide-in ${
              isSelected ? "bg-accent/80" : "hover:bg-secondary/40"
            } ${!msg.isRead ? "bg-secondary/20" : ""}`}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <div
              className={`priority-bar ${priorityColor(msg.priority as any)}`}
            />

            <div className="flex items-start gap-3 pl-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                  !msg.isRead
                    ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {msg.clientAvatar}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[13px] font-medium truncate ${
                        !msg.isRead
                          ? "text-foreground"
                          : "text-secondary-foreground"
                      }`}
                    >
                      {msg.clientName}
                    </span>
                    {ChannelIcon && (
                      <ChannelIcon className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                    )}
                    {msg.priority === "critical" && (
                      <span className="flex items-center gap-0.5 text-[9px] font-mono font-bold text-urgent bg-urgent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        <Zap className="w-2.5 h-2.5" />
                        Urgent
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {msg.timestamp}
                  </span>
                </div>

                <p
                  className={`text-sm mt-1 truncate ${
                    !msg.isRead
                      ? "text-foreground font-medium"
                      : "text-secondary-foreground"
                  }`}
                >
                  {msg.subject}
                </p>

                <p className="text-xs text-muted-foreground mt-1 truncate leading-relaxed">
                  {msg.preview}
                </p>

                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {sentiment && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        msg.sentiment === "positive"
                          ? "bg-success/10 text-success"
                          : msg.sentiment === "negative"
                            ? "bg-urgent/10 text-urgent"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <span className="w-1 h-1 rounded-full bg-current" />
                      {sentiment.text}
                    </span>
                  )}
                  {msg.hasActionItems && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/8 px-2 py-0.5 rounded-full font-medium">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Action items
                    </span>
                  )}
                  {msg.suggestedReply && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-primary/60 font-mono">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI draft
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}

      {messages.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No messages found</p>
          <p className="text-xs mt-1 text-muted-foreground/60">
            Try adjusting your filters or search
          </p>
        </div>
      )}
    </div>
  );
}
