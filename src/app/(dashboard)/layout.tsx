"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Authenticated } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { CommandPalette } from "@/components/dashboard/command-palette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user   = useQuery(api.users.getCurrentUser);
  const touch  = useMutation(api.users.touch);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const openCommandPalette  = useCallback(() => setCommandPaletteOpen(true),  []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (user && !user.onboardingCompleted) {
      router.push("/onboarding/step-1");
    }
  }, [user, router]);

  // Presence tracking — depend only on user._id so the interval is set up once
  useEffect(() => {
    if (!user?._id) return;
    touch();
    const id = setInterval(() => touch(), 5 * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  // Listen for child-page requests to open the command palette.
  // Pages can't directly call setCommandPaletteOpen (different scope),
  // so they dispatch a custom event that the layout catches here.
  useEffect(() => {
    const handler = () => setCommandPaletteOpen(true);
    window.addEventListener("wire:open-command-palette", handler);
    return () => window.removeEventListener("wire:open-command-palette", handler);
  }, []);

  return (
    <Authenticated>
      <div className="h-screen bg-background overflow-hidden">
        {/* Main content */}
        <main className="h-full overflow-hidden">
          {children}
        </main>

        {/* Global bottom navigation — also owns ⌘K + bell */}
        <BottomNav onOpenCommandPalette={openCommandPalette} />

        {/* Global command palette — mounted once, controlled by layout */}
        <CommandPalette
          open={commandPaletteOpen}
          onClose={closeCommandPalette}
        />
      </div>
    </Authenticated>
  );
}
