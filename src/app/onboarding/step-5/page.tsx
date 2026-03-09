"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Mail,
  MessageSquare,
  Users,
  Loader2,
  Sparkles,
} from "lucide-react";

export default function Step5() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const [isCompleting, setIsCompleting] = useState(false);

  const completeOnboarding = useMutation(api.onboarding.state.complete);
  const onboardingState = useQuery(api.onboarding.state.get);

  const connectedPlatforms = onboardingState?.connectedPlatforms || [];
  const selectedContacts = onboardingState?.selectedContacts || [];

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await completeOnboarding();
      router.push("/dashboard");
    } catch (err) {
      console.error("Complete error:", err);
      setIsCompleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
        <Sparkles className="h-10 w-10 text-success" />
      </div>

      <h1 className="text-xl font-display font-bold text-foreground mb-2">
        You're all set!
      </h1>
      <p className="text-muted-foreground mb-8">
        Here's a summary of your setup. You can always change these settings
        later.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-left">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {connectedPlatforms.length}
                </div>
                <div className="text-xs text-muted-foreground">Platforms</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {connectedPlatforms.map((p: string) => (
                <Badge key={p} variant="secondary" className="text-xs capitalize">
                  {p}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-chart-4/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {selectedContacts.length}
                </div>
                <div className="text-xs text-muted-foreground">Clients</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Selected for tracking
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-success" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">AI</div>
                <div className="text-xs text-muted-foreground">Features</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Priority scoring, sentiment analysis, smart drafts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* What happens next */}
      <Card className="text-left mb-8">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-foreground mb-4">What happens next</h3>
          <div className="space-y-3">
            {[
              {
                icon: CheckCircle2,
                text: "We'll sync your recent messages from connected platforms",
                color: "text-success",
              },
              {
                icon: CheckCircle2,
                text: "AI will analyze messages for priority and sentiment",
                color: "text-success",
              },
              {
                icon: CheckCircle2,
                text: "Your dashboard will show urgent items and client health",
                color: "text-success",
              },
              {
                icon: CheckCircle2,
                text: "Smart notifications will alert you to important messages",
                color: "text-success",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <item.icon className={`h-5 w-5 ${item.color} mt-0.5 flex-shrink-0`} />
                <span className="text-sm text-muted-foreground">{item.text}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => router.push("/onboarding/step-4")}
        >
          Back
        </Button>
        <Button
          onClick={handleComplete}
          disabled={isCompleting}
          size="lg"
          className="bg-success hover:bg-success/90"
        >
          {isCompleting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              Go to Dashboard
              <Sparkles className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
