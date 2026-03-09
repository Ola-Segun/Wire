"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface PendingMessage {
  _id: string;
  text: string;
  timestamp: number;
  direction: "outbound";
  platform: string;
  isRead: true;
  isStarred: false;
  isPending: true;
  isFailed?: boolean;
  threadId?: string;
}

interface ReplyComposerProps {
  message: Record<string, any>;
  client: Record<string, any>;
  onClose: () => void;
  onOptimisticSend?: (pending: PendingMessage) => void;
  onSendComplete?: (pendingId: string) => void;
  onSendFailed?: (pendingId: string) => void;
}

export function ReplyComposer({ message, client, onClose, onOptimisticSend, onSendComplete, onSendFailed }: ReplyComposerProps) {
  const [text, setText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, any> | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const analyzeWriting = useAction(api.ai["writing_assistant"].analyzeWriting);
  const rewriteWithTone = useAction(api.ai["writing_assistant"].rewriteWithTone);
  const adjustFormality = useAction(api.ai["writing_assistant"].adjustFormality);
  const simplifyClarify = useAction(api.ai["writing_assistant"].simplifyClarify);
  // generateReply: api.ai.actions was removed — stub until AI wiring phase
  // const generateReply = useAction(api.ai.actions.generateReply);
  const sendGmail = useAction(api.send.gmail.sendMessage);
  const sendSlack = useAction(api.send.slack.sendMessage);
  const sendWhatsApp = useAction(api.send.whatsapp.sendMessage);
  const sendDiscord = useAction(api.send.discord.sendMessage);

  // Dynamic send dispatch — add new platforms here
  const SEND_ACTIONS: Record<string, typeof sendGmail> = {
    gmail: sendGmail,
    slack: sendSlack,
    whatsapp: sendWhatsApp,
    discord: sendDiscord,
  };

  // Auto-focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Debounced analysis
  const triggerAnalysis = useCallback(
    (content: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (content.length < 10) {
        setAnalysis(null);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsAnalyzing(true);
        try {
          const result = await analyzeWriting({
            text: content,
            clientId: client._id,
            context: {
              isReply: true,
              originalMessage: message.text,
            },
          });
          setAnalysis(result);
        } catch (err) {
          console.error("Analysis failed:", err);
        } finally {
          setIsAnalyzing(false);
        }
      }, 500);
    },
    [analyzeWriting, client._id, message.text]
  );

  const handleTextChange = (value: string) => {
    setText(value);
    triggerAnalysis(value);
  };

  const handleGenerateSuggestion = async () => {
    // TODO: Wire to AI module when generateReply is implemented
    // The api.ai.actions module was removed; this will be reconnected in the AI phase
    console.warn("AI Draft: generateReply not yet wired");
    setIsSending(false);
  };

  const handleApplySuggestion = async (suggestion: Record<string, any>) => {
    setIsAnalyzing(true);
    try {
      let newText = text;
      switch (suggestion.action) {
        case "rewrite_tone": {
          newText = await rewriteWithTone({
            text,
            targetTone: "professional",
          });
          break;
        }
        case "adjust_formality": {
          newText = await adjustFormality({
            text,
            targetLevel: analysis?.formality?.recommendation ?? 3,
          });
          break;
        }
        case "simplify": {
          newText = await simplifyClarify({ text });
          break;
        }
        default:
          break;
      }
      if (typeof newText === "string") {
        setText(newText);
        triggerAnalysis(newText);
      }
    } catch (err) {
      console.error("Apply suggestion failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    setSendError(null);

    const trimmedText = text.trim();
    const pendingId = `pending-${Date.now()}`;

    // Optimistic: show the message immediately in the conversation
    onOptimisticSend?.({
      _id: pendingId,
      text: trimmedText,
      timestamp: Date.now(),
      direction: "outbound",
      platform: message.platform,
      isRead: true,
      isStarred: false,
      isPending: true,
      threadId: message.threadId,
    });

    // Clear text immediately for fast perceived response
    setText("");

    try {
      const sendArgs = {
        userId: client.userId,
        clientId: client._id,
        platformIdentityId: message.platformIdentityId,
        text: trimmedText,
        inReplyToMessageId: message._id,
      };

      if (message.platform === "gmail") {
        await sendGmail(sendArgs);
      } else if (message.platform === "slack") {
        await sendSlack(sendArgs);
      } else if (message.platform === "whatsapp") {
        await sendWhatsApp(sendArgs);
      } else if (message.platform === "discord") {
        await sendDiscord(sendArgs);
      } else {
        throw new Error(`Sending not supported for ${message.platform}`);
      }

      onSendComplete?.(pendingId);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err: any) {
      console.error("Send failed:", err);
      setSendError(err.message || "Failed to send message");
      onSendFailed?.(pendingId);
      // Restore text so user can retry
      setText(trimmedText);
    } finally {
      setIsSending(false);
    }
  };

  const hasGrammarErrors = analysis?.grammar?.errorCount > 0;

  const toneEmojis: Record<string, string> = {
    professional: "briefcase",
    casual: "wave",
    apologetic: "pensive",
    confident: "muscle",
    defensive: "shield",
    friendly: "handshake",
    cold: "snowflake",
    urgent: "zap",
  };

  return (
    <div className="space-y-4">
      {/* Original message context */}
      <div className="p-3 bg-slate-50 border rounded-lg">
        <p className="text-xs text-slate-500 mb-1">Replying to {client.name}:</p>
        <p className="text-sm text-slate-600 line-clamp-2">{message.text}</p>
      </div>

      {/* Composer */}
      <div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={`Reply to ${client.name}...`}
          className="w-full min-h-[150px] p-4 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {isAnalyzing && (
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing...
          </div>
        )}
      </div>

      {/* AI Analysis Panel */}
      {analysis && text.length >= 10 && (
        <Card className="border-blue-100">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Sparkles className="h-4 w-4 text-blue-500" />
                Writing Assistant
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowAnalysis(!showAnalysis)}
              >
                {showAnalysis ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>

            {showAnalysis && (
              <div className="space-y-3">
                {/* Tone */}
                {analysis.tone && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-16">Tone</span>
                    <Badge
                      variant="outline"
                      className="text-xs capitalize"
                    >
                      {analysis.tone.primaryTone}
                    </Badge>
                    {analysis.tone.appropriateness && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          analysis.tone.appropriateness === "high"
                            ? "text-emerald-600 border-emerald-200"
                            : analysis.tone.appropriateness === "medium"
                              ? "text-amber-600 border-amber-200"
                              : "text-red-600 border-red-200"
                        }`}
                      >
                        {analysis.tone.appropriateness === "high"
                          ? "Good"
                          : analysis.tone.appropriateness === "medium"
                            ? "OK"
                            : "Improve"}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Clarity */}
                {analysis.clarity && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-16">Clarity</span>
                    <div className="flex-1 max-w-[120px] h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          analysis.clarity.score >= 80
                            ? "bg-emerald-500"
                            : analysis.clarity.score >= 60
                              ? "bg-amber-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${analysis.clarity.score}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-600">
                      {analysis.clarity.score}/100
                    </span>
                  </div>
                )}

                {/* Formality */}
                {analysis.formality && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-16">Formal</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={`w-4 h-2 rounded-sm ${
                            level <= analysis.formality.level
                              ? "bg-blue-500"
                              : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-slate-500">
                      Level {analysis.formality.level}
                    </span>
                    {analysis.formality.recommendation &&
                      analysis.formality.recommendation !== analysis.formality.level && (
                        <span className="text-xs text-blue-500">
                          (suggested: {analysis.formality.recommendation})
                        </span>
                      )}
                  </div>
                )}

                {/* Grammar errors */}
                {hasGrammarErrors && (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      {analysis.grammar.errorCount} grammar{" "}
                      {analysis.grammar.errorCount === 1 ? "error" : "errors"}
                    </span>
                  </div>
                )}

                {/* Suggestions */}
                {analysis.suggestions && analysis.suggestions.length > 0 && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs text-slate-500 font-medium">
                      Suggestions
                    </p>
                    {analysis.suggestions.map(
                      (suggestion: Record<string, any>, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded"
                        >
                          <div className="min-w-0">
                            <p className="text-xs text-slate-700">
                              {suggestion.message}
                            </p>
                            <p className="text-xs text-slate-500">
                              {suggestion.suggestion}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 shrink-0"
                            onClick={() => handleApplySuggestion(suggestion)}
                            disabled={isAnalyzing}
                          >
                            Apply
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send feedback */}
      {sendError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {sendError}
        </div>
      )}
      {sendSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center justify-between">
          <span>Message sent successfully!</span>
          <button
            onClick={onClose}
            className="text-xs text-emerald-600 hover:text-emerald-800 underline ml-2"
          >
            Close
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSuggestion}
            disabled={isSending}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            AI Draft
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!text.trim() || hasGrammarErrors || isSending || sendSuccess}
            onClick={handleSend}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            {isSending ? "Sending..." : "Send Reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
