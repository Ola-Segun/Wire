"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Shield, Loader2, ArrowRight } from "lucide-react";

export default function Step3() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isConnecting, setIsConnecting] = useState(false);
  const error = searchParams.get("error");

  const initiateSlackOAuth = useAction(api.onboarding.slack.initiateOAuth);
  const updateStep = useMutation(api.onboarding.state.updateStep);
  const onboardingState = useQuery(api.onboarding.state.get);

  const isSlackConnected =
    onboardingState?.connectedPlatforms?.includes("slack");

  const handleConnectSlack = async () => {
    if (!user?._id) return;
    setIsConnecting(true);

    try {
      const result = await initiateSlackOAuth({ userId: user._id });
      window.location.href = result.authUrl;
    } catch (err) {
      console.error("Slack OAuth error:", err);
      setIsConnecting(false);
    }
  };

  const handleContinue = async () => {
    await updateStep({ step: 4 });
    router.push("/onboarding/step-4");
  };

  const handleSkip = async () => {
    await updateStep({ step: 4 });
    router.push("/onboarding/step-4");
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-display font-bold text-foreground mb-2">
        Connect another platform
      </h1>
      <p className="text-muted-foreground mb-8">
        Link your Slack workspace to see all client conversations in one place.
        This step is optional.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-urgent/5 border border-urgent/20 rounded-lg text-urgent text-sm">
          {error === "auth_failed"
            ? "Slack authentication failed. Please try again."
            : error === "missing_params"
              ? "Missing authentication parameters. Please try again."
              : `Error: ${error}`}
        </div>
      )}

      <Card
        className={`hover:shadow-lg transition cursor-pointer border-2 ${
          isSlackConnected
            ? "border-success bg-success/5"
            : "border-border/40"
        }`}
        onClick={!isSlackConnected && !isConnecting ? handleConnectSlack : undefined}
      >
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-chart-4/10 flex items-center justify-center">
              <MessageSquare className="h-7 w-7 text-chart-4" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-foreground">Slack</h3>
              <p className="text-sm text-muted-foreground">
                {isSlackConnected
                  ? "Connected successfully"
                  : "Import your workspace contacts and messages"}
              </p>
            </div>
            {isSlackConnected ? (
              <div className="text-success font-medium text-sm flex items-center gap-1">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Connected
              </div>
            ) : (
              <Button disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4 text-success" />
        We'll only access public channels and direct messages you're part of.
      </div>

      {/* More platforms coming soon */}
      <div className="mt-6 space-y-3">
        <p className="text-xs text-muted-foreground/60 uppercase font-medium tracking-wide">
          Coming soon
        </p>
        {[
          { name: "WhatsApp", desc: "Business messaging" },
          { name: "Discord", desc: "Community management" },
        ].map((platform) => (
          <Card key={platform.name} className="opacity-50 cursor-not-allowed">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-accent/50 flex items-center justify-center">
                  <MessageSquare className="h-7 w-7 text-muted-foreground/60" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-muted-foreground">
                    {platform.name}
                  </h3>
                  <p className="text-sm text-muted-foreground/60">{platform.desc}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Soon
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => router.push("/onboarding/step-2")}
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          {!isSlackConnected && (
            <Button variant="ghost" onClick={handleSkip}>
              Skip for now
            </Button>
          )}
          <Button onClick={handleContinue} size="lg">
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
