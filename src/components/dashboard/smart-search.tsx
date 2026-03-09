"use client";

import { Search, Command } from "lucide-react";
import { useState } from "react";

interface SmartSearchProps {
  onSearch: (query: string) => void;
}

const SmartSearch = ({ onSearch }: SmartSearchProps) => {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const suggestions = [
    "Find where Sarah mentioned logo color preferences",
    "Show urgent messages from this week",
    "All action items due today",
    "Messages from Marcus about timeline",
  ];

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-3 px-3.5 py-2 rounded-xl border transition-all duration-200 ${
          isFocused
            ? "border-primary/40 glow-primary bg-secondary/80"
            : "border-border bg-card hover:border-border hover:bg-secondary/30"
        }`}
      >
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Smart search across all channels..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onSearch(e.target.value);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none w-full"
        />
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/50 border border-border/50 rounded-md px-1.5 py-0.5 shrink-0">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </div>

      {isFocused && !query && (
        <div className="absolute top-full left-0 right-0 mt-2 glass rounded-xl p-1.5 z-50 animate-fade-in shadow-xl">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 px-2.5 py-1.5">
            Try asking
          </p>
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="w-full text-left px-2.5 py-2 text-sm text-secondary-foreground hover:bg-accent hover:text-foreground rounded-lg transition-colors"
              onMouseDown={() => {
                setQuery(s);
                onSearch(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartSearch;
