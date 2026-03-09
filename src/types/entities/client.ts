import { Id } from "../../../convex/_generated/dataModel";

export type ClientId = Id<"clients">;

export interface Client {
  _id: ClientId;
  userId: Id<"users">;
  name: string;
  company?: string;
  avatar?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  totalRevenue?: number;
  currency?: string;
  tags?: string[];
  notes?: string;
  relationshipHealth?: number;
  firstContactDate: number;
  lastContactDate: number;
  totalMessages: number;
  responseTimeAvg?: number;
  communicationPattern?: CommunicationPattern;
  createdFromPlatform: Platform;
  createdFromIdentity: Id<"platform_identities">;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
}

export interface CommunicationPattern {
  preferredPlatform?: string;
  activeHours?: string;
  responseSpeed?: "fast" | "normal" | "slow";
}

export type Platform = "gmail" | "slack" | "whatsapp" | "discord";
