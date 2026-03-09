"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { Authenticated } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import SmartSearch from "@/components/dashboard/smart-search";
import ThemeToggle from "@/components/dashboard/theme-toggle";
import { Menu } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const touch = useMutation(api.users.touch);

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (user && !user.onboardingCompleted) {
      router.push("/onboarding/step-1");
    }
  }, [user, router]);

  // Presence tracking: stamp lastActiveAt on mount and every 5 minutes.
  // The cron orchestrator reads this to decide whether to sync this user.
  // Running in the dashboard layout means it covers all dashboard routes.
  useEffect(() => {
    if (!user) return;
    touch();
    const id = setInterval(() => touch(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user, touch]);

  return (
    <Authenticated>
      <div className="flex h-screen bg-background">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-14 border-b border-border/40 flex items-center gap-3 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-accent transition-colors md:hidden"
            >
              <Menu className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="flex-1 max-w-md">
              <SmartSearch onSearch={() => {}} />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            {children}
          </main>
        </div>
      </div>
    </Authenticated>
  );
}
