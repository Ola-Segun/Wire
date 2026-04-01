"use client";

import { Search, X, ExternalLink, Clock, Hash } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

const PLATFORM_COLORS: Record<string, string> = {
  gmail:    "bg-red-500/20 text-red-400",
  slack:    "bg-purple-500/20 text-purple-400",
  whatsapp: "bg-green-500/20 text-green-400",
  discord:  "bg-indigo-500/20 text-indigo-400",
};

const SUGGESTIONS = [
  "Find where client mentioned budget",
  "Messages about project deadline",
  "Show payment discussions",
  "Scope change requests this week",
];

interface SmartSearchProps {
  onSearch?: (query: string) => void;
  onOpenCommandPalette?: () => void;
}

export default function SmartSearch({ onSearch, onOpenCommandPalette }: SmartSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Wire to real Convex full-text search
  const results = useQuery(
    api.messages.search,
    debouncedQuery.length >= 2 ? { query: debouncedQuery, limit: 8 } : "skip"
  );

  // Cmd+K → open command palette (or focus this input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (onOpenCommandPalette) {
          onOpenCommandPalette();
        } else {
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenCommandPalette]);

  const handleChange = useCallback((val: string) => {
    setQuery(val);
    onSearch?.(val);
  }, [onSearch]);

  const clearQuery = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    inputRef.current?.focus();
  }, []);

  const showDropdown = isFocused && (query.length >= 2 || !query);

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
          ref={inputRef}
          type="text"
          id="smart-search-input"
          placeholder="Smart search across all channels..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none w-full"
        />
        {query && (
          <button onClick={clearQuery} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground">
            <X className="w-3 h-3" />
          </button>
        )}
        <kbd
          onClick={onOpenCommandPalette}
          className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/50 border border-border/50 rounded-md px-1.5 py-0.5 shrink-0 cursor-pointer hover:border-border/80 hover:text-muted-foreground/70 transition-colors"
        >
          ⌘K
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 glass rounded-xl z-50 animate-fade-in shadow-xl overflow-hidden">
          {/* Suggestions (empty state) */}
          {!query && (
            <div className="p-1.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 px-2.5 py-1.5">
                Try asking
              </p>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left px-2.5 py-2 text-sm text-secondary-foreground hover:bg-accent hover:text-foreground rounded-lg transition-colors flex items-center gap-2"
                  onMouseDown={() => { handleChange(s); }}
                >
                  <Hash className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Live search results */}
          {query.length >= 2 && (
            <div className="p-1.5">
              {results === undefined && (
                <div className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                  Searching…
                </div>
              )}
              {results && results.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground/60 text-center">
                  No results for "{query}"
                </div>
              )}
              {results && results.length > 0 && (
                <>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 px-2.5 py-1.5">
                    {results.length} result{results.length !== 1 ? "s" : ""}
                  </p>
                  {results.map((msg: any) => (
                    <Link
                      key={msg._id}
                      href={`/clients/${msg.clientId}`}
                      className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {(msg as any).clientName ?? "Unknown"}
                          </span>
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${PLATFORM_COLORS[msg.platform] ?? "bg-muted text-muted-foreground"}`}>
                            {msg.platform}
                          </span>
                          {msg.aiMetadata?.priorityScore >= 70 && (
                            <span className="text-[9px] font-bold text-urgent">P{msg.aiMetadata.priorityScore}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {msg.text}
                        </p>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
