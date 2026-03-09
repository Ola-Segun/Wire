import { Id } from "../../../convex/_generated/dataModel";
import { Platform } from "./client";

export type MessageId = Id<"messages">;

export interface Message {
  _id: MessageId;
  userId: Id<"users">;
  clientId: Id<"clients">;
  platformIdentityId: Id<"platform_identities">;
  platform: Platform;
  platformMessageId: string;
  threadId?: string;
  text: string;
  attachments?: Attachment[];
  timestamp: number;
  direction: "inbound" | "outbound";
  aiMetadata?: AIMetadata;
  aiProcessed: boolean;
  aiProcessedAt?: number;
  isRead: boolean;
  isStarred: boolean;
  userRepliedAt?: number;
}

export interface Attachment {
  type: "image" | "file" | "video";
  url: string;
  filename?: string;
}

export interface AIMetadata {
  priorityScore?: number;
  sentiment?: "positive" | "neutral" | "negative" | "frustrated";
  urgency?: "low" | "normal" | "high" | "urgent";
  extractedActions?: string[];
  topics?: string[];
  entities?: string[];
  scopeCreepDetected?: boolean;
  suggestedReply?: string;
}
