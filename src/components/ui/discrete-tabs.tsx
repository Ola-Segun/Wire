"use client";

import { motion } from "framer-motion";

export type Tab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

interface DiscreteTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  className?: string;
  tabAlignment?: "start" | "center" | "end";
}

export function DiscreteTabs({
  tabs,
  activeTab,
  onTabChange,
  className = "",
  tabAlignment = "start",
}: DiscreteTabsProps) {
  const alignmentClass = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
  }[tabAlignment];

  return (
    <div className={`w-full flex flex-col ${className}`}>
      {/* Tab List */}
      <div className={`flex items-center gap-2 shrink-0 overflow-x-auto scrollbar-none pb-2 pt-2 px-1 ${alignmentClass}`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative px-4 py-2 text-sm font-medium rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tab-indicator"
                  className="absolute inset-0 bg-primary rounded-full shadow-sm"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className="relative z-10 block">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="relative flex-1 min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={activeTab === tab.id ? "h-full flex flex-col animate-fade-in" : "hidden"}
            role="tabpanel"
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
