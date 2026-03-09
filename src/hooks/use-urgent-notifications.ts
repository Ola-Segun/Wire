"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

/**
 * Watches for new urgent/unread messages and shows toast notifications.
 * Tracks message IDs to avoid duplicate notifications.
 */
export function useUrgentNotifications() {
  const urgentMessages = useQuery(api.messages.getUrgent);
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!urgentMessages) return;

    // On first load, seed the seen set so we don't toast for existing messages
    if (!initialized.current) {
      for (const msg of urgentMessages) {
        seenIds.current.add(msg._id);
      }
      initialized.current = true;
      return;
    }

    // Check for new urgent messages we haven't seen
    for (const msg of urgentMessages) {
      if (!seenIds.current.has(msg._id) && !msg.isRead) {
        seenIds.current.add(msg._id);

        const score = msg.aiMetadata?.priorityScore ?? 0;
        const clientName = msg.clientName ?? "Unknown";
        const preview =
          msg.text.length > 80 ? msg.text.slice(0, 80) + "..." : msg.text;

        if (score >= 80) {
          toast.error(`Urgent from ${clientName}`, {
            description: preview,
            duration: 8000,
          });
        } else {
          toast.warning(`Priority message from ${clientName}`, {
            description: preview,
            duration: 6000,
          });
        }
      }
    }
  }, [urgentMessages]);
}
