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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, Plus, Check, Loader2, Users } from "lucide-react";

interface IdentityLinkingModalProps {
  platform: string;
  userId: string;
  open: boolean;
  onClose: () => void;
}

export function IdentityLinkingModal({
  platform,
  userId,
  open,
  onClose,
}: IdentityLinkingModalProps) {
  const [selectedIdentity, setSelectedIdentity] = useState<Record<
    string,
    any
  > | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const unlinkedIdentities = useQuery(
    api.identities.getUnlinkedByPlatform,
    open ? { userId: userId as any, platform } : "skip"
  );

  const clients = useQuery(api.clients.getByUser, open ? {} : "skip");

  const linkToClient = useMutation(api.identities.linkToClient);
  const createClient = useMutation(api.clients.createFromIdentity);

  const handleLink = async (identityId: string, clientId: string) => {
    setIsLinking(true);
    try {
      await linkToClient({
        identityId: identityId as any,
        clientId: clientId as any,
      });
      setSelectedIdentity(null);
    } catch (err) {
      console.error("Link error:", err);
    } finally {
      setIsLinking(false);
    }
  };

  const handleCreateNew = async (identityId: string) => {
    setIsLinking(true);
    try {
      await createClient({ identityId: identityId as any });
      setSelectedIdentity(null);
    } catch (err) {
      console.error("Create error:", err);
    } finally {
      setIsLinking(false);
    }
  };

  const getInitials = (name: string) =>
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  // Loading state
  if (unlinkedIdentities === undefined) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="sr-only">Loading contacts</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // No unlinked identities — all linked already
  if (unlinkedIdentities.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-500" />
              All contacts linked
            </DialogTitle>
            <DialogDescription>
              All {platform} contacts are already linked to clients.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={onClose} className="mt-2">
            Done
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  // Sub-dialog: link a specific identity to a client
  if (selectedIdentity) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link {selectedIdentity.displayName}</DialogTitle>
            <DialogDescription>
              Select an existing client to link with this {platform} contact, or
              create a new client.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {clients?.map((client: Record<string, any>) => (
              <div
                key={client._id}
                className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/30 transition"
                onClick={() =>
                  handleLink(selectedIdentity._id, client._id)
                }
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {getInitials(client.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {client.name}
                  </div>
                  {client.primaryEmail && (
                    <div className="text-xs text-muted-foreground truncate">
                      {client.primaryEmail}
                    </div>
                  )}
                </div>
                <Link2 className="h-4 w-4 text-primary" />
              </div>
            ))}
          </div>
          <div className="pt-3 border-t mt-3 space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleCreateNew(selectedIdentity._id)}
              disabled={isLinking}
            >
              {isLinking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create as new client
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setSelectedIdentity(null)}
            >
              Back
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Main dialog: list of unlinked identities
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Link {platform} contacts
          </DialogTitle>
          <DialogDescription>
            We found {unlinkedIdentities.length} unlinked{" "}
            {platform} contact{unlinkedIdentities.length !== 1 ? "s" : ""}. Link
            them to existing clients or create new ones.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {unlinkedIdentities.map((identity: Record<string, any>) => (
            <Card
              key={identity._id}
              className="border-border/40 hover:border-primary/30 cursor-pointer transition"
              onClick={() => setSelectedIdentity(identity)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-chart-4/10 flex items-center justify-center text-xs font-semibold text-chart-4">
                    {getInitials(identity.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">
                      {identity.displayName}
                    </div>
                    {identity.username && (
                      <div className="text-xs text-muted-foreground">
                        @{identity.username}
                      </div>
                    )}
                    {identity.email && (
                      <div className="text-xs text-muted-foreground/60 truncate">
                        {identity.email}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {platform}
                  </Badge>
                  <Link2 className="h-4 w-4 text-slate-300" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Skip for now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
