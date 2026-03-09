"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="text-center max-w-md mx-auto px-4">
        <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-slate-600 mb-6 text-sm">
          An error occurred while loading this page.
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={reset}>Try Again</Button>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
