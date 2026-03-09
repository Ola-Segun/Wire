"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";

const STEPS = [
  { number: 1, label: "Connect Gmail", path: "/onboarding/step-1" },
  { number: 2, label: "Select Contacts", path: "/onboarding/step-2" },
  { number: 3, label: "Connect Slack", path: "/onboarding/step-3" },
  { number: 4, label: "Match Identities", path: "/onboarding/step-4" },
  { number: 5, label: "Finish Setup", path: "/onboarding/step-5" },
];

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  const onboardingState = useQuery(api.onboarding.state.get);
  const initOnboarding = useMutation(api.onboarding.state.init);
  const hasInitialized = useRef(false);

  // Redirect if onboarding is already completed
  useEffect(() => {
    if (user && user.onboardingCompleted) {
      router.push("/dashboard");
    }
  }, [user, router]);

  // Auto-init onboarding state if it doesn't exist
  useEffect(() => {
    if (user && onboardingState === null && !hasInitialized.current) {
      hasInitialized.current = true;
      initOnboarding().catch(console.error);
    }
  }, [user, onboardingState, initOnboarding]);

  if (isLoading || onboardingState === undefined || onboardingState === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const currentStepNumber = onboardingState?.currentStep ?? 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="text-lg font-display font-bold text-gradient">
            Wire
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            Step {currentStepNumber} of 5
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="max-w-4xl mx-auto px-8 pt-6">
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((step) => {
            const isCompleted =
              onboardingState?.completedSteps?.includes(step.number);
            const isCurrent = pathname === step.path;
            return (
              <div
                key={step.number}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div
                  className={`h-1.5 w-full rounded-full transition-all ${
                    isCompleted
                      ? "bg-success"
                      : isCurrent
                        ? "bg-primary glow-primary"
                        : "bg-border/30"
                  }`}
                />
                <span
                  className={`text-[10px] font-mono ${
                    isCurrent
                      ? "text-primary font-bold"
                      : isCompleted
                        ? "text-success"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-8 pb-12 animate-fade-in">
        {children}
      </div>
    </div>
  );
}
