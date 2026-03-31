"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Users, Loader2, Search } from "lucide-react";
import { PlatformIconRaw, PLATFORM_COLORS } from "@/lib/platform-icons";

interface AddIdentityModalProps {
  clientId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
}

export function AddIdentityModal({
  clientId,
  userId,
  open,
  onClose,
}: AddIdentityModalProps) {
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  const unlinked = useQuery(
    api.identities.getAllUnlinked,
    open ? { userId: userId as any } : "skip"
  );

  const linkToClient = useMutation(api.identities.linkToClient);

  const handleLink = async (identityId: string) => {
    setLinking(identityId);
    try {
      await linkToClient({
        identityId: identityId as any,
        clientId: clientId as any,
      });
      onClose();
    } catch (err) {
      console.error("Link error:", err);
    } finally {
      setLinking(null);
    }
  };

  const filtered = unlinked?.filter((id) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      id.displayName.toLowerCase().includes(q) ||
      id.email?.toLowerCase().includes(q) ||
      id.username?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Add connection
          </DialogTitle>
          <DialogDescription>
            Pick an unlinked contact to connect to this client.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:border-primary/40 transition-all"
          />
        </div>

        <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
          {unlinked === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered && filtered.length > 0 ? (
            filtered.map((identity) => (
              <div
                key={identity._id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/30 hover:border-primary/30 hover:bg-accent/30 transition-all cursor-pointer"
                onClick={() => !linking && handleLink(identity._id)}
              >
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                  <PlatformIconRaw
                    platform={identity.platform}
                    className={`h-4 w-4 ${PLATFORM_COLORS[identity.platform]?.text ?? "text-muted-foreground"}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {identity.displayName}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">
                    {identity.email ?? identity.username ?? identity.platformUserId}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="text-[10px] font-mono shrink-0"
                >
                  {identity.platform}
                </Badge>
                {linking === identity._id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                ) : (
                  <Link2 className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-sm">
                {search ? "No contacts match your search" : "No unlinked contacts"}
              </p>
              <p className="text-[10px] mt-1 text-muted-foreground/60">
                Connect a platform or sync new contacts in Settings
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
