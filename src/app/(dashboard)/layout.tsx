"use client";

import { useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { Authenticated } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/dashboard/bottom-nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useQuery(api.users.getCurrentUser);
  const touch = useMutation(api.users.touch);

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (user && !user.onboardingCompleted) {
      router.push("/onboarding/step-1");
    }
  }, [user, router]);

  // Presence tracking — depend only on user._id so the interval is set up once
  // per real user change, not on every query re-execution (which would re-call
  // touch() immediately and trigger a write→invalidation→re-render loop).
  useEffect(() => {
    if (!user?._id) return;
    touch();
    const id = setInterval(() => touch(), 5 * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]); // intentionally omit `touch` — it never changes identity

  return (
    <Authenticated>
      <div className="h-screen bg-background overflow-hidden">
        {/* Main content — full screen, pages handle their own scroll/layout */}
        <main className="h-full overflow-hidden">
          {children}
        </main>

        <BottomNav />
      </div>
    </Authenticated>
  );
}
