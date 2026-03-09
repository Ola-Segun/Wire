"use client";

import { useState } from "react";
import { channelIcon, sentimentLabel, priorityColor } from "@/lib/helpers";
import {
  Sparkles,
  CheckCircle2,
  Send,
  Copy,
  X,
  ArrowRight,
} from "lucide-react";

export interface ThreadMessage {
  id: string;
  clientName: string;
  clientAvatar: string;
  subject: string;
  fullContent: string;
  channel: string;
  priority: string;
  sentiment: string;
  timestamp: string;
  actionItems?: string[];
  suggestedReply?: string;
}

interface ThreadViewProps {
  message: ThreadMessage;
  onClose: () => void;
}

export default function ThreadView({ message, onClose }: ThreadViewProps) {
  const [showDraft, setShowDraft] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const ChannelIcon = channelIcon(message.channel as any);
  const sentiment = sentimentLabel(message.sentiment as any);

  const toggleItem = (i: number) => {
    const next = new Set(checkedItems);
    next.has(i) ? next.delete(i) : next.add(i);
    setCheckedItems(next);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary ring-1 ring-primary/20">
            {message.clientAvatar}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-display font-semibold text-foreground truncate">
              {message.subject}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground font-medium">
                {message.clientName}
              </span>
              <span className="w-1 h-1 rounded-full bg-border" />
              {ChannelIcon && (
                <ChannelIcon className="w-3 h-3 text-muted-foreground/60" />
              )}
              <span className="text-[10px] font-mono text-muted-foreground">
                {message.timestamp}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Meta badges */}
      <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2.5 flex-wrap">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-md ${
            message.priority === "critical"
              ? "bg-urgent/10 text-urgent"
              : message.priority === "high"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${priorityColor(message.priority as any)}`}
          />
          {message.priority}
        </span>
        {sentiment && (
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-md ${
              message.sentiment === "positive"
                ? "bg-success/10 text-success"
                : message.sentiment === "negative"
                  ? "bg-urgent/10 text-urgent"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {sentiment.text}
          </span>
        )}
        {message.sentiment === "negative" && (
          <span className="text-[10px] bg-urgent/10 text-urgent px-2.5 py-1 rounded-md font-medium">
            Client may be frustrated
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
        <div className="surface-raised rounded-xl p-5">
          <p className="text-sm text-foreground/90 leading-[1.8]">
            {message.fullContent}
          </p>
        </div>

        {/* Action Items */}
        {message.actionItems && message.actionItems.length > 0 && (
          <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-xs font-display font-semibold text-primary">
                Action Items
              </span>
              <span className="text-[10px] font-mono text-primary/50 ml-auto">
                {checkedItems.size}/{message.actionItems.length}
              </span>
            </div>
            <ul className="space-y-2.5">
              {message.actionItems.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 group cursor-pointer"
                  onClick={() => toggleItem(i)}
                >
                  <div
                    className={`w-[18px] h-[18px] rounded-md border mt-0.5 shrink-0 flex items-center justify-center transition-all ${
                      checkedItems.has(i)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {checkedItems.has(i) && (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                  </div>
                  <span
                    className={`text-sm transition-all ${
                      checkedItems.has(i)
                        ? "text-muted-foreground line-through"
                        : "text-foreground"
                    }`}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Draft */}
        {message.suggestedReply && (
          <div>
            {!showDraft ? (
              <button
                onClick={() => setShowDraft(true)}
                className="flex items-center gap-2.5 text-sm text-primary hover:text-primary/80 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:glow-primary transition-all">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="font-medium">View AI-drafted response</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ) : (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 animate-slide-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-xs font-display font-semibold text-primary">
                      AI-Drafted Reply
                    </span>
                  </div>
                  <button
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                    title="Copy"
                  >
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-sm text-foreground/85 leading-[1.8]">
                  {message.suggestedReply}
                </p>
                <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-border/50">
                  <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all glow-primary">
                    <Send className="w-3.5 h-3.5" />
                    Send Reply
                  </button>
                  <button className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all font-medium">
                    Edit first
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
