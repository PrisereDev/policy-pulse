"use client";

import { useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { clearClientAuthState } from "@/lib/auth-session-cleanup";

/**
 * Explicit sign-out that clears React Query + sessionStorage before Clerk ends the session.
 * AuthSessionSync also runs cleanup when isSignedIn flips to false — clearing first avoids
 * a brief flash of cached dashboard/analysis data after the user clicks Sign out.
 */
export function useSignOutWithCleanup() {
  const { signOut } = useClerk();
  const queryClient = useQueryClient();

  return async function signOutFully() {
    clearClientAuthState(queryClient);
    await signOut({ redirectUrl: "/" });
  };
}
