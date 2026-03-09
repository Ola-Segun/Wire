import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Health check endpoint for monitoring.
// Returns system status, DB connectivity, and key metrics.
export async function GET() {
  const start = Date.now();
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // Check Convex DB connectivity
  try {
    const dbStart = Date.now();
    const dlqItems = await convex.query(api.webhookReliability.getUnresolved, { limit: 1 });
    checks.database = {
      status: "healthy",
      latencyMs: Date.now() - dbStart,
    };

    // Report unresolved DLQ count as a metric
    if (dlqItems && dlqItems.length > 0) {
      checks.deadLetterQueue = {
        status: "warning",
        error: `${dlqItems.length}+ unresolved items in DLQ`,
      };
    } else {
      checks.deadLetterQueue = { status: "healthy" };
    }
  } catch (err) {
    checks.database = {
      status: "unhealthy",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      totalLatencyMs: Date.now() - start,
      checks,
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    },
    { status: allHealthy ? 200 : 503 }
  );
}
