import { headers } from "next/headers";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {

  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("[Clerk Webhook] CLERK_WEBHOOK_SECRET is not set");
    return new Response("Error: CLERK_WEBHOOK_SECRET is not set", { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error("[Clerk Webhook] Missing svix headers", {
      svix_id: !!svix_id,
      svix_timestamp: !!svix_timestamp,
      svix_signature: !!svix_signature,
    });
    return new Response("Error: Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("[Clerk Webhook] Verification failed:", err instanceof Error ? err.message : "unknown");
    return new Response("Error: Verification failed", { status: 400 });
  }

  const eventType = evt.type;

  try {
    if (eventType === "user.created") {
      const { id, email_addresses, first_name, last_name, image_url } = evt.data;

      if (!email_addresses || email_addresses.length === 0) {
        console.error("[Clerk Webhook] No email addresses found for user");
        return new Response("Error: No email addresses", { status: 400 });
      }

      const result = await convex.mutation(api.users.create, {
        clerkId: id,
        email: email_addresses[0].email_address,
        name: `${first_name || ""} ${last_name || ""}`.trim() || "User",
        avatar: image_url,
        plan: "free",
        planStatus: "active",
        onboardingCompleted: false,
      });

      console.log("[Clerk Webhook] user.created processed:", result);
    }

    if (eventType === "user.updated") {
      const { id, email_addresses, first_name, last_name, image_url } = evt.data;

      await convex.mutation(api.users.updateFromClerk, {
        clerkId: id,
        email: email_addresses[0].email_address,
        name: `${first_name || ""} ${last_name || ""}`.trim(),
        avatar: image_url,
      });
    }

    if (eventType === "user.deleted") {
      const { id } = evt.data;

      if (id) {
        await convex.mutation(api.users.deleteByClerkId, {
          clerkId: id,
        });
      }
    }
    return new Response("Webhook processed", { status: 200 });
  } catch (error) {
    console.error(`[Clerk Webhook] Error processing ${eventType}:`, error);
    return new Response(`Error processing webhook: ${error instanceof Error ? error.message : "Unknown error"}`, { status: 500 });
  }
}
