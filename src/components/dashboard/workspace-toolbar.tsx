"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  Plus,
  Settings2,
  Check,
} from "lucide-react";

const SPRING = { type: "spring" as const, stiffness: 260, damping: 24, mass: 0.7 };

export interface WorkspaceToolbarProps {
  editing: boolean;
  onToggleEdit: () => void;
  onAddWidget: (type: string) => void;
  widgetRegistry: {
    type: string;
    name: string;
    icon: React.ReactNode;
    description?: string;
  }[];
}

export function WorkspaceDynamicToolbar({
  editing,
  onToggleEdit,
  onAddWidget,
  widgetRegistry,
}: WorkspaceToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="relative inline-flex flex-col items-end">
      {/* ── Pill shell — NO overflow-hidden, grows naturally with content ── */}
      <div className="h-11 rounded-full bg-card border border-border shadow-sm flex items-center">
        <AnimatePresence mode="wait" initial={false}>
          {!isExpanded ? (
            /* ── PRIMARY panel ── */
            <motion.div
              key="primary"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING}
              className="flex items-center gap-2 pl-4 pr-3 whitespace-nowrap"
            >
              <LayoutGrid className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground">Workspace</span>

              <div className="w-px h-5 bg-border/60" />

              <button
                onClick={() => setIsExpanded(true)}
                className="flex items-center gap-1 h-8 pl-3 pr-2.5 rounded-full bg-muted/80 hover:bg-accent transition-colors text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <span>Customize</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            </motion.div>
          ) : (
            /* ── SECONDARY panel ── */
            <motion.div
              key="secondary"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING}
              className="flex items-center gap-2 px-2 whitespace-nowrap"
            >
              {/* Back */}
              <button
                onClick={() => {
                  setIsExpanded(false);
                  setShowPicker(false);
                }}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-muted hover:bg-accent transition-colors shrink-0"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>

              {/* Add Widget */}
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>Add Widget</span>
              </button>

              {/* Edit / Done */}
              <button
                onClick={() => {
                  onToggleEdit();
                  setIsExpanded(false);
                  setShowPicker(false);
                }}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-colors shrink-0 ${
                  editing
                    ? "bg-green-500 text-white hover:bg-green-500/90"
                    : "border border-border bg-muted hover:bg-accent text-muted-foreground hover:text-foreground"
                }`}
              >
                {editing ? (
                  <>
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>Done</span>
                  </>
                ) : (
                  <>
                    <Settings2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Edit</span>
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Widget picker dropdown ── */}
      <AnimatePresence>
        {showPicker && isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[calc(100%+8px)] right-0 z-50 bg-card border border-border rounded-2xl shadow-xl p-3 w-72"
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              Add Widget
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {widgetRegistry.map((w) => (
                <button
                  key={w.type}
                  onClick={() => {
                    onAddWidget(w.type);
                    setShowPicker(false);
                    setIsExpanded(false);
                  }}
                  className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-accent transition-colors text-left"
                >
                  <span className="text-primary shrink-0">{w.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{w.name}</p>
                    {w.description && (
                      <p className="text-[9px] text-muted-foreground truncate">{w.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}