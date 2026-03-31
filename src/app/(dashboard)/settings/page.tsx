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
  Pencil,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Phone,
  ChevronDown,
  Zap,
  AlertCircle,
  Inbox,
  Settings,
} from "lucide-react";

// Platform capabilities config
const PLATFORM_CAPABILITIES: Record<
  string,
  { messageTypes: string[]; features: string[]; limitations?: string[] }
> = {
  gmail: {
    messageTypes: ["Emails (inbound & outbound)"],
    features: ["Sync contacts", "Send replies", "AI priority scoring", "Attachments"],
  },
  slack: {
    messageTypes: ["Direct messages", "Channel mentions"],
    features: ["Sync workspace users", "Send DMs", "AI priority scoring"],
  },
  discord: {
    messageTypes: ["Direct messages (DMs)"],
    features: ["Sync server members", "Send DMs", "AI priority scoring", "Attachments"],
    limitations: ["Server channels not yet supported"],
  },
  whatsapp: {
    messageTypes: ["WhatsApp Business messages (inbound & outbound)"],
    features: [
      "Real-time delivery via Meta webhook",
      "Send replies from Wire",
      "AI priority scoring",
      "Image, document & audio attachments",
    ],
    limitations: [
      "Requires WhatsApp Business Account (Meta)",
      "Uses a dedicated business number (not personal WhatsApp)",
    ],
  },
};

import { PLATFORM_LABELS, type PlatformType } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/date-utils";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { IdentityLinkingModal } from "@/components/dashboard/identity-linking-modal";
import { IdentityMergeSuggestions } from "@/components/dashboard/identity-merge-suggestions";
import { SyncContactsModal } from "@/components/dashboard/sync-contacts-modal";
import { PlatformIconRaw, PLATFORM_COLORS } from "@/lib/platform-icons";

type RemoveDialogState = {
  platform: PlatformType;
  deleteMessages: boolean;
  deleteIdentities: boolean;
} | null;

type Section = "profile" | "platforms" | "preferences" | "subscription";

const SECTIONS: { id: Section; label: string; Icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", Icon: User },
  { id: "platforms", label: "Platforms", Icon: Link2 },
  { id: "preferences", label: "Preferences", Icon: Sliders },
  { id: "subscription", label: "Subscription", Icon: CreditCard },
];

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SettingsSkeleton() {
  return (
    <div className="h-full flex overflow-hidden">
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 p-4 gap-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-muted/50 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
            <div className="h-3 w-32 bg-muted/30 rounded animate-pulse" />
          </div>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 bg-muted/30 rounded-xl animate-pulse" />
        ))}
      </aside>
      <div className="flex-1 p-6 space-y-4">
        <div className="h-6 w-24 bg-muted/60 rounded-lg animate-pulse" />
        <div className="surface-raised rounded-xl p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoading } = useCurrentUser();
  const connectedPlatforms = useQuery(api.oauth.getConnectedPlatforms);
  const searchParams = useSearchParams();
  const router = useRouter();

  const initiateGmailOAuth = useAction(api.onboarding.gmail.initiateOAuth);
  const initiateSlackOAuth = useAction(api.onboarding.slack.initiateOAuth);
  const importSlackUsers = useAction(api.onboarding.slack.importUsers);
  const importGmailContacts = useAction(api.onboarding.gmail.importContacts);
  const deleteTokens = useMutation(api.oauth.deleteTokens);
  const removePlatformData = useMutation(api.oauth.removePlatformData);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const updateProfile = useMutation(api.users.updateProfile);

  // Redirect back from OAuth
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected && user?._id) {
      toast.success(
        `${connected.charAt(0).toUpperCase() + connected.slice(1)} reconnected successfully`
      );
      router.replace("/settings", { scroll: false });
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
        setSyncModalPlatform(connected);
        setActiveSection("platforms");
      };
      reimport();
    } else if (error) {
      toast.error(`Connection failed: ${error.replace(/_/g, " ")}`);
      router.replace("/settings", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, user?._id]);

  const [activeSection, setActiveSection] = useState<Section>("profile");
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncModalPlatform, setSyncModalPlatform] = useState<string | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
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
  const [wabaToken, setWabaToken] = useState("");
  const [wabaPhoneNumberId, setWabaPhoneNumberId] = useState("");
  const [wabaError, setWabaError] = useState<string | null>(null);

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

  if (isLoading || !user) return <SettingsSkeleton />;

  const connectedSet = new Set(connectedPlatforms?.map((p) => p.platform) ?? []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      await updateProfile({ name: profileName, timezone: profileTimezone });
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
    if (platform === "whatsapp") {
      setShowWhatsAppModal(true);
      return;
    }
    if (platform === "discord") {
      setConnectingPlatform(platform);
      const discordAuthUrl =
        `https://discord.com/oauth2/authorize?` +
        `client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent("identify guilds")}&` +
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
    if (!user?._id || !wabaToken.trim() || !wabaPhoneNumberId.trim()) return;
    setConnectingPlatform("whatsapp");
    setWabaError(null);
    try {
      const res = await fetch("/api/auth/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wabaToken: wabaToken.trim(),
          phoneNumberId: wabaPhoneNumberId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWabaError(data.error ?? "Failed to connect WhatsApp Business");
        return;
      }
      toast.success(`WhatsApp Business ${data.displayPhone} connected successfully`);
      setShowWhatsAppModal(false);
      setWabaToken("");
      setWabaPhoneNumberId("");
      setWabaError(null);
    } catch (err) {
      console.error("WhatsApp connect failed:", err);
      setWabaError("Network error — please try again.");
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
          notifications: { email: emailNotifs, push: pushNotifs },
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

  const handleSyncContacts = (platform: PlatformType) => setSyncModalPlatform(platform);

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
      toast.success(`${PLATFORM_LABELS[removeDialog.platform]} data removed`);
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

  // User initials for avatar
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Left sidebar ── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 overflow-y-auto scrollbar-thin">
        {/* User info */}
        <div className="p-4 border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <p className="text-[10px] font-mono text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>

        {/* Section nav */}
        <nav className="p-2 flex-1 flex flex-col gap-0.5">
          <p className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider px-3 pt-2 pb-1">
            Settings
          </p>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs transition-all text-left ${
                activeSection === id
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              {id === "platforms" && (
                <span className="ml-auto text-[9px] font-mono opacity-60">
                  {connectedSet.size}/{Object.keys(PLATFORM_LABELS).length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Plan badge */}
        <div className="p-3 border-t border-border/20">
          <div className="flex items-center justify-between px-2 py-2 rounded-xl bg-muted/30">
            <span className="text-[10px] font-mono text-muted-foreground capitalize">
              {user.plan} plan
            </span>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full ${
                user.planStatus === "active"
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {user.planStatus}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Right main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile section tab strip */}
        <div className="md:hidden shrink-0 flex gap-1 p-2 border-b border-border/20 overflow-x-auto scrollbar-none">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                activeSection === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 pb-28">
          {/* Section heading */}
          <div className="flex items-center gap-2 mb-5">
            {(() => {
              const s = SECTIONS.find((s) => s.id === activeSection)!;
              return (
                <>
                  <s.Icon className="h-4 w-4 text-primary" />
                  <h1 className="text-lg font-display font-bold text-foreground">
                    {s.label}
                  </h1>
                </>
              );
            })()}
          </div>

          {/* ── Profile ── */}
          {activeSection === "profile" && (
            <div className="surface-raised rounded-xl p-5 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-muted-foreground">
                  Your personal information and timezone
                </p>
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
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-primary/40 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                        Email
                      </label>
                      <p className="text-sm text-foreground py-2">{user.email}</p>
                      <p className="text-[10px] text-muted-foreground/60">Managed by Clerk</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-mono text-muted-foreground block mb-1">
                        Timezone
                      </label>
                      <select
                        value={profileTimezone}
                        onChange={(e) => setProfileTimezone(e.target.value)}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-primary/40 transition-all"
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
                    <label className="text-[10px] font-mono text-muted-foreground">Name</label>
                    <p className="text-sm text-foreground mt-0.5">{user.name}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground">Email</label>
                    <p className="text-sm text-foreground mt-0.5">{user.email}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground">
                      Timezone
                    </label>
                    <p className="text-sm text-foreground mt-0.5">
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
          )}

          {/* ── Platforms ── */}
          {activeSection === "platforms" && (
            <div className="space-y-4 animate-fade-in">
              <div className="surface-raised rounded-xl p-5">
                <p className="text-xs text-muted-foreground mb-4">
                  Connect your communication platforms to start syncing messages
                </p>
                <div className="space-y-2.5">
                  {(Object.keys(PLATFORM_LABELS) as PlatformType[]).map((platform) => {
                    const isConnected = connectedSet.has(platform);
                    const connection = getPlatformConnection(platform);

                    return (
                      <div
                        key={platform}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isConnected
                            ? "border-success/20 bg-success/5"
                            : "border-border/30 hover:bg-accent/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <PlatformIconRaw
                              platform={platform}
                              className={`h-5 w-5 ${
                                PLATFORM_COLORS[platform]?.text ?? "text-muted-foreground"
                              }`}
                            />
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
                                <button
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium border border-border hover:bg-accent transition-colors"
                                  onClick={() => handleSyncContacts(platform)}
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Sync contacts
                                </button>
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
                                <button
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium text-urgent border border-urgent/20 hover:bg-urgent/5 transition-colors"
                                  onClick={() =>
                                    setRemoveDialog({
                                      platform,
                                      deleteMessages: false,
                                      deleteIdentities: false,
                                    })
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Remove data
                                </button>
                              </>
                            ) : (
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
                            )}
                            <button
                              className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
                              onClick={() =>
                                setExpandedPlatform(
                                  expandedPlatform === platform ? null : platform
                                )
                              }
                            >
                              <ChevronDown
                                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                                  expandedPlatform === platform ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Capabilities panel */}
                        {expandedPlatform === platform && PLATFORM_CAPABILITIES[platform] && (
                          <div className="mt-3 pt-3 border-t border-border/30 space-y-2.5">
                            <div className="flex items-start gap-2">
                              <Inbox className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                              <div>
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  Messages
                                </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {PLATFORM_CAPABILITIES[platform].messageTypes.map((type) => (
                                    <span
                                      key={type}
                                      className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                                    >
                                      {type}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Zap className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                              <div>
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  Features
                                </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {PLATFORM_CAPABILITIES[platform].features.map((feat) => (
                                    <span
                                      key={feat}
                                      className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success font-medium"
                                    >
                                      {feat}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {PLATFORM_CAPABILITIES[platform].limitations && (
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                                <div>
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Limitations
                                  </span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {PLATFORM_CAPABILITIES[platform].limitations!.map((lim) => (
                                      <span
                                        key={lim}
                                        className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium"
                                      >
                                        {lim}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contact merge suggestions */}
              <IdentityMergeSuggestions />
            </div>
          )}

          {/* ── Preferences ── */}
          {activeSection === "preferences" && (
            <div className="surface-raised rounded-xl p-5 animate-fade-in">
              <p className="text-xs text-muted-foreground mb-5">
                Customize how Wire notifies and alerts you
              </p>
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
                      onChange={(e) => setUrgencyThreshold(Number(e.target.value))}
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
          )}

          {/* ── Subscription ── */}
          {activeSection === "subscription" && (
            <div className="surface-raised rounded-xl p-5 animate-fade-in">
              <p className="text-xs text-muted-foreground mb-5">
                Your current plan and billing status
              </p>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/30 bg-muted/20">
                <div>
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {user.plan} Plan
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground capitalize mt-0.5">
                    Status: {user.planStatus}
                  </p>
                </div>
                <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-full bg-primary/10 text-primary capitalize">
                  {user.plan}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── WhatsApp modal ── */}
      {showWhatsAppModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowWhatsAppModal(false);
              setWabaError(null);
            }}
          >
            <div
              className="surface-raised rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                  <Phone className="h-5 w-5 text-success" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-semibold text-foreground">
                    Connect WhatsApp Business
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Meta WhatsApp Business Cloud API
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border/30 rounded-lg p-3 mb-4 space-y-1.5 leading-relaxed">
                <p className="font-semibold text-foreground text-xs mb-2">
                  How to get your credentials:
                </p>
                <p className="text-muted-foreground/80">
                  <span className="font-mono bg-muted px-1 rounded text-[10px]">1.</span> Create
                  a Meta App at{" "}
                  <span className="font-mono text-foreground">developers.facebook.com</span> → Add
                  WhatsApp product
                </p>
                <p className="text-muted-foreground/80">
                  <span className="font-mono bg-muted px-1 rounded text-[10px]">2.</span> Go to{" "}
                  <span className="font-mono text-foreground">business.facebook.com</span> →
                  Settings → System Users → Generate token
                </p>
                <p className="text-muted-foreground/80">
                  <span className="font-mono bg-muted px-1 rounded text-[10px]">3.</span> Grant{" "}
                  <span className="font-mono">whatsapp_business_messaging</span> +{" "}
                  <span className="font-mono">whatsapp_business_management</span> permissions
                </p>
                <p className="text-muted-foreground/80">
                  <span className="font-mono bg-muted px-1 rounded text-[10px]">4.</span> In Meta
                  App → WhatsApp → Phone Numbers → copy <strong>Phone Number ID</strong>
                </p>
                <p className="text-muted-foreground/80">
                  <span className="font-mono bg-muted px-1 rounded text-[10px]">5.</span> In Meta
                  App → Settings → Basic Settings → copy <strong>App Secret</strong>
                </p>
              </div>

              <div className="mb-3">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                  WABA Token
                </label>
                <input
                  type="password"
                  placeholder="EAAxxxxxx... (Meta System User Token)"
                  value={wabaToken}
                  onChange={(e) => setWabaToken(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-success/40 transition-all font-mono"
                  autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                  Phone Number ID
                </label>
                <input
                  type="text"
                  placeholder="123456789012345"
                  value={wabaPhoneNumberId}
                  onChange={(e) => setWabaPhoneNumberId(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:border-success/40 transition-all font-mono"
                />
              </div>

              {wabaError && (
                <p className="text-[11px] text-urgent bg-urgent/5 border border-urgent/20 rounded-lg px-3 py-2 mb-3">
                  {wabaError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleWhatsAppConnect}
                  disabled={
                    !wabaToken.trim() ||
                    !wabaPhoneNumberId.trim() ||
                    connectingPlatform === "whatsapp"
                  }
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-success text-white hover:bg-success/90 transition-colors disabled:opacity-50"
                >
                  {connectingPlatform === "whatsapp" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Phone className="h-3 w-3" />
                  )}
                  {connectingPlatform === "whatsapp" ? "Validating..." : "Connect"}
                </button>
                <button
                  onClick={() => {
                    setShowWhatsAppModal(false);
                    setWabaError(null);
                  }}
                  className="flex-1 px-4 py-2 rounded-lg text-xs font-medium border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Sync Contacts Modal */}
      {syncModalPlatform && user?._id && (
        <SyncContactsModal
          platform={syncModalPlatform as "gmail" | "slack" | "discord" | "whatsapp"}
          userId={user._id}
          open={!!syncModalPlatform}
          onClose={() => setSyncModalPlatform(null)}
          onContactsAdded={() => {
            setSyncModalPlatform(null);
            setLinkingPlatform(syncModalPlatform);
          }}
        />
      )}

      {/* Identity Linking Modal */}
      {linkingPlatform && user?._id && (
        <IdentityLinkingModal
          platform={linkingPlatform}
          userId={user._id}
          open={!!linkingPlatform}
          onClose={() => setLinkingPlatform(null)}
        />
      )}

      {/* Remove Platform Data dialog */}
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
