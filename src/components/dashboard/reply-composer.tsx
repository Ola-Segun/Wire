"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Send,
  Loader2,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Zap,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface AiMetadata {
  priorityScore?: number;
  urgency?: string;
  sentiment?: string;
  extractedActions?: string[];
  scopeCreepDetected?: boolean;
  topics?: string[];
  dealSignal?: boolean;
  churnRisk?: string;
  clientIntent?: string;
  valueSignal?: string | null;
  projectPhase?: string;
}

interface ReplyComposerProps {
  message: Record<string, any>;
  client: Record<string, any>;
  onClose: () => void;
  onOptimisticSend?: (pending: PendingMessage) => void;
  onSendComplete?: (pendingId: string) => void;
  onSendFailed?: (pendingId: string) => void;
}

// ─── Context-derived phrase suggestions ───────────────────────────────────────
// Zero AI calls — derived purely from aiMetadata already on the message.
// Gives the user a head-start without waiting for any network request.

const INTENT_PHRASES: Record<string, { label: string; text: string }[]> = {
  requesting: [
    { label: "Confirm delivery", text: "I'll get that to you by " },
    { label: "Acknowledge", text: "Happy to help with this! " },
    { label: "Clarify", text: "Just to make sure I understand — " },
  ],
  approving: [
    { label: "Accept & start", text: "Great, I'll start on this right away! " },
    { label: "Confirm next step", text: "Thanks for the green light! Next up is " },
    { label: "Express thanks", text: "Much appreciated — I'll " },
  ],
  rejecting: [
    { label: "Acknowledge concern", text: "I understand your concerns about " },
    { label: "Offer alternative", text: "What if we approached it this way: " },
    { label: "Request feedback", text: "Could you help me understand what's not working? " },
  ],
  escalating: [
    { label: "Own it", text: "I take full responsibility for this. " },
    { label: "Urgent fix", text: "This is my top priority right now — " },
    { label: "Set expectation", text: "Here's exactly what I'm doing to resolve this: " },
  ],
  informing: [
    { label: "Acknowledge", text: "Thanks for the update! " },
    { label: "Noted", text: "Noted — I'll keep this in mind as we " },
    { label: "Ask next step", text: "Good to know. Would you like me to " },
  ],
};

const SENTIMENT_EXTRA: Record<string, { label: string; text: string }[]> = {
  frustrated: [
    { label: "Empathize first", text: "I completely hear you, and I want to make this right. " },
    { label: "Take ownership", text: "That's on me — let me fix this immediately. " },
  ],
  negative: [
    { label: "Turn it around", text: "I understand this isn't where we hoped to be. " },
  ],
  positive: [
    { label: "Match energy", text: "Love the enthusiasm! " },
  ],
};

// Capitalise the first letter of a string
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Strip leading command words so "please send the invoice" → "send the invoice"
function stripCommand(s: string) {
  return s.replace(/^(please |can you |could you |would you )/i, "");
}

function getPhraseSuggestions(meta: AiMetadata | undefined) {
  if (!meta) return [];
  const intent    = meta.clientIntent ?? "informing";
  const sentiment = meta.sentiment    ?? "neutral";
  const topics    = meta.topics       ?? [];
  const actions   = meta.extractedActions ?? [];
  const phase     = meta.projectPhase ?? "active";

  // 1. Topic-specific chips — most contextual, reference what was actually said
  const topicChips = topics.slice(0, 2).map((topic) => ({
    label: cap(topic),
    text: `Regarding ${topic}, `,
  }));

  // 2. Action-specific chip — if client expects something, address it directly
  const actionChips = actions.slice(0, 1).map((action) => ({
    label: "Address request",
    text: `I'll ${stripCommand(action.toLowerCase())} `,
  }));

  // 3. Phase-aware chip — delivery / negotiation have distinct openers
  const phaseChip =
    phase === "negotiation" ? { label: "Re: terms",       text: "On the terms you mentioned — " } :
    phase === "delivery"    ? { label: "Re: deliverable",  text: "Regarding the deliverable, " } :
    phase === "closing"     ? { label: "Wrap up",          text: "As we wrap things up, " } :
    null;

  // 4. Intent base chips
  const base  = INTENT_PHRASES[intent]   ?? INTENT_PHRASES.informing;
  const extra = SENTIMENT_EXTRA[sentiment] ?? [];

  // Strong negative sentiment → empathy chips come first
  const intentExtra = (sentiment === "frustrated" || sentiment === "negative")
    ? [...extra, ...base]
    : [...base, ...extra];

  const all = [
    ...topicChips,
    ...actionChips,
    ...(phaseChip ? [phaseChip] : []),
    ...intentExtra,
  ];

  // Dedupe by label (topic chips may overlap intent chips), cap at 5
  return [...new Map(all.map((p) => [p.label, p])).values()].slice(0, 5);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const INTENT_LABEL: Record<string, { label: string; color: string }> = {
  requesting:  { label: "Requesting",  color: "bg-blue-50   text-blue-700   border-blue-200" },
  approving:   { label: "Approving",   color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejecting:   { label: "Pushing back", color: "bg-orange-50  text-orange-700  border-orange-200" },
  escalating:  { label: "Escalating",  color: "bg-red-50    text-red-700    border-red-200" },
  informing:   { label: "Informing",   color: "bg-slate-50  text-slate-600  border-slate-200" },
};

const SENTIMENT_LABEL: Record<string, { label: string; dot: string }> = {
  positive:   { label: "Positive",   dot: "bg-emerald-500" },
  neutral:    { label: "Neutral",    dot: "bg-slate-400" },
  negative:   { label: "Negative",   dot: "bg-orange-500" },
  frustrated: { label: "Frustrated", dot: "bg-red-500" },
};

const URGENCY_BADGE: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high:   "bg-orange-100 text-orange-700 border-orange-200",
  normal: "",
  low:    "",
};

// ─── ReplyComposer ────────────────────────────────────────────────────────────

export function ReplyComposer({
  message,
  client,
  onClose,
  onOptimisticSend,
  onSendComplete,
  onSendFailed,
}: ReplyComposerProps) {
  const [text, setText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, any> | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [grammarWarning, setGrammarWarning] = useState(false);

  // AI Draft state
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftOptions, setDraftOptions] = useState<{ label: string; text: string }[]>([]);
  const [showDraftPicker, setShowDraftPicker] = useState(false);
  const [draftRateLimited, setDraftRateLimited] = useState(false);
  const [draftRemaining, setDraftRemaining] = useState<number | null>(null);
  const [draftFailed, setDraftFailed] = useState(false);
  const [draftSkillDisabled, setDraftSkillDisabled] = useState(false);

  // Tracks which chip was last selected while textarea was in "starter state".
  // Allows the next chip click to replace the previous one cleanly.
  const [starterChip, setStarterChip] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const meta: AiMetadata | undefined = message.aiMetadata;
  const phraseSuggestions = getPhraseSuggestions(meta);
  const intentInfo = INTENT_LABEL[meta?.clientIntent ?? "informing"];
  const sentimentInfo = SENTIMENT_LABEL[meta?.sentiment ?? "neutral"];

  const analyzeWriting   = useAction(api.ai["writing_assistant"].analyzeWriting);
  const rewriteWithTone  = useAction(api.ai["writing_assistant"].rewriteWithTone);
  const adjustFormality  = useAction(api.ai["writing_assistant"].adjustFormality);
  const simplifyClarify  = useAction(api.ai["writing_assistant"].simplifyClarify);
  const fixGrammar       = useAction(api.ai["writing_assistant"].fixGrammar);
  const generateReplies  = useAction(api.ai.onDemandSkills.generateSmartReplies);
  const sendGmail        = useAction(api.send.gmail.sendMessage);
  const sendSlack        = useAction(api.send.slack.sendMessage);
  const sendWhatsApp     = useAction(api.send.whatsapp.sendMessage);
  const sendDiscord      = useAction(api.send.discord.sendMessage);

  const SEND_ACTIONS: Record<string, typeof sendGmail> = {
    gmail:    sendGmail,
    slack:    sendSlack,
    whatsapp: sendWhatsApp,
    discord:  sendDiscord,
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Insert text at cursor position in the textarea
  const insertAtCursor = useCallback((snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + snippet);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end   = el.selectionEnd   ?? text.length;
    const next  = text.slice(0, start) + snippet + text.slice(end);
    setText(next);
    // Restore cursor after the inserted snippet
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }, [text]);

  // Chip click handler.
  // Behaviour:
  //   • Textarea is empty OR contains only a previously clicked chip (starter state)
  //     → replace the whole textarea with the new chip text, move cursor to end.
  //   • User has typed their own content beyond a chip
  //     → insert the chip text at the current cursor position (additive mode).
  const handleChipClick = useCallback((phrase: string) => {
    const inStarterState = text === "" || text === starterChip;
    if (inStarterState) {
      setText(phrase);
      setStarterChip(phrase);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        el?.focus();
        el?.setSelectionRange(phrase.length, phrase.length);
      });
    } else {
      // Additive insert at cursor — user has already written something meaningful
      insertAtCursor(phrase);
      setStarterChip(null);
    }
  }, [text, starterChip, insertAtCursor]);

  // Debounced analysis — runs in the background as the user types.
  // Results are cached in `analysis` state and displayed whenever the panel is open.
  // Minimum 20 chars before triggering (avoids firing on very short starters).
  // 1500ms debounce reduces API calls by ~50% vs the previous 700ms.
  const triggerAnalysis = useCallback(
    (content: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (content.length < 20) { setAnalysis(null); return; }

      debounceRef.current = setTimeout(async () => {
        setIsAnalyzing(true);
        try {
          const result = await analyzeWriting({
            text: content,
            clientId: client._id,
            context: { isReply: true, originalMessage: message.text },
          });
          setAnalysis(result);
        } catch (err) {
          console.error("Analysis failed:", err);
        } finally {
          setIsAnalyzing(false);
        }
      }, 1500);
    },
    [analyzeWriting, client._id, message.text]
  );

  const handleTextChange = (value: string) => {
    setText(value);
    triggerAnalysis(value);
  };

  // Opening the panel — results are already cached from background analysis,
  // shown immediately with no extra API call needed.
  const handleToggleAssistant = () => {
    setShowAssistant((prev) => !prev);
  };

  // Apply a specific writing suggestion
  const handleApply = async (action: string) => {
    setIsAnalyzing(true);
    try {
      let newText = text;
      if (action === "rewrite_tone") {
        newText = await rewriteWithTone({ text, targetTone: "professional" });
      } else if (action === "adjust_formality") {
        newText = await adjustFormality({
          text,
          targetLevel: analysis?.formality?.recommendation ?? 3,
        });
      } else if (action === "simplify") {
        newText = await simplifyClarify({ text });
      } else if (action === "fix_grammar") {
        const errors = (analysis?.grammar?.errors as Array<{ errorText: string; suggestions: string[] }> | undefined)
          ?.map((e) => ({ errorText: e.errorText, suggestions: e.suggestions ?? [] }));
        newText = await fixGrammar({ text, errors });
      } else if (action === "fix_all") {
        // Grammar → clarify → tone, in sequence
        const grammarFixed = await fixGrammar({
          text,
          errors: (analysis?.grammar?.errors as Array<{ errorText: string; suggestions: string[] }> | undefined)
            ?.map((e) => ({ errorText: e.errorText, suggestions: e.suggestions ?? [] })),
        });
        const clarified = await simplifyClarify({ text: grammarFixed });
        newText = await rewriteWithTone({ text: clarified, targetTone: "professional" });
      }
      if (typeof newText === "string") {
        setText(newText);
        triggerAnalysis(newText);
      }
    } catch (err) {
      console.error("Apply failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // AI Draft — generate 3 labeled options using generateSmartReplies
  const handleAIDraft = async () => {
    if (draftRateLimited) return;
    setIsDrafting(true);
    setShowDraftPicker(false);
    setDraftFailed(false);
    setDraftSkillDisabled(false);
    try {
      const result = await generateReplies({ messageId: message._id as any });
      if (result.skillDisabled) {
        setDraftSkillDisabled(true);
        return;
      }
      if (result.rateLimited) {
        setDraftRateLimited(true);
        setDraftRemaining(0);
        return;
      }
      if (result.remainingToday !== undefined) {
        setDraftRemaining(result.remainingToday);
      }
      if (result.replies.length > 0) {
        setDraftOptions(result.replies);
        setShowDraftPicker(true);
      } else {
        setDraftFailed(true);
      }
    } catch (err) {
      console.error("AI Draft failed:", err);
      setDraftFailed(true);
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || isSending) return;

    // Grammar warning: one-time nudge, not a hard block
    const hasErrors = analysis?.grammar?.errorCount > 0;
    if (hasErrors && !grammarWarning) {
      setGrammarWarning(true);
      return; // First click shows warning, second click sends anyway
    }

    setIsSending(true);
    setSendError(null);
    setGrammarWarning(false);

    const trimmedText = text.trim();
    const pendingId   = `pending-${Date.now()}`;

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

    setText("");
    setGrammarWarning(false);

    try {
      const sendAction = SEND_ACTIONS[message.platform];
      if (!sendAction) throw new Error(`Sending not supported for ${message.platform}`);

      await sendAction({
        userId:              client.userId,
        clientId:            client._id,
        platformIdentityId:  message.platformIdentityId,
        text:                trimmedText,
        inReplyToMessageId:  message._id,
      });

      onSendComplete?.(pendingId);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err: any) {
      console.error("Send failed:", err);
      setSendError(err.message || "Failed to send message");
      onSendFailed?.(pendingId);
      setText(trimmedText);
    } finally {
      setIsSending(false);
    }
  };

  const hasGrammarErrors = (analysis?.grammar?.errorCount ?? 0) > 0;
  const isReady = text.trim().length > 0 && !isSending && !sendSuccess;

  return (
    <div className="space-y-3">

      {/* ── 1. Replying-to context ─────────────────────────────────────── */}
      <div className="p-3 bg-slate-50 border rounded-lg text-sm">
        <p className="text-xs text-slate-400 mb-1 font-medium">
          Replying to {client.name}
        </p>
        <p className="text-slate-600 line-clamp-2 leading-snug">{message.text}</p>
      </div>

      {/* ── 2. AI Context Strip ───────────────────────────────────────────
           Surfaces the pre-computed aiMetadata instantly — zero AI calls.
           Tells the user what the AI decoded about this message so they
           know *how* to reply before they type a single word.             */}
      {meta && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          {/* Client intent */}
          {meta.clientIntent && intentInfo && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${intentInfo.color}`}>
              <MessageSquare className="h-3 w-3" />
              {intentInfo.label}
            </span>
          )}

          {/* Sentiment dot + label */}
          {meta.sentiment && sentimentInfo && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${sentimentInfo.dot}`} />
              {sentimentInfo.label}
            </span>
          )}

          {/* Urgency — only show if high or urgent */}
          {meta.urgency && URGENCY_BADGE[meta.urgency] && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${URGENCY_BADGE[meta.urgency]}`}>
              <Zap className="h-3 w-3" />
              {meta.urgency === "urgent" ? "Urgent" : "High priority"}
            </span>
          )}

          {/* Scope creep warning */}
          {meta.scopeCreepDetected && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
              <AlertTriangle className="h-3 w-3" />
              Scope creep
            </span>
          )}

          {/* Topics as chips */}
          {meta.topics && meta.topics.length > 0 && (
            <span className="text-[11px] text-slate-400">
              {meta.topics.slice(0, 3).join(" · ")}
            </span>
          )}
        </div>
      )}

      {/* ── 3. Action items to address ────────────────────────────────────
           If the AI extracted actions from the client's message, show them
           so the user knows what needs to be confirmed in the reply.       */}
      {meta?.extractedActions && meta.extractedActions.length > 0 && (
        <div className="px-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">
            Client expects you to address:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {meta.extractedActions.map((action, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200"
              >
                {action}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Phrase suggestion chips ────────────────────────────────────
           Context-aware starters derived from intent + sentiment.
           Click to insert at the cursor position — no AI call needed.    */}
      {phraseSuggestions.length > 0 && (
        <div className="px-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">
            Suggested openers:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {phraseSuggestions.map((p, i) => (
              <button
                key={i}
                onClick={() => handleChipClick(p.text)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                  starterChip === p.text
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 text-slate-600 hover:text-blue-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. AI Draft picker ────────────────────────────────────────────
           When drafts are loaded, shows labeled option cards. Selecting
           one fills the textarea. User can edit before sending.           */}
      {showDraftPicker && draftOptions.length > 0 && (
        <div className="border border-blue-100 rounded-lg bg-blue-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-blue-700 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI Draft suggestions — click to use
            </p>
            <button
              className="text-[10px] text-slate-400 hover:text-slate-600"
              onClick={() => setShowDraftPicker(false)}
            >
              Dismiss
            </button>
          </div>
          {draftOptions.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                setText(opt.text);
                setShowDraftPicker(false);
                textareaRef.current?.focus();
              }}
              className="w-full text-left p-2.5 rounded-md bg-white border border-blue-100 hover:border-blue-300 hover:bg-white transition-all group"
            >
              <p className="text-[10px] font-semibold text-blue-600 mb-0.5 group-hover:text-blue-700">
                {opt.label}
              </p>
              <p className="text-xs text-slate-600 leading-snug">{opt.text}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── 5b. Draft failed / skill disabled notice ─────────────────── */}
      {draftSkillDisabled && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Smart Replies is disabled. Enable it in{" "}
          <a href="/skills" className="underline font-medium hover:text-amber-800">
            Settings → Skills
          </a>
          .
        </div>
      )}
      {draftFailed && !showDraftPicker && !draftSkillDisabled && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Couldn&apos;t generate drafts — please try again.
        </div>
      )}

      {/* ── 6. Textarea ───────────────────────────────────────────────── */}
      <div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={`Reply to ${client.name}...`}
          className="w-full min-h-[130px] p-3.5 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        {isAnalyzing && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 px-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking…
          </div>
        )}
      </div>

      {/* ── 7. Writing Assistant (collapsed by default) ───────────────────
           Only expands when user wants it. Analysis only runs when open.
           This keeps it out of the way for fast replies.                  */}
      <div className="border rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
          onClick={handleToggleAssistant}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-600">
              Writing Assistant
            </span>
            {/* Compact status when collapsed */}
            {!showAssistant && isAnalyzing && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking…
              </span>
            )}
            {!showAssistant && !isAnalyzing && analysis && (
              <span className={`text-[11px] font-medium ${
                hasGrammarErrors
                  ? "text-red-500"
                  : analysis.suggestions?.length > 0
                    ? "text-amber-500"
                    : "text-emerald-600"
              }`}>
                {hasGrammarErrors
                  ? `· ${analysis.grammar.errorCount} error${analysis.grammar.errorCount > 1 ? "s" : ""}`
                  : analysis.suggestions?.length > 0
                    ? `· ${analysis.suggestions.length} suggestion${analysis.suggestions.length > 1 ? "s" : ""}`
                    : "· Looks good ✓"}
              </span>
            )}
          </div>
          {showAssistant ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>

        {showAssistant && (
          <div className="p-3 space-y-3 bg-white">
            {!analysis && !isAnalyzing && (
              <p className="text-xs text-slate-400 text-center py-2">
                Start typing to see suggestions…
              </p>
            )}

            {analysis && (
              <>
                {/* Status row */}
                <div className="flex items-center gap-3 flex-wrap">
                  {analysis.tone?.primaryTone && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Tone</span>
                      <span className="text-[11px] font-medium text-slate-700 capitalize">
                        {analysis.tone.primaryTone}
                      </span>
                      {analysis.tone.appropriateness && (
                        <span className={`text-[11px] font-medium ${
                          analysis.tone.appropriateness === "high" ? "text-emerald-600" :
                          analysis.tone.appropriateness === "medium" ? "text-amber-600" :
                          "text-red-600"
                        }`}>
                          {analysis.tone.appropriateness === "high" ? "✓" :
                           analysis.tone.appropriateness === "medium" ? "OK" : "!"}
                        </span>
                      )}
                    </div>
                  )}

                  {analysis.clarity?.score !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Clarity</span>
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            analysis.clarity.score >= 70 ? "bg-emerald-500" :
                            analysis.clarity.score >= 45 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${Math.max(4, analysis.clarity.score)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {analysis.clarity.score}/100
                      </span>
                    </div>
                  )}

                  {analysis.formality && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-slate-400">Formal</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <div
                            key={lvl}
                            className={`w-2.5 h-1 rounded-sm transition-colors ${
                              lvl <= analysis.formality.level
                                ? "bg-blue-500"
                                : "bg-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-slate-500">L{analysis.formality.level}</span>
                      {analysis.formality.recommendation !== analysis.formality.level && (
                        <span className="text-blue-500">→ L{analysis.formality.recommendation}</span>
                      )}
                    </div>
                  )}

                  {hasGrammarErrors && (
                    <div className="flex items-center gap-1 text-[11px] text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      {analysis.grammar.errorCount} grammar {analysis.grammar.errorCount === 1 ? "error" : "errors"}
                    </div>
                  )}
                </div>

                {/* Suggestions with inline error details */}
                {analysis.suggestions && analysis.suggestions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    {/* Fix All when multiple issues */}
                    {analysis.suggestions.length > 1 && (
                      <button
                        className="w-full text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md py-1.5 transition-colors disabled:opacity-50"
                        onClick={() => handleApply("fix_all")}
                        disabled={isAnalyzing}
                      >
                        {isAnalyzing ? "Fixing…" : `Fix all ${analysis.suggestions.length} issues`}
                      </button>
                    )}

                    {analysis.suggestions.map((s: Record<string, any>, i: number) => (
                      <div key={i} className="rounded-md border border-slate-200 overflow-hidden">
                        {/* Suggestion header row */}
                        <div className="flex items-center justify-between gap-2 p-2 bg-slate-50">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-slate-700">{s.message}</p>
                            <p className="text-[11px] text-slate-400">{s.suggestion}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[11px] h-6 px-2 shrink-0 font-medium"
                            onClick={() => handleApply(s.action)}
                            disabled={isAnalyzing}
                          >
                            {s.action === "rewrite_tone"     ? "Fix tone"         :
                             s.action === "adjust_formality" ? "Adjust formality" :
                             s.action === "simplify"         ? "Make clearer"     :
                             "Fix grammar"}
                          </Button>
                        </div>

                        {/* Grammar: each error with errorText → fix suggestion */}
                        {s.action === "fix_grammar" && analysis.grammar?.errors?.length > 0 && (
                          <div className="divide-y divide-slate-100">
                            {(analysis.grammar.errors as Array<Record<string, any>>).map((err, j) => (
                              <div key={j} className="flex items-start gap-2 px-2.5 py-1.5 bg-white">
                                <span className={`mt-0.5 shrink-0 text-[9px] font-bold uppercase px-1 py-0.5 rounded ${
                                  err.severity === "critical"  ? "bg-red-100 text-red-600"     :
                                  err.severity === "important" ? "bg-orange-100 text-orange-600" :
                                  "bg-slate-100 text-slate-500"
                                }`}>
                                  {err.type ?? "error"}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-medium text-red-600 line-through">
                                      {err.errorText}
                                    </span>
                                    {Array.isArray(err.suggestions) && err.suggestions[0] && (
                                      <span className="text-[11px] text-emerald-600 font-medium">
                                        → {err.suggestions[0]}
                                      </span>
                                    )}
                                  </div>
                                  {err.explanation && (
                                    <p className="text-[10px] text-slate-400 mt-0.5">{err.explanation}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Clarity: each identified unclear section */}
                        {s.action === "simplify" && analysis.clarity?.issues?.length > 0 && (
                          <div className="divide-y divide-slate-100">
                            {(analysis.clarity.issues as string[]).map((issue, j) => (
                              <div key={j} className="flex items-start gap-2 px-2.5 py-1.5 bg-white">
                                <span className="mt-1 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                                <p className="text-[11px] text-slate-600">{issue}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Tone: show AI reasoning + any secondary tones detected */}
                        {s.action === "rewrite_tone" && analysis.tone && (
                          <div className="divide-y divide-slate-100">
                            {analysis.tone.reasoning && (
                              <div className="flex items-start gap-2 px-2.5 py-1.5 bg-white">
                                <span className="mt-1 w-1 h-1 rounded-full bg-orange-400 shrink-0" />
                                <p className="text-[11px] text-slate-600">{analysis.tone.reasoning as string}</p>
                              </div>
                            )}
                            {Array.isArray(analysis.tone.secondaryTones) && analysis.tone.secondaryTones.length > 0 && (
                              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white">
                                <span className="text-[10px] text-slate-400">Also detected:</span>
                                <div className="flex gap-1 flex-wrap">
                                  {(analysis.tone.secondaryTones as string[]).map((t, j) => (
                                    <span key={j} className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-100">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Formality: show reasoning + indicators that triggered the flag */}
                        {s.action === "adjust_formality" && analysis.formality && (
                          <div className="divide-y divide-slate-100">
                            {analysis.formality.reasoning && (
                              <div className="flex items-start gap-2 px-2.5 py-1.5 bg-white">
                                <span className="mt-1 w-1 h-1 rounded-full bg-blue-400 shrink-0" />
                                <p className="text-[11px] text-slate-600">{analysis.formality.reasoning as string}</p>
                              </div>
                            )}
                            {Array.isArray(analysis.formality.indicators) && analysis.formality.indicators.length > 0 && (
                              <div className="flex items-start gap-2 px-2.5 py-1.5 bg-white">
                                <span className="text-[10px] text-slate-400 shrink-0">Detected:</span>
                                <div className="flex gap-1 flex-wrap">
                                  {(analysis.formality.indicators as string[]).map((ind, j) => (
                                    <span key={j} className="text-[10px] italic px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                                      "{ind}"
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 8. Grammar warning (soft, not a block) ───────────────────── */}
      {grammarWarning && (
        <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Heads up — {analysis?.grammar?.errorCount} grammar issue{analysis?.grammar?.errorCount > 1 ? "s" : ""} detected.</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-amber-700 hover:text-amber-800 text-xs h-7"
            onClick={handleSend}
          >
            Send anyway
          </Button>
        </div>
      )}

      {/* ── 9. Send feedback ─────────────────────────────────────────── */}
      {sendError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {sendError}
        </div>
      )}
      {sendSuccess && (
        <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Message sent!
          </div>
          <button onClick={onClose} className="text-xs text-emerald-600 hover:text-emerald-800 underline">
            Close
          </button>
        </div>
      )}

      {/* ── 10. Action bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAIDraft}
            disabled={isDrafting || isSending || draftRateLimited}
            className="text-xs"
            title={draftRateLimited ? "Daily AI Draft limit reached. Resets tomorrow." : undefined}
          >
            {isDrafting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isDrafting ? "Drafting…" : draftRateLimited ? "Limit reached" : "AI Draft"}
          </Button>
          {/* Show remaining daily uses — only when we have a count and not rate-limited */}
          {!draftRateLimited && draftRemaining !== null && draftRemaining <= 5 && (
            <span className="text-[10px] text-amber-500 font-medium">
              {draftRemaining} left today
            </span>
          )}
          {draftRateLimited && (
            <span className="text-[10px] text-red-500 font-medium">
              Resets tomorrow
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!isReady}
            onClick={handleSend}
            className="text-xs"
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isSending ? "Sending…" : "Send Reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
