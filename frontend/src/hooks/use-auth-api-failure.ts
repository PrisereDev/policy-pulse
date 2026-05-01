"use client";

import { useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { isUnauthorizedApiError } from "@/lib/auth-api-errors";
import { clearClientAuthState } from "@/lib/auth-session-cleanup";

/**
 * On 401 from our API (expired/invalid JWT), clear client caches and end the
 * Clerk session so the user is not left with a signed-in UI backed by dead auth.
 */
export function useAuthApiFailureHandler() {
  const queryClient = useQueryClient();
  const { signOut } = useClerk();

  return useCallback(
    async (error: unknown) => {
      if (!isUnauthorizedApiError(error)) return;
      clearClientAuthState(queryClient);
      await signOut({ redirectUrl: "/sign-in?session_expired=1" });
    },
    [queryClient, signOut]
  );
}
