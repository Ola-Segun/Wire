"use client";

import { useState, useEffect } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Search } from "lucide-react";

type GmailContact = {
  email: string;
  name: string;
  messageCount: number;
  lastMessageDate: number;
};

export default function Step2() {
  const { user } = useCurrentUser();
  const router = useRouter();

  // Selection tracked by email (platformUserId) — no DB IDs needed until confirmation
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importedContacts, setImportedContacts] = useState<GmailContact[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const importContacts = useAction(api.onboarding.gmail.importContacts);
  const createSelected = useMutation(api.identities.createSelected);
  const updateStep = useMutation(api.onboarding.state.updateStep);
  const addPlatform = useMutation(api.onboarding.state.addPlatform);

  // Auto-import on first visit
  useEffect(() => {
    if (user?._id && importedContacts === null && !isImporting) {
      handleImport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const handleImport = async () => {
    if (!user?._id) return;
    setIsImporting(true);
    try {
      const result = await importContacts({ userId: user._id });
      setImportedContacts(result.contacts as GmailContact[]);
      await addPlatform({ platform: "gmail" });
    } catch (err) {
      console.error("Import error:", err);
      setImportedContacts([]);
    } finally {
      setIsImporting(false);
    }
  };

  const toggleContact = (email: string) => {
    const next = new Set(selected);
    if (next.has(email)) {
      next.delete(email);
    } else {
      next.add(email);
    }
    setSelected(next);
  };

  const toggleAll = () => {
    if (!importedContacts) return;
    if (selected.size === importedContacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importedContacts.map((c) => c.email)));
    }
  };

  const handleContinue = async () => {
    if (selected.size === 0 || !importedContacts || !user?._id) return;
    setIsSaving(true);
    try {
      // Only create DB records for the contacts the user actually selected
      for (const contact of importedContacts.filter((c) => selected.has(c.email))) {
        await createSelected({
          userId: user._id,
          platform: "gmail",
          platformUserId: contact.email,
          displayName: contact.name,
          email: contact.email,
          messageCount: contact.messageCount,
          firstSeenAt: Date.now(),
          lastSeenAt: contact.lastMessageDate,
        });
      }
      await updateStep({ step: 3 });
      router.push("/onboarding/step-3");
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredContacts = importedContacts?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
  });

  if (isImporting) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Scanning your inbox...
        </h2>
        <p className="text-muted-foreground">
          Finding people you communicate with. This may take a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-xl font-display font-bold text-foreground">
          Gmail Connected!
        </h1>
        <Badge variant="secondary" className="bg-success/10 text-success">
          Connected
        </Badge>
      </div>
      <p className="text-muted-foreground mb-6">
        We found {importedContacts?.length ?? 0} people you've emailed with. Select the
        ones you want to track as clients.
      </p>

      {/* Search and select all */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:border-primary/40"
          />
        </div>
        <Button variant="outline" size="sm" onClick={toggleAll}>
          {selected.size === importedContacts?.length ? "Deselect All" : "Select All"}
        </Button>
      </div>

      {/* Contact list */}
      <div className="space-y-2 max-h-125 overflow-y-auto">
        {filteredContacts?.map((contact) => (
          <div
            key={contact.email}
            className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-accent/30 transition ${
              selected.has(contact.email)
                ? "border-primary/30 bg-primary/5"
                : "border-border/40"
            }`}
            onClick={() => toggleContact(contact.email)}
          >
            <Checkbox checked={selected.has(contact.email)} />
            <div className="w-10 h-10 rounded-full bg-border/30 flex items-center justify-center text-sm font-semibold text-muted-foreground">
              {contact.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground truncate">{contact.name}</div>
              <div className="text-sm text-muted-foreground truncate">{contact.email}</div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                {contact.messageCount} emails
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => router.push("/onboarding/step-1")}
        >
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={selected.size === 0 || isSaving}
          size="lg"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            `Continue with ${selected.size} contact${selected.size !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </div>
  );
}
