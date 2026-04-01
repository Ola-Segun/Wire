"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Sparkles, Send, Loader2, MessageSquare, X,
  Clock, ChevronDown, ExternalLink, Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const QUICK_QUESTIONS = [
  "What's the current project status?",
  "Any payment discussions recently?",
  "What did the client say about the deadline?",
  "Any scope change requests?",
  "What was agreed in the last conversation?",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  sources?: Array<{ id: string; text: string; timestamp: number; platform: string }>;
  timestamp: number;
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-urgent";
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wide">Confidence</span>
      <div className="flex-1 h-1 rounded-full bg-border/40">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground/50">{pct}%</span>
    </div>
  );
}

export function ConversationalQA({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const askAction = useAction(api.ai.conversationQA.ask);
  const history = useQuery(api.ai.conversationQA.getHistory, { limit: 10 });
  const quota = useQuery(api.ai.conversationQA.getDailyQuota);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendQuestion = useCallback(async (question: string) => {
    if (!question.trim() || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const result = await askAction({ question });
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: result.answer,
        confidence: result.confidence,
        sources: result.sourceMessages,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: err.message?.includes("limit") ? "Daily Q&A limit reached (15/day). Try again tomorrow." : "Something went wrong. Please try again.",
        confidence: 0,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, askAction]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  };

  return (
    <div className={`surface-raised rounded-xl flex flex-col overflow-hidden ${compact ? "h-full" : "h-[520px]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">AI Assistant</p>
            {quota && (
              <p className="text-[10px] text-muted-foreground/50 font-mono">
                {quota.remaining}/{quota.limit} questions today
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <Clock className="w-3 h-3" />
          History
          <ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* History panel */}
      <AnimatePresence>
        {showHistory && history && history.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-border/30 overflow-hidden shrink-0"
          >
            <div className="p-3 space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 mb-2">
                Recent questions
              </p>
              {history.map((session: any) => (
                <button
                  key={session._id}
                  onClick={() => { sendQuestion(session.question); setShowHistory(false); }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <p className="text-xs text-foreground line-clamp-1">{session.question}</p>
                  <p className="text-[10px] text-muted-foreground/50 line-clamp-1 mt-0.5">{session.answer}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-primary/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/70">Ask me anything</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                I'll search your message history to answer
              </p>
            </div>
            {/* Quick questions */}
            <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
              {QUICK_QUESTIONS.slice(0, compact ? 3 : 5).map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendQuestion(q)}
                  className="text-[11px] px-2.5 py-1.5 rounded-full border border-border/50 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all text-muted-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "user" ? (
              <div className="max-w-[80%] bg-primary/10 border border-primary/20 rounded-xl rounded-br-sm px-3.5 py-2.5">
                <p className="text-sm text-foreground">{msg.content}</p>
              </div>
            ) : (
              <div className="max-w-[90%] bg-card border border-border/40 rounded-xl rounded-bl-sm px-3.5 py-2.5">
                <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                {typeof msg.confidence === "number" && msg.content.length > 20 && (
                  <ConfidenceBar confidence={msg.confidence} />
                )}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">Sources</p>
                    {msg.sources.slice(0, 3).map((src, i) => (
                      <div key={src.id} className="flex items-start gap-1.5 text-[10px] text-muted-foreground/60">
                        <span className="font-mono font-bold text-primary/50 shrink-0">[{i + 1}]</span>
                        <span className="line-clamp-1">{src.text}</span>
                        <span className="shrink-0 font-mono opacity-60">{src.platform}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border/40 rounded-xl rounded-bl-sm px-3.5 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Searching your messages…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/30 px-3 py-3">
        <div className="flex items-end gap-2 glass rounded-xl px-3 py-2 border border-border/40 focus-within:border-primary/40 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your conversations…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none resize-none max-h-24 scrollbar-thin"
            style={{ minHeight: "20px" }}
          />
          <button
            onClick={() => sendQuestion(input)}
            disabled={!input.trim() || loading || (quota?.remaining === 0)}
            className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all"
          >
            <Send className="w-3.5 h-3.5 text-primary" />
          </button>
        </div>
        {quota?.remaining === 0 && (
          <p className="text-[10px] text-urgent/70 text-center mt-1">Daily limit reached. Resets at midnight.</p>
        )}
      </div>
    </div>
  );
}
