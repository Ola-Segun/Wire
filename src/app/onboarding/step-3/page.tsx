"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MessageSquare,
  Shield,
  Loader2,
  ArrowRight,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

export default function Step3() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [wabaToken, setWabaToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaError, setWabaError] = useState<string | null>(null);
  const [wabaSuccess, setWabaSuccess] = useState<string | null>(null);
  const error = searchParams.get("error");

  const initiateSlackOAuth = useAction(api.onboarding.slack.initiateOAuth);
  const updateStep = useMutation(api.onboarding.state.updateStep);
  const onboardingState = useQuery(api.onboarding.state.get);

  const connectedPlatforms = onboardingState?.connectedPlatforms ?? [];
  const isSlackConnected = connectedPlatforms.includes("slack");
  const isWhatsAppConnected = connectedPlatforms.includes("whatsapp");
  const isDiscordConnected = connectedPlatforms.includes("discord");

  const handleConnectSlack = async () => {
    if (!user?._id) return;
    setIsConnecting("slack");
    try {
      const result = await initiateSlackOAuth({ userId: user._id });
      window.location.href = result.authUrl;
    } catch (err) {
      console.error("Slack OAuth error:", err);
      setIsConnecting(null);
    }
  };

  const handleConnectWhatsApp = async () => {
    if (!user?._id || !wabaToken.trim() || !phoneNumberId.trim()) return;
    setIsConnecting("whatsapp");
    setWabaError(null);
    setWabaSuccess(null);
    try {
      const res = await fetch("/api/auth/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wabaToken: wabaToken.trim(),
          phoneNumberId: phoneNumberId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWabaError(data.error ?? "Failed to connect WhatsApp Business");
        return;
      }
      setWabaSuccess(data.displayPhone ?? "Connected");
      toast.success(`WhatsApp Business ${data.displayPhone} connected!`);
      setWabaToken("");
      setPhoneNumberId("");
    } catch (err) {
      console.error("WhatsApp connect error:", err);
      setWabaError("Network error — please try again.");
    } finally {
      setIsConnecting(null);
    }
  };

  const handleConnectDiscord = async () => {
    if (!user?._id) return;
    setIsConnecting("discord");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const discordAuthUrl =
      `https://discord.com/api/oauth2/authorize?` +
      `client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(`${appUrl}/api/auth/discord/callback`)}&` +
      `response_type=code&` +
      `scope=identify+guilds+messages.read&` +
      `state=${user._id}`;
    window.location.href = discordAuthUrl;
  };

  const handleContinue = async () => {
    await updateStep({ step: 4 });
    router.push("/onboarding/step-4");
  };

  const handleSkip = async () => {
    await updateStep({ step: 4 });
    router.push("/onboarding/step-4");
  };

  const platformCards = [
    {
      key: "slack",
      name: "Slack",
      desc: "Import your workspace contacts and messages",
      icon: <MessageSquare className="h-7 w-7 text-chart-4" />,
      iconBg: "bg-chart-4/10",
      connected: isSlackConnected,
      onConnect: handleConnectSlack,
    },
    {
      key: "whatsapp",
      name: "WhatsApp Business",
      desc: "Connect your WhatsApp Business number via Meta Cloud API",
      icon: <Phone className="h-7 w-7 text-success" />,
      iconBg: "bg-success/10",
      connected: isWhatsAppConnected,
      onConnect: undefined, // custom inline form below
    },
    {
      key: "discord",
      name: "Discord",
      desc: "Community & DM management",
      icon: <MessageSquare className="h-7 w-7 text-primary" />,
      iconBg: "bg-primary/10",
      connected: isDiscordConnected,
      onConnect: handleConnectDiscord,
    },
  ];

  const hasAnyConnection = isSlackConnected || isWhatsAppConnected || isDiscordConnected;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-display font-bold text-foreground mb-2">
        Connect more platforms
      </h1>
      <p className="text-muted-foreground mb-8">
        Link messaging platforms to see all client conversations in one place.
        This step is optional — you can connect more later in Settings.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-urgent/5 border border-urgent/20 rounded-lg text-urgent text-sm">
          {error === "auth_failed"
            ? "Authentication failed. Please try again."
            : error === "missing_params"
              ? "Missing authentication parameters. Please try again."
              : `Error: ${error}`}
        </div>
      )}

      <div className="space-y-3">
        {platformCards.map((p) => (
          <Card
            key={p.key}
            className={`transition border-2 ${
              p.connected
                ? "border-success bg-success/5"
                : "border-border/40 hover:shadow-lg"
            } ${p.onConnect && !p.connected ? "cursor-pointer" : ""}`}
            onClick={p.onConnect && !p.connected && isConnecting !== p.key ? p.onConnect : undefined}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl ${p.iconBg} flex items-center justify-center`}>
                  {p.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-foreground">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {p.connected ? "Connected successfully" : p.desc}
                  </p>
                </div>
                {p.connected ? (
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
                ) : p.key === "whatsapp" ? null : (
                  <Button disabled={isConnecting === p.key}>
                    {isConnecting === p.key ? (
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

              {/* WhatsApp Business — WABA Token + Phone Number ID form */}
              {p.key === "whatsapp" && !p.connected && (
                <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  {/* Step-by-step instructions */}
                  <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1 leading-relaxed">
                    <p className="font-semibold text-foreground mb-1">How to get your credentials:</p>
                    <p>1. Go to <span className="font-mono text-xs bg-muted px-1 rounded">business.facebook.com</span> → Settings → System Users</p>
                    <p>2. Generate a token with <span className="font-mono text-xs">whatsapp_business_messaging</span> permission</p>
                    <p>3. Go to WhatsApp → Phone Numbers → copy the <strong>Phone Number ID</strong></p>
                  </div>

                  {/* WABA Token */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      WABA Token
                    </label>
                    <input
                      type="password"
                      placeholder="EAAxxxxxx... (Meta System User Token)"
                      value={wabaToken}
                      onChange={(e) => setWabaToken(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-success/40 transition-all font-mono"
                    />
                  </div>

                  {/* Phone Number ID */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Phone Number ID
                    </label>
                    <input
                      type="text"
                      placeholder="123456789012345"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-success/40 transition-all font-mono"
                    />
                  </div>

                  {/* Error / success feedback */}
                  {wabaError && (
                    <p className="text-xs text-urgent bg-urgent/5 border border-urgent/20 rounded-lg px-3 py-2">
                      {wabaError}
                    </p>
                  )}
                  {wabaSuccess && (
                    <p className="text-xs text-success bg-success/5 border border-success/20 rounded-lg px-3 py-2">
                      Connected: {wabaSuccess}
                    </p>
                  )}

                  <Button
                    size="sm"
                    disabled={
                      !wabaToken.trim() ||
                      !phoneNumberId.trim() ||
                      isConnecting === "whatsapp"
                    }
                    onClick={handleConnectWhatsApp}
                    className="w-full bg-success hover:bg-success/90 text-white"
                  >
                    {isConnecting === "whatsapp" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Validating with Meta...
                      </>
                    ) : (
                      <>
                        <Phone className="h-4 w-4 mr-2" />
                        Connect WhatsApp Business
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4 text-success" />
        We only access conversations you&apos;re part of. Your data stays encrypted.
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
          {!hasAnyConnection && (
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
