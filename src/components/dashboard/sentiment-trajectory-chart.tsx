"use client";

import { memo, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatMessageTime } from "@/lib/date-utils";

// ─── Sentiment scoring ────────────────────────────────────────────────────────
// Maps raw sentiment strings (from unified AI analysis) to a -1 → +1 scale.
// Neutral is 0; scores above/below influence chart colour and trend line.

const SENTIMENT_SCORE: Record<string, number> = {
  positive: 1,
  satisfied: 0.75,
  neutral: 0,
  concerned: -0.35,
  frustrated: -0.7,
  negative: -0.75,
  angry: -1,
};

function toScore(sentiment: string): number {
  return SENTIMENT_SCORE[sentiment.toLowerCase()] ?? 0;
}

// Map a score to a Tailwind-compatible hex colour for the dot / tooltip
function scoreToColor(score: number): string {
  if (score >= 0.5) return "#22c55e";  // success green
  if (score >= 0)   return "#6b7280";  // muted gray (neutral)
  if (score >= -0.5) return "#f59e0b"; // warning amber
  return "#ef4444";                     // urgent red
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SentimentPoint {
  timestamp: number;
  sentiment: string;
  preview?: string;
}

interface ChartDataPoint {
  timestamp: number;
  score: number;
  sentiment: string;
  preview: string;
  label: string; // formatted time for X-axis
  color: string;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = memo(function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ChartDataPoint = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-xs max-w-[200px]">
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: d.color }}
        />
        <span className="font-medium capitalize text-foreground">{d.sentiment}</span>
        <span className="text-muted-foreground ml-auto">{d.label}</span>
      </div>
      {d.preview && (
        <p className="text-muted-foreground leading-snug line-clamp-2">{d.preview}</p>
      )}
    </div>
  );
});

// ─── Trend badge ──────────────────────────────────────────────────────────────

const TrendBadge = memo(function TrendBadge({
  trend,
}: {
  trend: "improving" | "declining" | "stable";
}) {
  const map = {
    improving: { Icon: TrendingUp, className: "text-success bg-success/10", label: "Improving" },
    declining:  { Icon: TrendingDown, className: "text-urgent bg-urgent/10", label: "Declining" },
    stable:     { Icon: Minus, className: "text-muted-foreground bg-muted", label: "Stable" },
  } as const;
  const { Icon, className, label } = map[trend];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${className}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

interface SentimentTrajectoryChartProps {
  data: SentimentPoint[];
  /** Pre-computed trend from client.intelligence (0-cost, no re-calculation) */
  intelligenceTrend?: string;
  /** Height of the chart area in px */
  height?: number;
  /** Show the X-axis time labels */
  showXAxis?: boolean;
  className?: string;
}

export const SentimentTrajectoryChart = memo(function SentimentTrajectoryChart({
  data,
  intelligenceTrend,
  height = 120,
  showXAxis = true,
  className,
}: SentimentTrajectoryChartProps) {
  // Transform raw sentiment points into chart data — memoised to avoid
  // re-running the map on every parent re-render.
  const chartData = useMemo<ChartDataPoint[]>(() => {
    return data.map((p) => ({
      timestamp: p.timestamp,
      score: toScore(p.sentiment),
      sentiment: p.sentiment,
      preview: p.preview ?? "",
      label: formatMessageTime(p.timestamp),
      color: scoreToColor(toScore(p.sentiment)),
    }));
  }, [data]);

  // Derive trend from chart data if intelligence trend not provided
  const trend = useMemo<"improving" | "declining" | "stable">(() => {
    if (intelligenceTrend === "improving") return "improving";
    if (intelligenceTrend === "declining") return "declining";
    if (intelligenceTrend === "stable") return "stable";
    if (chartData.length < 4) return "stable";
    const mid = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, mid).reduce((a, b) => a + b.score, 0) / mid;
    const secondHalf = chartData.slice(mid).reduce((a, b) => a + b.score, 0) / (chartData.length - mid);
    const delta = secondHalf - firstHalf;
    if (delta > 0.15) return "improving";
    if (delta < -0.15) return "declining";
    return "stable";
  }, [chartData, intelligenceTrend]);

  // Gradient id must be unique per instance if multiple charts render on
  // the same page — use trend as a stable suffix (good enough).
  const gradientId = `sentiment-grad-${trend}`;

  if (chartData.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-muted-foreground text-xs ${className ?? ""}`}
        style={{ height }}
      >
        No sentiment data yet
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Trend badge + message count */}
      <div className="flex items-center justify-between mb-2">
        <TrendBadge trend={trend} />
        <span className="text-[10px] font-mono text-muted-foreground">
          {chartData.length} data point{chartData.length !== 1 ? "s" : ""}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "#6b7280"}
                stopOpacity={0.18}
              />
              <stop offset="95%" stopColor="transparent" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Zero baseline (neutral) */}
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeWidth={1} />

          {showXAxis && (
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
          )}

          <YAxis domain={[-1.1, 1.1]} hide />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />

          <Area
            type="monotone"
            dataKey="score"
            stroke={
              trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "#6b7280"
            }
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              return (
                <circle
                  key={payload.timestamp}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={payload.color}
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 5, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
