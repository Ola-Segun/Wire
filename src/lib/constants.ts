// Platform definitions
export const PLATFORMS = ["gmail", "slack", "whatsapp", "discord"] as const;
export type PlatformType = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<PlatformType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  whatsapp: "WhatsApp",
  discord: "Discord",
};

export const PLATFORM_COLORS: Record<PlatformType, string> = {
  gmail: "#EA4335",
  slack: "#4A154B",
  whatsapp: "#25D366",
  discord: "#5865F2",
};

// Subscription plans
export const PLANS = {
  free: {
    name: "Free",
    maxPlatforms: 1,
    maxClients: 5,
    aiFeatures: false,
    price: 0,
  },
  pro: {
    name: "Pro",
    maxPlatforms: Infinity,
    maxClients: Infinity,
    aiFeatures: true,
    price: 29,
  },
  agency: {
    name: "Agency",
    maxPlatforms: Infinity,
    maxClients: Infinity,
    aiFeatures: true,
    price: 79,
  },
} as const;

// Priority thresholds
export const PRIORITY_THRESHOLDS = {
  critical: 90,
  high: 70,
  medium: 50,
  low: 0,
} as const;

// Relationship health thresholds
export const HEALTH_THRESHOLDS = {
  excellent: 90,
  good: 70,
  needs_attention: 50,
  at_risk: 30,
  critical: 0,
} as const;

// Session timeout (4 hours in ms)
export const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;

// Session status thresholds
export const SESSION_STATUS = {
  active: 7, // days
  dormant: 30, // days
} as const;
