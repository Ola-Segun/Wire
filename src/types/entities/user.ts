import { Id } from "../../../convex/_generated/dataModel";

export type UserId = Id<"users">;

export interface User {
  _id: UserId;
  clerkId: string;
  email: string;
  name: string;
  avatar?: string;
  timezone?: string;
  plan: "free" | "pro" | "agency";
  planStatus: "active" | "cancelled" | "trialing";
  stripeCustomerId?: string;
  subscriptionEndsAt?: number;
  preferences?: UserPreferences;
  createdAt: number;
  lastLoginAt?: number;
  onboardingCompleted: boolean;
}

export interface UserPreferences {
  dailyDigestTime?: string;
  urgencyThreshold?: number;
  notifications?: {
    email?: boolean;
    push?: boolean;
  };
}
