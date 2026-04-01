"use client";

import { useEffect, useState, useCallback } from "react";
import { Command } from "cmdk";
import { useQuery, useMutation, useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  LayoutDashboard, LayoutGrid, Inbox, Users, Brain, Settings,
  Calendar, Activity, PanelTop, Search, Sparkles, BookOpen,
  Zap, Bell, MessageSquare, ChevronRight, Loader2,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const NAV_ACTIONS = [
  { id: "nav-dashboard",  label: "Go to Dashboard",   icon: LayoutDashboard, href: "/dashboard" },
  { id: "nav-workspace",  label: "Go to Workspace",   icon: LayoutGrid,      href: "/workspace" },
  { id: "nav-inbox",      label: "Go to Inbox",        icon: Inbox,           href: "/inbox" },
  { id: "nav-clients",    label: "Go to Clients",      icon: Users,           href: "/clients" },
  { id: "nav-skills",     label: "Go to AI Skills",    icon: Brain,           href: "/skills" },
  { id: "nav-calendar",   label: "Go to Calendar",     icon: Calendar,        href: "/calendar" },
  { id: "nav-pulse",      label: "Go to Pulse",        icon: Activity,        href: "/pulse" },
  { id: "nav-bento",      label: "Go to Bento",        icon: PanelTop,        href: "/bento" },
  { id: "nav-settings",   label: "Go to Settings",     icon: Settings,        href: "/settings" },
];

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  // Data
  const clients = useQuery(api.clients.getByUser, { sortBy: "recent" });
  const unreadCount = useQuery(api.skills.getUnreadCount);
  const markAllRead = useMutation(api.skills.markAllOutputsRead);

  // Reset on close
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 glass rounded-2xl shadow-2xl border border-border/60 overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full" shouldFilter={true}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search or jump to…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
              autoFocus
            />
            <kbd className="text-[10px] font-mono text-muted-foreground/40 border border-border/40 rounded px-1.5 py-0.5">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[400px] overflow-y-auto scrollbar-thin p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground/60">
              No results found.
            </Command.Empty>

            {/* Navigation */}
            <Command.Group heading="Navigation" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground/50 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
              {NAV_ACTIONS.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.label}
                  onSelect={() => navigate(action.href)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-muted-foreground hover:text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-foreground transition-colors"
                >
                  <action.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{action.label}</span>
                  <ChevronRight className="w-3 h-3 opacity-30" />
                </Command.Item>
              ))}
            </Command.Group>

            {/* Clients */}
            {clients && clients.length > 0 && (
              <Command.Group heading="Clients" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground/50 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 mt-1">
                {clients.slice(0, 6).map((client: any) => {
                  const h = client.relationshipHealth ?? 50;
                  const color = h >= 70 ? "text-success" : h >= 40 ? "text-warning" : "text-urgent";
                  return (
                    <Command.Item
                      key={client._id}
                      value={`client ${client.name}`}
                      onSelect={() => navigate(`/clients/${client._id}`)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-muted-foreground hover:text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-foreground transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 ${color}`}>
                        {client.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="flex-1">{client.name}</span>
                      <span className={`text-[10px] font-mono ${color}`}>{h}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Quick Actions */}
            <Command.Group heading="Quick Actions" className="[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground/50 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 mt-1">
              <Command.Item
                value="mark all notifications read"
                onSelect={async () => { await markAllRead(); onClose(); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-muted-foreground hover:text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-foreground transition-colors"
              >
                <Bell className="w-4 h-4 shrink-0" />
                <span className="flex-1">Mark all notifications read</span>
                {(unreadCount ?? 0) > 0 && (
                  <span className="text-[10px] font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </Command.Item>
              <Command.Item
                value="open ai assistant conversational qa"
                onSelect={() => navigate("/workspace")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-muted-foreground hover:text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-foreground transition-colors"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="flex-1">Ask AI a question</span>
              </Command.Item>
              <Command.Item
                value="compose new message quick compose"
                onSelect={() => navigate("/inbox")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-muted-foreground hover:text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-foreground transition-colors"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="flex-1">Compose message</span>
              </Command.Item>
              <Command.Item
                value="view skills ai skills toggle"
                onSelect={() => navigate("/skills")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm text-muted-foreground hover:text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-foreground transition-colors"
              >
                <Zap className="w-4 h-4 shrink-0" />
                <span className="flex-1">Manage AI skills</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-t border-border/30 text-[10px] text-muted-foreground/40 font-mono">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>ESC close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
