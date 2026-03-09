"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";
import { Link2, Plus, Check, ArrowRight, Loader2, Users } from "lucide-react";

type SlackUser = {
  platformUserId: string;
  displayName: string;
  username?: string;
  email?: string;
  avatar?: string;
};

export default function Step4() {
  const { user } = useCurrentUser();
  const router = useRouter();

  const [selectedSlackUser, setSelectedSlackUser] = useState<SlackUser | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isImportingSlack, setIsImportingSlack] = useState(false);

  // Full workspace list from API — never stored to DB until user links a user
  const [importedSlackUsers, setImportedSlackUsers] = useState<SlackUser[] | null>(null);

  const gmailContacts = useQuery(
    api.identities.getSelectedByPlatform,
    user?._id ? { userId: user._id, platform: "gmail" } : "skip"
  );

  // Only Slack identities that already exist in DB (i.e. previously linked).
  // Used to restore linked state on page refresh without re-storing everything.
  const linkedSlackIdentities = useQuery(
    api.identities.listByPlatform,
    user?._id ? { userId: user._id, platform: "slack" } : "skip"
  );

  const importSlackUsers = useAction(api.onboarding.slack.importUsers);
  const createSelected = useMutation(api.identities.createSelected);
  const linkToClient = useMutation(api.identities.linkToClient);
  const createClient = useMutation(api.clients.createFromIdentity);
  const updateStep = useMutation(api.onboarding.state.updateStep);

  const onboardingState = useQuery(api.onboarding.state.get);
  const hasSlack = onboardingState?.connectedPlatforms?.includes("slack");

  // platformUserIds of Slack users already linked to a client
  const linkedPlatformUserIds = new Set(
    (linkedSlackIdentities ?? [])
      .filter((i: Record<string, any>) => i.clientId)
      .map((i: Record<string, any>) => i.platformUserId as string)
  );

  // Auto-import Slack users on first visit
  useEffect(() => {
    if (user?._id && hasSlack && importedSlackUsers === null && !isImportingSlack) {
      setIsImportingSlack(true);
      importSlackUsers({ userId: user._id })
        .then((result) => setImportedSlackUsers((result as any).users as SlackUser[]))
        .catch((err) => {
          console.error("Slack import error:", err);
          setImportedSlackUsers([]);
        })
        .finally(() => setIsImportingSlack(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, hasSlack]);

  const handleLink = async (slackUser: SlackUser, gmailContactId: string) => {
    if (!user?._id) return;
    setIsLinking(true);
    try {
      // Create the Slack identity only at link time — not during import
      const slackIdentityId = await createSelected({
        userId: user._id,
        platform: "slack",
        platformUserId: slackUser.platformUserId,
        displayName: slackUser.displayName,
        username: slackUser.username,
        email: slackUser.email,
        avatar: slackUser.avatar,
        messageCount: 0,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
      });

      const gmailContact = gmailContacts?.find(
        (c: Record<string, any>) => c._id === gmailContactId
      );

      if (gmailContact?.clientId) {
        await linkToClient({
          identityId: slackIdentityId as any,
          clientId: gmailContact.clientId,
        });
      } else {
        const clientId = await createClient({ identityId: gmailContactId as any });
        await linkToClient({
          identityId: slackIdentityId as any,
          clientId: clientId as any,
        });
      }
      setSelectedSlackUser(null);
    } catch (err) {
      console.error("Link error:", err);
    } finally {
      setIsLinking(false);
    }
  };

  const handleCreateNew = async (slackUser: SlackUser) => {
    if (!user?._id) return;
    setIsLinking(true);
    try {
      const slackIdentityId = await createSelected({
        userId: user._id,
        platform: "slack",
        platformUserId: slackUser.platformUserId,
        displayName: slackUser.displayName,
        username: slackUser.username,
        email: slackUser.email,
        avatar: slackUser.avatar,
        messageCount: 0,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
      });
      await createClient({ identityId: slackIdentityId as any });
      setSelectedSlackUser(null);
    } catch (err) {
      console.error("Create error:", err);
    } finally {
      setIsLinking(false);
    }
  };

  const handleContinue = async () => {
    // Auto-create clients for any unlinked selected Gmail contacts
    if (gmailContacts) {
      for (const contact of gmailContacts) {
        if (!contact.clientId) {
          try {
            await createClient({ identityId: contact._id });
          } catch {
            // May already exist
          }
        }
      }
    }
    await updateStep({ step: 5 });
    router.push("/onboarding/step-5");
  };

  // If no Slack connected, auto-create clients and skip
  if (!hasSlack) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-display font-bold text-foreground mb-2">
          Setting up your clients
        </h1>
        <p className="text-muted-foreground mb-8">
          We're creating client profiles from your selected contacts.
        </p>

        <div className="space-y-3">
          {gmailContacts?.map((contact: Record<string, any>) => (
            <Card key={contact._id}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-border/30 flex items-center justify-center text-sm font-semibold text-muted-foreground">
                    {contact.displayName
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase() || "?"}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{contact.displayName}</div>
                    <div className="text-sm text-muted-foreground">{contact.email}</div>
                  </div>
                  <Badge variant="secondary">Gmail</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="outline" onClick={() => router.push("/onboarding/step-3")}>
            Back
          </Button>
          <Button onClick={handleContinue} size="lg">
            Create Clients & Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (isImportingSlack) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <Loader2 className="h-12 w-12 animate-spin mx-auto text-purple-500 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Importing Slack users...
        </h2>
        <p className="text-muted-foreground">
          Fetching your workspace members. This may take a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-display font-bold text-foreground mb-2">
        Link Slack users to your contacts
      </h1>
      <p className="text-muted-foreground mb-8">
        Match Slack users to Gmail contacts so all their messages appear under
        one client profile.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Gmail Contacts */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Your Contacts (Gmail)
          </h2>
          <div className="space-y-2 max-h-100 overflow-y-auto">
            {gmailContacts?.map((contact: Record<string, any>) => (
              <Card key={contact._id} className="border-border/40">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-urgent/10 flex items-center justify-center text-xs font-semibold text-urgent">
                      {contact.displayName
                        ?.split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground truncate">
                        {contact.displayName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {contact.email}
                      </div>
                    </div>
                    {contact.clientId && (
                      <Check className="h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Right: Slack Users */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <MessageSquareIcon className="h-5 w-5 text-muted-foreground" />
            Slack Users
          </h2>
          <div className="space-y-2 max-h-100 overflow-y-auto">
            {importedSlackUsers?.map((slackUser) => {
              const isLinked = linkedPlatformUserIds.has(slackUser.platformUserId);
              return (
                <Card
                  key={slackUser.platformUserId}
                  className={`border-border/40 transition ${
                    isLinked
                      ? "opacity-60 cursor-default"
                      : "hover:border-primary/30 cursor-pointer"
                  }`}
                  onClick={() => !isLinked && setSelectedSlackUser(slackUser)}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-chart-4/10 flex items-center justify-center text-xs font-semibold text-chart-4">
                        {slackUser.displayName
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {slackUser.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {slackUser.username && `@${slackUser.username}`}
                        </div>
                        {slackUser.email && (
                          <div className="text-xs text-muted-foreground/60 truncate">
                            {slackUser.email}
                          </div>
                        )}
                      </div>
                      {isLinked ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Link2 className="h-4 w-4 text-slate-300" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Link Dialog */}
      <Dialog open={!!selectedSlackUser} onOpenChange={() => setSelectedSlackUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link {selectedSlackUser?.displayName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Select a Gmail contact to link with this Slack user, or create a new client.
          </p>
          <div className="space-y-2 max-h-75 overflow-y-auto">
            {gmailContacts?.map((contact: Record<string, any>) => (
              <div
                key={contact._id}
                className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-accent/30 transition"
                onClick={() => handleLink(selectedSlackUser!, contact._id)}
              >
                <div className="w-8 h-8 rounded-full bg-urgent/10 flex items-center justify-center text-xs font-semibold text-urgent">
                  {contact.displayName
                    ?.split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{contact.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">{contact.email}</div>
                </div>
                <Link2 className="h-4 w-4 text-primary" />
              </div>
            ))}
          </div>
          <div className="pt-3 border-t mt-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleCreateNew(selectedSlackUser!)}
              disabled={isLinking}
            >
              {isLinking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create as new client
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push("/onboarding/step-3")}>
          Back
        </Button>
        <Button onClick={handleContinue} size="lg">
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MessageSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
