import { Platform } from "../entities/client";

/**
 * Unified interface that all platform adapters must implement.
 * This ensures platform-agnostic code in the core system.
 */
export interface MessageAdapter {
  platform: Platform;

  /** Initiates OAuth flow, returns auth URL */
  authenticate(userId: string): Promise<{ authUrl: string }>;

  /** Fetches messages since a given date */
  fetchMessages(since: Date, limit: number): Promise<NormalizedMessage[]>;

  /** Sends a message through the platform */
  sendMessage(to: ContactIdentifier, content: string): Promise<{ success: boolean; platformMessageId: string }>;

  /** Lists all contacts/channels */
  getContacts(): Promise<NormalizedContact[]>;

  /** Renews expired OAuth tokens */
  refreshCredentials(): Promise<void>;

  /** Revokes tokens and cleans up */
  disconnect(): Promise<void>;

  /** Verifies connection is still active */
  healthCheck(): Promise<ConnectionHealth>;
}

export interface NormalizedMessage {
  platformMessageId: string;
  platform: Platform;
  text: string;
  timestamp: number;
  direction: "inbound" | "outbound";
  sender: ContactIdentifier;
  threadId?: string;
  attachments?: NormalizedAttachment[];
  platformData?: Record<string, unknown>;
}

export interface NormalizedContact {
  platformUserId: string;
  platform: Platform;
  displayName: string;
  email?: string;
  username?: string;
  phoneNumber?: string;
  avatar?: string;
  messageCount: number;
}

export interface ContactIdentifier {
  platform: Platform;
  platformUserId: string;
  email?: string;
  displayName?: string;
}

export interface NormalizedAttachment {
  type: "image" | "file" | "video";
  url: string;
  filename?: string;
  size?: number;
}

export interface ConnectionHealth {
  status: "active" | "expired" | "error" | "revoked";
  lastChecked: number;
  error?: string;
}
