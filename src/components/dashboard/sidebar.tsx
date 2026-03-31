"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  LayoutDashboard,
  LayoutGrid,
  PanelTop,
  Inbox,
  Users,
  Settings,
  Zap,
  X,
  Activity,
  Brain,
  CalendarDays,
} from "lucide-react";
import { healthColor, healthBg } from "@/lib/helpers";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspace", label: "Workspace", icon: LayoutGrid },
  { href: "/bento", label: "Bento", icon: PanelTop, beta: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, beta: true },
  { href: "/pulse", label: "Pulse", icon: Activity, beta: true },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/skills", label: "AI Skills", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const clients = useQuery(api.clients.getByUser, { sortBy: "recent" });

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-transform duration-300 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:static md:z-auto`}
      >
        {/* Header */}
        <div className="p-5 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center glow-primary">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="text-lg font-display font-bold text-gradient">
              Wire
            </span>
          </Link>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors md:hidden"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {(item as any).beta && (
                  <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/70">
                    Beta
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Clients section */}
        <div className="mt-6 px-3 flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
              Clients
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/40">
              {clients?.length ?? 0}
            </span>
          </div>

          <div className="overflow-y-auto scrollbar-thin flex-1 space-y-0.5">
            {clients?.map((client: Record<string, any>) => {
              const initials = client.name
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .slice(0, 2);

              const health = client.relationshipHealth ?? 50;
              const status: "healthy" | "attention" | "at-risk" =
                health >= 70 ? "healthy" : health >= 40 ? "attention" : "at-risk";

              return (
                <Link
                  key={client._id}
                  href={`/clients/${client._id}`}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 group ${
                    pathname === `/clients/${client._id}`
                      ? "bg-sidebar-accent"
                      : "hover:bg-sidebar-accent/50"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${healthBg(status)} ${healthColor(status)}`}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-sidebar-foreground truncate">
                      {client.name}
                    </p>
                    {/* Health bar */}
                    <div className="w-full h-1 rounded-full bg-border/30 mt-1">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          status === "healthy"
                            ? "bg-success"
                            : status === "attention"
                              ? "bg-warning"
                              : "bg-urgent animate-pulse-glow"
                        }`}
                        style={{ width: `${health}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono ${healthColor(status)}`}>
                    {health}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-[10px] text-muted-foreground/40 text-center font-mono">
            Wire v0.1
          </div>
        </div>
      </aside>
    </>
  );
}
