"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, Mail, MessageSquare, Phone, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type GmailContact = {
  email: string;
  name: string;
  messageCount: number;
  lastMessageDate: number;
};

type SlackUser = {
  platformUserId: string;
  displayName: string;
  username?: string;
  email?: string;
  avatar?: string;
};

type DiscordUser = {
  platformUserId: string;
  displayName: string;
  username?: string;
  avatar?: string;
};

type WhatsAppUser = {
  platformUserId: string;
  displayName: string;
  phoneNumber?: string;
};

type Contact = GmailContact | SlackUser | DiscordUser | WhatsAppUser;

interface SyncContactsModalProps {
  platform: "gmail" | "slack" | "discord" | "whatsapp";
  userId: string;
  open: boolean;
  onClose: () => void;
  /** Called with the number of contacts saved, so the parent can open a linking modal */
  onContactsAdded?: (count: number) => void;
}

export function SyncContactsModal({
  platform,
  userId,
  open,
  onClose,
  onContactsAdded,
}: SyncContactsModalProps) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // WhatsApp-specific: phone number input for adding contacts
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [whatsAppName, setWhatsAppName] = useState("");
  const [addingPhone, setAddingPhone] = useState(false);

  const discoverGmail = useAction(api.onboarding.gmail.discoverNewContacts);
  const discoverSlack = useAction(api.onboarding.slack.discoverNewUsers);
  const discoverDiscord = useAction(api.onboarding.discord.discoverNewUsers);
  const discoverWhatsApp = useAction(api.onboarding.whatsapp.discoverNewUsers);
  const addWhatsAppContact = useAction(api.onboarding.whatsapp.addContactByPhone);
  const createSelected = useMutation(api.identities.createSelected);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Fetch new contacts when the modal opens; reset when it closes
  useEffect(() => {
    if (open && contacts === null && !loading) {
      handleDiscover();
    }
    if (!open) {
      setContacts(null);
      setSelected(new Set());
      setSearchQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDiscover = async () => {
    setLoading(true);
    try {
      if (platform === "gmail") {
        const result = await discoverGmail({ userId: userId as any });
        setContacts(result.contacts);
      } else if (platform === "slack") {
        const result = await discoverSlack({ userId: userId as any });
        setContacts(result.users);
      } else if (platform === "discord") {
        const result = await discoverDiscord({ userId: userId as any });
        setContacts(result.users);
      } else if (platform === "whatsapp") {
        const result = await discoverWhatsApp({ userId: userId as any });
        setContacts(result.users);
      }
    } catch (err) {
      console.error("Discover contacts failed:", err);
      toast.error("Failed to fetch contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  // WhatsApp: add a contact by phone number
  const handleAddWhatsAppContact = async () => {
    if (!whatsAppPhone.trim()) return;
    setAddingPhone(true);
    try {
      const result = await addWhatsAppContact({
        userId: userId as any,
        phoneNumber: whatsAppPhone.trim(),
        displayName: whatsAppName.trim() || undefined,
      });
      if (result.alreadyExists) {
        toast.info("This number is already added");
      } else {
        toast.success("Contact added!");
        onContactsAdded?.(1);
      }
      setWhatsAppPhone("");
      setWhatsAppName("");
      // Refresh the list
      handleDiscover();
    } catch (err) {
      console.error("Add WhatsApp contact failed:", err);
      toast.error("Failed to add contact");
    } finally {
      setAddingPhone(false);
    }
  };

  // Stable contact identifier: email for Gmail, platformUserId for Slack
  const getId = (c: Contact): string =>
    platform === "gmail"
      ? (c as GmailContact).email
      : (c as SlackUser | DiscordUser).platformUserId;

  const getLabel = (c: Contact): string =>
    platform === "gmail"
      ? (c as GmailContact).name
      : (c as SlackUser | DiscordUser).displayName;

  const getSub = (c: Contact): string => {
    if (platform === "gmail") return (c as GmailContact).email;
    if (platform === "slack") {
      const u = c as SlackUser;
      return u.email ?? u.username ?? "";
    }
    if (platform === "whatsapp") {
      const u = c as WhatsAppUser;
      return u.phoneNumber || u.platformUserId;
    }
    const u = c as DiscordUser;
    return u.username ? `@${u.username}` : "";
  };

  const toggleContact = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (!contacts) return;
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map(getId)));
  };

  const handleConfirm = async () => {
    if (!contacts || selected.size === 0) return;
    setSaving(true);
    try {
      const now = Date.now();
      const toSave = contacts.filter((c) => selected.has(getId(c)));

      for (const contact of toSave) {
        if (platform === "gmail") {
          const c = contact as GmailContact;
          await createSelected({
            userId: userId as any,
            platform: "gmail",
            platformUserId: c.email,
            displayName: c.name,
            email: c.email,
            messageCount: c.messageCount,
            firstSeenAt: c.lastMessageDate || now,
            lastSeenAt: c.lastMessageDate || now,
          });
        } else if (platform === "slack") {
          const u = contact as SlackUser;
          await createSelected({
            userId: userId as any,
            platform: "slack",
            platformUserId: u.platformUserId,
            displayName: u.displayName,
            username: u.username,
            email: u.email,
            avatar: u.avatar,
            messageCount: 0,
            firstSeenAt: now,
            lastSeenAt: now,
          });
        } else if (platform === "discord") {
          const u = contact as DiscordUser;
          await createSelected({
            userId: userId as any,
            platform: "discord",
            platformUserId: u.platformUserId,
            displayName: u.displayName,
            username: u.username,
            avatar: u.avatar,
            messageCount: 0,
            firstSeenAt: now,
            lastSeenAt: now,
          });
        } else if (platform === "whatsapp") {
          const u = contact as WhatsAppUser;
          await createSelected({
            userId: userId as any,
            platform: "whatsapp",
            platformUserId: u.platformUserId,
            displayName: u.displayName,
            phoneNumber: u.phoneNumber || u.platformUserId,
            messageCount: 0,
            firstSeenAt: now,
            lastSeenAt: now,
          });
        }
      }

      const count = toSave.length;
      toast.success(`${count} contact${count !== 1 ? "s" : ""} added`);
      onContactsAdded?.(count);
      onClose();
    } catch (err) {
      console.error("Save contacts failed:", err);
      toast.error("Failed to save contacts");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const ICON_MAP: Record<string, typeof Mail> = { gmail: Mail, slack: MessageSquare, discord: MessageSquare, whatsapp: Phone };
  const COLOR_MAP: Record<string, string> = { gmail: "text-urgent", slack: "text-chart-4", discord: "text-primary", whatsapp: "text-success" };
  const PlatformIcon = ICON_MAP[platform] ?? MessageSquare;
  const LABELS: Record<string, string> = { gmail: "Gmail", slack: "Slack", discord: "Discord", whatsapp: "WhatsApp" };
  const platformLabel = LABELS[platform] ?? platform;

  const filteredContacts = contacts?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return getLabel(c).toLowerCase().includes(q) || getSub(c).toLowerCase().includes(q);
  });

  const isEmpty = contacts !== null && contacts.length === 0;
  const hasContacts = contacts !== null && contacts.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="surface-raised rounded-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/20">
          <div className="flex items-center gap-2">
            <PlatformIcon
              className={`h-4 w-4 ${COLOR_MAP[platform] ?? "text-muted-foreground"}`}
            />
            <h3 className="text-sm font-display font-semibold text-foreground">
              Sync {platformLabel} Contacts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-5">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">
                Scanning for new contacts...
              </p>
            </div>
          ) : isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm font-medium text-foreground mb-1">
                No new contacts found
              </p>
              <p className="text-xs text-muted-foreground">
                All {platformLabel} contacts are already tracked.
              </p>
            </div>
          ) : hasContacts ? (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Found {contacts!.length} new contact
                {contacts!.length !== 1 ? "s" : ""}. Select which ones to
                track.
              </p>

              {/* Search + select all */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-border rounded-lg text-xs bg-card text-foreground focus:outline-none focus:border-primary/40 transition-all"
                  />
                </div>
                <button
                  onClick={toggleAll}
                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors whitespace-nowrap"
                >
                  {selected.size === contacts!.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              {/* Contact list */}
              <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
                {filteredContacts?.map((contact) => {
                  const id = getId(contact);
                  return (
                    <div
                      key={id}
                      onClick={() => toggleContact(id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        selected.has(id)
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/40 hover:bg-accent/30"
                      }`}
                    >
                      <Checkbox checked={selected.has(id)} />
                      <div className="w-8 h-8 rounded-lg bg-border/30 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                        {getLabel(contact)
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {getLabel(contact)}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">
                          {getSub(contact)}
                        </div>
                      </div>
                      {platform === "gmail" && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {(contact as GmailContact).messageCount} emails
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        {hasContacts && (
          <div className="flex items-center gap-2 p-5 border-t border-border/20">
            <Button
              onClick={handleConfirm}
              disabled={selected.size === 0 || saving}
              className="flex-1"
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                `Add ${selected.size} contact${selected.size !== 1 ? "s" : ""}`
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        )}

        {isEmpty && (
          <div className="flex p-5 border-t border-border/20">
            <Button
              variant="outline"
              onClick={onClose}
              size="sm"
              className="flex-1"
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
