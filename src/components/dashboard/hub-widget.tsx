"use client";

import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Inbox, Users, Bell, CheckSquare, Loader2 } from "lucide-react";
import Link from "next/link";

const SPRING_FAST = { type: "spring" as const, stiffness: 400, damping: 35, mass: 0.5 };
const EASE_OUT_QUINT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const HUB_TABS = [
  { id: "inbox",   label: "Inbox",   icon: Inbox },
  { id: "clients", label: "Clients", icon: Users },
  { id: "skills",  label: "Skills",  icon: Bell },
  { id: "actions", label: "Actions", icon: CheckSquare },
];

// ─── Skeleton / Empty helpers ─────────────────────────────────────────────────
function HubSkeleton() {
  return (
    <div className="flex items-center justify-center h-20 gap-2 text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="text-xs">Loading…</span>
    </div>
  );
}
function HubEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-20 text-muted-foreground text-xs">{label}</div>
  );
}

// ─── Tab content components ───────────────────────────────────────────────────
function HubInboxTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No urgent messages" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 6).map((msg: any) => (
        <Link key={msg._id} href={`/clients/${msg.clientId}`}
          className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
        >
          <div className={`w-1 h-7 rounded-full shrink-0 mt-0.5 ${
            (msg.aiMetadata?.priorityScore ?? 0) >= 80 ? "bg-urgent" : "bg-primary"
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-foreground truncate">
                {msg.clientName ?? "Unknown"}
              </span>
              {msg.aiMetadata?.priorityScore && (
                <span className="text-[9px] font-mono font-bold text-urgent shrink-0">
                  P{msg.aiMetadata.priorityScore}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{msg.text}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function HubClientsTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No clients yet" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 6).map((c: any) => {
        const h = c.relationshipHealth ?? 50;
        const color = h >= 70 ? "bg-success" : h >= 40 ? "bg-warning" : "bg-urgent";
        return (
          <Link key={c._id} href={`/clients/${c._id}`}
            className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
              h >= 70 ? "bg-success/10 text-success" : h >= 40 ? "bg-warning/10 text-warning" : "bg-urgent/10 text-urgent"
            }`}>
              {c.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium text-foreground truncate block">{c.name}</span>
              <div className="w-16 h-1 rounded-full bg-border/30 mt-0.5">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${h}%` }} />
              </div>
            </div>
            <span className={`text-[9px] font-mono font-bold shrink-0 ${
              h >= 70 ? "text-success" : h >= 40 ? "text-warning" : "text-urgent"
            }`}>{h}</span>
          </Link>
        );
      })}
    </div>
  );
}

function HubSkillsTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No insights yet" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 7).map((o: any) => (
        <div key={o._id} className={`p-2 rounded-lg border transition-colors ${
          !o.isRead ? "border-primary/20 bg-primary/5" : "border-border/20"
        }`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              o.severity === "critical" ? "bg-urgent" : o.severity === "warning" ? "bg-warning" : "bg-primary"
            }`} />
            <span className="text-[11px] font-medium text-foreground truncate">{o.title}</span>
          </div>
          <p className="text-[10px] text-muted-foreground line-clamp-1 pl-3">{o.content}</p>
        </div>
      ))}
    </div>
  );
}

function HubActionsTab({ data }: { data: any[] | undefined }) {
  if (!data) return <HubSkeleton />;
  if (!data.length) return <HubEmpty label="No pending actions" />;
  return (
    <div className="space-y-1.5">
      {data.slice(0, 7).map((c: any) => (
        <Link key={c._id} href={`/clients/${c.clientId}`}
          className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors group"
        >
          <div className={`w-3.5 h-3.5 rounded border shrink-0 mt-0.5 ${
            c.isOverdue ? "border-urgent" : "border-border"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-foreground/80 line-clamp-1 group-hover:text-foreground">{c.text}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-muted-foreground truncate">{c.clientName}</span>
              {c.isOverdue && <span className="text-[9px] font-bold text-urgent">overdue</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Main hub widget ──────────────────────────────────────────────────────────
export function WireHubWidget() {
  const [activeTab, setActiveTab] = useState("inbox");

  const urgentMessages = useQuery(api.messages.getUrgent);
  const clients        = useQuery(api.clients.getByUser, { sortBy: "health" });
  const skillOutputs   = useQuery(api.skills.getOutputs, { limit: 50 });
  const commitments    = useQuery(api.commitments.getPendingWithClients);

  const activeLabel = HUB_TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <div className="surface-raised rounded-2xl h-full overflow-hidden flex flex-col shadow-sm">
      {/* Browser chrome */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3 bg-muted/30 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-border/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-border/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-border/60" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px] text-muted-foreground/60 font-medium">
            Wire Intelligence Hub · {activeLabel}
          </span>
        </div>
      </div>

      {/* Sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <LayoutGroup>
          <nav className="w-28 border-r border-border/30 p-2 flex flex-col gap-0.5 bg-muted/5 shrink-0">
            {HUB_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <>
                      <motion.div
                        layoutId="hub-tab-bg"
                        className="absolute inset-0 rounded-lg bg-background border border-border/40"
                        transition={SPRING_FAST}
                      />
                      <motion.div
                        layoutId="hub-tab-bar"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary"
                        transition={SPRING_FAST}
                      />
                    </>
                  )}
                  <tab.icon className="h-3.5 w-3.5 relative z-10 shrink-0" />
                  <span className="truncate relative z-10 font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </LayoutGroup>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.28, ease: EASE_OUT_QUINT }}
              className="absolute inset-0 overflow-y-auto p-3 scrollbar-thin"
            >
              {activeTab === "inbox"   && <HubInboxTab data={urgentMessages} />}
              {activeTab === "clients" && <HubClientsTab data={clients} />}
              {activeTab === "skills"  && <HubSkillsTab data={skillOutputs} />}
              {activeTab === "actions" && <HubActionsTab data={commitments} />}
            </motion.div>
          </AnimatePresence>
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/60 to-transparent pointer-events-none z-10" />
        </div>
      </div>
    </div>
  );
}
