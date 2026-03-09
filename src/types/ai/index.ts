/**
 * AI Service types for priority scoring, sentiment, and action extraction.
 */

export interface PriorityResult {
  score: number;
  reasoning: string;
  factors: PriorityFactor[];
}

export interface PriorityFactor {
  type:
    | "urgency_keywords"
    | "deadline_mentioned"
    | "negative_sentiment"
    | "high_value_client"
    | "follow_up"
    | "business_impact";
  weight: number;
}

export interface SentimentResult {
  sentiment: "positive" | "neutral" | "negative" | "frustrated";
  sentimentScore: number; // -100 to +100
  confidence: number; // 0 to 1
  indicators: string[];
  recommendation?: string;
}

export interface ActionItem {
  action: string;
  deadline?: string;
  priority: "low" | "medium" | "high";
  category?: string;
  status: "extracted" | "confirmed" | "completed" | "dismissed";
}

export interface ActionExtractionResult {
  actions: ActionItem[];
}

export interface WritingAnalysis {
  tone: ToneAnalysis;
  clarity: ClarityAnalysis;
  grammar: GrammarCheck;
  formality: FormalityAnalysis;
  clientMatch: ClientStyleMatch;
  readerReaction: ReaderReactionPrediction;
  suggestions: WritingSuggestion[];
}

export interface ToneAnalysis {
  primaryTone: string;
  intensity: number;
  secondaryTones: string[];
  emotionalSignals: string[];
  appropriateness: "low" | "medium" | "high";
  reasoning: string;
}

export interface ClarityAnalysis {
  score: number;
  readingLevel: string;
  issues: ClarityIssue[];
  strengths: string[];
  overallAssessment: string;
}

export interface ClarityIssue {
  type: "wordiness" | "jargon" | "unclear" | "passive_voice" | "complex_sentence";
  sentence: string;
  suggestion: string;
  severity: "low" | "medium" | "high";
}

export interface GrammarCheck {
  errors: GrammarError[];
  errorCount: number;
}

export interface GrammarError {
  type: "grammar" | "spelling" | "punctuation";
  errorText: string;
  position: [number, number];
  suggestions: string[];
  explanation: string;
  severity: "critical" | "important" | "minor";
}

export interface FormalityAnalysis {
  level: number; // 1-5
  indicators: string[];
  recommendation: number;
  reasoning: string;
}

export interface ClientStyleMatch {
  matchScore: number;
  mismatches: StyleMismatch[];
  strengths: string[];
  overallFit: "good" | "needs_adjustment" | "poor";
}

export interface StyleMismatch {
  aspect: string;
  yourStyle: string;
  clientPreference: string;
  suggestion: string;
}

export interface ReaderReactionPrediction {
  predictedReaction: "positive" | "neutral" | "concerned" | "frustrated" | "angry";
  confidence: number;
  reasoning: string[];
  riskFactors: string[];
  recommendations: string[];
}

export interface WritingSuggestion {
  type: "tone" | "clarity" | "formality" | "grammar";
  severity: "low" | "medium" | "high";
  message: string;
  suggestion: string;
  action: "rewrite_tone" | "adjust_formality" | "simplify" | "fix_grammar";
  targetTone?: string;
  targetLevel?: number;
}

export interface RelationshipHealth {
  score: number; // 0-100
  factors: {
    responseTimeTrend: number;
    sentimentTrend: number;
    communicationFrequency: number;
    paymentHistory: number;
    scopeAdherence: number;
    negativeIncidents: number;
  };
  threshold: "excellent" | "good" | "needs_attention" | "at_risk" | "critical";
}
