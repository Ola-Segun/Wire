"use client";

import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Authenticated, ConvexReactClient, useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { ReactNode, useEffect } from "react";
import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <UserSync />
      {children}
    </ConvexProviderWithClerk>
  );
}

/**
 * Auto-syncs the authenticated Clerk user to Convex.
 * Runs once when the user is authenticated, creating or updating
 * the user record in the Convex database.
 */
function UserSync() {
  return (
    <Authenticated>
      <UserStoreRunner />
    </Authenticated>
  );
}

function UserStoreRunner() {
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    storeUser().catch((err) => {
      console.error("Failed to store user in Convex:", err);
    });
  }, [storeUser]);

  return null;
}







