"use client";

import { dailyDigest } from "@/data/mockData";
import {
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowLeft,
} from "lucide-react";

interface DailyDigestProps {
  onBack?: () => void;
}

const DailyDigestView = ({ onBack }: DailyDigestProps) => {
  const digest = dailyDigest;

  return (
    <div className="p-5 space-y-5 animate-fade-in overflow-y-auto scrollbar-thin h-full">
      {/* Header */}
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
          <MessageSquare className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-lg font-display font-semibold text-foreground">
          Daily Digest
        </h2>
        <span className="text-xs font-mono text-muted-foreground ml-auto">
          {digest.date}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-raised rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-mono font-bold text-foreground">
              {digest.totalMessages}
            </p>
            <p className="text-[11px] text-muted-foreground">Messages</p>
          </div>
        </div>
        <div className="surface-raised rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-urgent/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-urgent" />
          </div>
          <div>
            <p className="text-2xl font-mono font-bold text-foreground">
              {digest.urgentCount}
            </p>
            <p className="text-[11px] text-muted-foreground">Urgent</p>
          </div>
        </div>
      </div>

      {/* Client Updates */}
      <div className="surface-raised rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Client Updates
        </h3>
        <div className="space-y-3">
          {digest.clientUpdates.map((update, i) => (
            <div
              key={i}
              className="flex gap-3 animate-slide-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground shrink-0 mt-0.5">
                {update.clientName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {update.clientName}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {update.summary}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Items */}
      <div className="surface-raised rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          Action Items
        </h3>
        <div className="space-y-2.5">
          {digest.actionItems.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors animate-slide-in"
              style={{ animationDelay: `${(i + 4) * 60}ms` }}
            >
              <div className="w-[18px] h-[18px] rounded-md border border-border mt-0.5 shrink-0 flex items-center justify-center hover:border-primary/40 transition-colors cursor-pointer" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{item.text}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {item.client}
                </p>
              </div>
              {item.deadline && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-warning shrink-0">
                  <Clock className="w-2.5 h-2.5" />
                  {item.deadline}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DailyDigestView;
