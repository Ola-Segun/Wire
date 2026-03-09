"use client";

import { useState, useEffect } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSearchParams } from "next/navigation";
import { Mail, Shield, Loader2 } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Gmail authentication failed. Please try again.",
  missing_params: "OAuth callback was missing required parameters. Please try again.",
  access_denied: "Access was denied. Please grant the required permissions.",
};

export default function Step1() {
  const { user } = useCurrentUser();
  const searchParams = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateGmailOAuth = useAction(api.onboarding.gmail.initiateOAuth);
  const updateStep = useMutation(api.onboarding.state.updateStep);
  const onboardingState = useQuery(api.onboarding.state.get);

  const isGmailConnected =
    onboardingState?.connectedPlatforms?.includes("gmail");

  // Read error from URL params (set by OAuth callback on failure)
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setError(ERROR_MESSAGES[urlError] || `Connection failed: ${urlError}`);
    }
  }, [searchParams]);

  // Auto-advance to step-2 if Gmail was just connected (e.g. returning from OAuth)
  useEffect(() => {
    if (isGmailConnected && !error) {
      updateStep({ step: 2 }).then(() => {
        window.location.href = "/onboarding/step-2";
      }).catch(console.error);
    }
  }, [isGmailConnected, error, updateStep]);

  const handleConnectGmail = async () => {
    if (!user?._id) return;
    setIsConnecting(true);
    setError(null);

    try {
      const result = await initiateGmailOAuth({ userId: user._id });
      window.location.href = result.authUrl;
    } catch (err) {
      console.error("Gmail OAuth error:", err);
      setError("Failed to initiate Gmail connection. Please try again.");
      setIsConnecting(false);
    }
  };

  const handleContinue = async () => {
    await updateStep({ step: 2 });
    window.location.href = "/onboarding/step-2";
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-display font-bold text-foreground mb-2">
        Connect your first platform
      </h1>
      <p className="text-muted-foreground mb-8">
        We'll start with Gmail to find your clients and contacts.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-urgent/5 border border-urgent/20 rounded-lg text-urgent text-sm">
          {error}
        </div>
      )}

      <Card
        className={`hover:shadow-lg transition cursor-pointer border-2 ${
          isGmailConnected
            ? "border-success bg-success/5"
            : "border-border/40"
        }`}
        onClick={!isGmailConnected && !isConnecting ? handleConnectGmail : undefined}
      >
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-urgent/10 flex items-center justify-center">
              <Mail className="h-7 w-7 text-urgent" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-foreground">Gmail</h3>
              <p className="text-sm text-muted-foreground">
                {isGmailConnected
                  ? "Connected successfully"
                  : "Scan your inbox to find people you communicate with"}
              </p>
            </div>
            {isGmailConnected ? (
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
        We only read sender info to find your contacts, not message content.
      </div>

      {isGmailConnected && (
        <div className="mt-8 flex justify-end">
          <Button onClick={handleContinue} size="lg">
            Continue to Select Contacts
          </Button>
        </div>
      )}
    </div>
  );
}
