"use client";

import { useState, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  User,
  Link2,
  CreditCard,
  Sliders,
  Loader2,
  Check,
  Mail,
  MessageSquare,
  Pencil,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Phone,
} from "lucide-react";
import { PLATFORM_LABELS, type PlatformType } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/date-utils";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { IdentityLinkingModal } from "@/components/dashboard/identity-linking-modal";
import { IdentityMergeSuggestions } from "@/components/dashboard/identity-merge-suggestions";
import { SyncContactsModal } from "@/components/dashboard/sync-contacts-modal";

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  gmail: <Mail className="h-5 w-5 text-urgent" />,
  slack: <MessageSquare className="h-5 w-5 text-chart-4" />,
  whatsapp: <MessageSquare className="h-5 w-5 text-success" />,
  discord: <MessageSquare className="h-5 w-5 text-primary" />,
};

type RemoveDialogState = {
  platform: PlatformType;
  deleteMessages: boolean;
  deleteIdentities: boolean;
} | null;

export default function SettingsPage() {
  const { user, isLoading } = useCurrentUser();
  const connectedPlatforms = useQuery(api.oauth.getConnectedPlatforms);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Show toast when redirected back from OAuth, re-import contacts, and prompt linking
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected && user?._id) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} reconnected successfully`);
      router.replace("/settings", { scroll: false });

      // Re-import contacts from the platform to discover new ones, then prompt linking
      const reimport = async () => {
        try {
          if (connected === "slack") {
            await importSlackUsers({ userId: user._id });
          } else if (connected === "gmail") {
            await importGmailContacts({ userId: user._id });
          }
        } catch (err) {
          console.error(`Re-import ${connected} contacts failed:`, err);
        }
        // Open the identity linking modal for newly imported contacts
        setLinkingPlatform(connected);
      };
      reimport();
    } else if (error) {
      toast.error(`Connection failed: ${error.replace(/_/g, " ")}`);
      router.replace("/settings", { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, user?._id]);

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncModalPlatform, setSyncModalPlatform] = useState<string | null>(null);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState>(null);
  const [removing, setRemoving] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profileTimezone, setProfileTimezone] = useState(user?.timezone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [linkingPlatform, setLinkingPlatform] = useState<string | null>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState("");

  // Preference state
  const [urgencyThreshold, setUrgencyThreshold] = useState(
    user?.preferences?.urgencyThreshold ?? 70
  );
  const [digestTime, setDigestTime] = useState(
    user?.preferences?.dailyDigestTime ?? "09:00"
  );
  const [emailNotifs, setEmailNotifs] = useState(
    user?.preferences?.notifications?.email ?? true
  );
  const [pushNotifs, setPushNotifs] = useState(
    user?.preferences?.notifications?.push ?? false
  );

  const initiateGmailOAuth = useAction(api.onboarding.gmail.initiateOAuth);
  const initiateSlackOAuth = useAction(api.onboarding.slack.initiateOAuth);
  const importSlackUsers = useAction(api.onboarding.slack.importUsers);
  const importGmailContacts = useAction(api.onboarding.gmail.importContacts);
  const deleteTokens = useMutation(api.oauth.deleteTokens);
  const removePlatformData = useMutation(api.oauth.removePlatformData);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const updateProfile = useMutation(api.users.updateProfile);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const connectedSet = new Set(
    connectedPlatforms?.map((p) => p.platform) ?? []
  );

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      await updateProfile({
        name: profileName,
        timezone: profileTimezone,
      });
      setProfileSaved(true);
      setEditingProfile(false);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      console.error("Save profile failed:", err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleConnect = async (platform: PlatformType) => {
    if (!user?._id) return;

    // WhatsApp uses a phone number modal instead of OAuth
    if (platform === "whatsapp") {
      setShowWhatsAppModal(true);
      return;
    }

    // Discord uses direct OAuth redirect
    if (platform === "discord") {
      setConnectingPlatform(platform);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const discordAuthUrl =
        `https://discord.com/api/oauth2/authorize?` +
        `client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(`${appUrl}/api/auth/discord/callback`)}&` +
        `response_type=code&` +
        `scope=identify+guilds+messages.read&` +
        `state=${user._id}`;
      window.location.href = discordAuthUrl;
      return;
    }

    setConnectingPlatform(platform);
    try {
      let result: { authUrl: string };
      if (platform === "gmail") {
        result = await initiateGmailOAuth({ userId: user._id, origin: "settings" });
      } else if (platform === "slack") {
        result = await initiateSlackOAuth({ userId: user._id, origin: "settings" });
      } else {
        return;
      }
      window.location.href = result.authUrl;
    } catch (err) {
      console.error(`Connect ${platform} failed:`, err);
      setConnectingPlatform(null);
    }
  };

  const handleWhatsAppConnect = async () => {
    if (!user?._id || !whatsAppPhone.trim()) return;
    setConnectingPlatform("whatsapp");
    try {
      const res = await fetch("/api/auth/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: whatsAppPhone.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("WhatsApp number connected successfully");
      setShowWhatsAppModal(false);
      setWhatsAppPhone("");
    } catch (err) {
      console.error("WhatsApp connect failed:", err);
      toast.error("Failed to connect WhatsApp number");
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platform: PlatformType) => {
    if (!user?._id) return;
    setDisconnecting(platform);
    try {
      await deleteTokens({ userId: user._id, platform });
    } catch (err) {
      console.error(`Disconnect ${platform} failed:`, err);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    setPrefsSaved(false);
    try {
      await updatePreferences({
        preferences: {
          urgencyThreshold,
          dailyDigestTime: digestTime,
          notifications: {
            email: emailNotifs,
            push: pushNotifs,
          },
        },
      });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2000);
    } catch (err) {
      console.error("Save preferences failed:", err);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleSyncContacts = (platform: PlatformType) => {
    setSyncModalPlatform(platform);
  };

  const handleRemovePlatformData = async () => {
    if (!removeDialog || !user?._id) return;
    setRemoving(true);
    try {
      await removePlatformData({
        userId: user._id,
        platform: removeDialog.platform,
        deleteMessages: removeDialog.deleteMessages,
        deleteIdentities: removeDialog.deleteIdentities,
      });
      toast.success(
        `${PLATFORM_LABELS[removeDialog.platform]} data removed`
      );
      setRemoveDialog(null);
    } catch (err) {
      console.error("Remove platform data failed:", err);
      toast.error("Failed to remove data");
    } finally {
      setRemoving(false);
    }
  };

  const getPlatformConnection = (platform: string) =>
    connectedPlatforms?.find((p) => p.platform === platform);

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-display font-bold text-foreground">
          Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your account and preferences
        </p>
      </div>

      {/* Profile */}
      <div className="surface-raised rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Profile
          </h3>
          {!editingProfile && (
            <button
              onClick={() => {
                setProfileName(user.name);
                setProfileTimezone(user.timezone ?? "");
                setEditingProfile(true);
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
        </div>

        {editingProfile ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-primary/40 focus:glow-primary transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Email
                </label>
                <p className="text-sm text-foreground py-2">{user.email}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  Managed by Clerk
                </p>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                  Timezone
                </label>
                <select
                  value={profileTimezone}
                  onChange={(e) => setProfileTimezone(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-primary/40 focus:glow-primary transition-all"
                >
                  <option value="">Select timezone...</option>
                  {Intl.supportedValuesOf("timeZone").map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingProfile ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Profile"
                )}
              </button>
              <button
                onClick={() => setEditingProfile(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              {profileSaved && (
                <span className="text-xs text-success flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">
                Name
              </label>
              <p className="text-sm text-foreground">{user.name}</p>
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">
                Email
              </label>
              <p className="text-sm text-foreground">{user.email}</p>
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground">
                Timezone
              </label>
              <p className="text-sm text-foreground">
                {user.timezone ?? "Not set"}
              </p>
            </div>
            {profileSaved && (
              <div className="col-span-2">
                <span className="text-xs text-success flex items-center gap-1">
                  <Check className="h-3 w-3" /> Profile updated
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connected Platforms */}
      <div className="surface-raised rounded-xl p-5 mb-4">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2 mb-4">
          <Link2 className="h-4 w-4 text-primary" />
          Connected Platforms
        </h3>
        <div className="space-y-2.5">
          {(Object.keys(PLATFORM_LABELS) as PlatformType[]).map((platform) => {
            const isConnected = connectedSet.has(platform);
            const connection = getPlatformConnection(platform);
            const isSupported = true; // All 4 platforms now supported

            return (
              <div
                key={platform}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  isConnected
                    ? "border-success/20 bg-success/5"
                    : "border-border/30 hover:bg-accent/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {PLATFORM_ICONS[platform]}
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {PLATFORM_LABELS[platform]}
                    </span>
                    {isConnected && connection?.createdAt && (
                      <p className="text-[10px] font-mono text-muted-foreground">
                        Connected {formatRelativeTime(connection.createdAt)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {isConnected ? (
                    <>
                      <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-success/10 text-success">
                        Connected
                      </span>
                      {/* Sync new contacts */}
                      <button
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium border border-border hover:bg-accent transition-colors"
                        onClick={() => handleSyncContacts(platform)}
                        title="Discover new contacts from this platform"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Sync contacts
                      </button>
                      {/* Disconnect */}
                      <button
                        className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-urgent border border-urgent/20 hover:bg-urgent/5 transition-colors disabled:opacity-50"
                        disabled={disconnecting === platform}
                        onClick={() => handleDisconnect(platform)}
                      >
                        {disconnecting === platform ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Disconnect"
                        )}
                      </button>
                      {/* Remove all data */}
                      <button
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium text-urgent border border-urgent/20 hover:bg-urgent/5 transition-colors"
                        onClick={() =>
                          setRemoveDialog({
                            platform,
                            deleteMessages: false,
                            deleteIdentities: false,
                          })
                        }
                        title="Remove all synced data from this platform"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove data
                      </button>
                    </>
                  ) : isSupported ? (
                    <button
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      disabled={connectingPlatform === platform}
                      onClick={() => handleConnect(platform)}
                    >
                      {connectingPlatform === platform ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />
                          Connecting...
                        </>
                      ) : (
                        "Connect"
                      )}
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-border text-muted-foreground/50">
                      Coming soon
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preferences */}
      <div className="surface-raised rounded-xl p-5 mb-4">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2 mb-5">
          <Sliders className="h-4 w-4 text-primary" />
          Preferences
        </h3>

        <div className="space-y-6">
          {/* Urgency Threshold */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Urgency Threshold
            </label>
            <p className="text-[10px] text-muted-foreground mb-3">
              Messages with priority score above this will be flagged as urgent
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={30}
                max={95}
                step={5}
                value={urgencyThreshold}
                onChange={(e) =>
                  setUrgencyThreshold(Number(e.target.value))
                }
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-mono font-bold text-foreground w-10 text-right">
                {urgencyThreshold}
              </span>
            </div>
          </div>

          {/* Daily Digest Time */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Daily Digest Time
            </label>
            <p className="text-[10px] text-muted-foreground mb-3">
              When to receive your daily summary email
            </p>
            <input
              type="time"
              value={digestTime}
              onChange={(e) => setDigestTime(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-primary/40 transition-all"
            />
          </div>

          {/* Notifications */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-3">
              Notifications
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={emailNotifs}
                  onChange={(e) => setEmailNotifs(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                  Email notifications
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={pushNotifs}
                  onChange={(e) => setPushNotifs(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
                  Push notifications
                </span>
              </label>
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={handleSavePreferences}
            disabled={savingPrefs}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingPrefs ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </>
            ) : prefsSaved ? (
              <>
                <Check className="h-3 w-3" />
                Saved!
              </>
            ) : (
              "Save Preferences"
            )}
          </button>
        </div>
      </div>

      {/* Subscription */}
      <div className="surface-raised rounded-xl p-5">
        <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2 mb-4">
          <CreditCard className="h-4 w-4 text-primary" />
          Subscription
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground capitalize">
              {user.plan} Plan
            </p>
            <p className="text-[10px] font-mono text-muted-foreground capitalize">
              Status: {user.planStatus}
            </p>
          </div>
          <span className="text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-primary/10 text-primary capitalize">
            {user.plan}
          </span>
        </div>
      </div>

      {/* WhatsApp Phone Connection Modal */}
      {showWhatsAppModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowWhatsAppModal(false)}
          >
            <div
              className="surface-raised rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-success" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-semibold text-foreground">
                    Connect WhatsApp
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Enter the phone number to track messages from
                  </p>
                </div>
              </div>
              <input
                type="tel"
                placeholder="+1 555 123 4567"
                value={whatsAppPhone}
                onChange={(e) => setWhatsAppPhone(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:border-success/40 transition-all mb-4"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleWhatsAppConnect}
                  disabled={!whatsAppPhone.trim() || connectingPlatform === "whatsapp"}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-success text-white hover:bg-success/90 transition-colors disabled:opacity-50"
                >
                  {connectingPlatform === "whatsapp" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Phone className="h-3 w-3" />
                  )}
                  Connect
                </button>
                <button
                  onClick={() => setShowWhatsAppModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Cross-platform contact merge suggestions */}
      <IdentityMergeSuggestions className="mb-4" />

      {/* Sync Contacts Modal — shown when the user clicks "Sync contacts" */}
      {syncModalPlatform && user?._id && (
        <SyncContactsModal
          platform={syncModalPlatform as "gmail" | "slack"}
          userId={user._id}
          open={!!syncModalPlatform}
          onClose={() => setSyncModalPlatform(null)}
          onContactsAdded={() => {
            setSyncModalPlatform(null);
            setLinkingPlatform(syncModalPlatform);
          }}
        />
      )}

      {/* Identity Linking Modal — shown after reconnecting or syncing a platform */}
      {linkingPlatform && user?._id && (
        <IdentityLinkingModal
          platform={linkingPlatform}
          userId={user._id}
          open={!!linkingPlatform}
          onClose={() => setLinkingPlatform(null)}
        />
      )}

      {/* Remove Platform Data confirmation dialog */}
      {removeDialog &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setRemoveDialog(null)}
          >
            <div
              className="surface-raised rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-urgent/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-urgent" />
              </div>
              <div>
                <h3 className="text-sm font-display font-semibold text-foreground">
                  Remove {PLATFORM_LABELS[removeDialog.platform]} data
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Choose what to delete. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeDialog.deleteMessages}
                  onChange={(e) =>
                    setRemoveDialog((d) => d && { ...d, deleteMessages: e.target.checked })
                  }
                  className="mt-0.5 h-3.5 w-3.5 accent-urgent"
                />
                <div>
                  <span className="text-xs font-medium text-foreground block">
                    Delete all messages
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Permanently removes all synced messages from this platform
                  </span>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeDialog.deleteIdentities}
                  onChange={(e) =>
                    setRemoveDialog((d) => d && { ...d, deleteIdentities: e.target.checked })
                  }
                  className="mt-0.5 h-3.5 w-3.5 accent-urgent"
                />
                <div>
                  <span className="text-xs font-medium text-foreground block">
                    Delete contact records
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Removes imported contacts. They won&apos;t be linked to clients anymore
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRemovePlatformData}
                disabled={removing}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-urgent text-white hover:bg-urgent/90 transition-colors disabled:opacity-50"
              >
                {removing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Remove data
              </button>
              <button
                onClick={() => setRemoveDialog(null)}
                disabled={removing}
                className="flex-1 px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
