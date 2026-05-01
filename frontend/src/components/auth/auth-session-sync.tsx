"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { clearClientAuthState } from "@/lib/auth-session-cleanup";

/**
 * Keeps React Query + sessionStorage aligned with Clerk session after:
 * - sign out (UserButton or signOut())
 * - account deletion (Clerk ends the session; same as sign-out from our perspective)
 * - switching users in the same tab (same browser, different Clerk user id)
 *
 * Only runs cleanup on transitions (signed-in → signed-out, or user-id change),
 * not on first paint for anonymous visitors, so we avoid unnecessary work.
 */
export function AuthSessionSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const prevSignedInRef = useRef<boolean | null>(null);
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn === false) {
      if (prevSignedInRef.current === true) {
        clearClientAuthState(queryClient);
        router.refresh();
      }
      prevSignedInRef.current = false;
      prevUserIdRef.current = null;
      return;
    }

    if (isSignedIn !== true) {
      return;
    }

    if (
      prevUserIdRef.current !== null &&
      userId &&
      prevUserIdRef.current !== userId
    ) {
      clearClientAuthState(queryClient);
      router.refresh();
    }

    prevUserIdRef.current = userId ?? null;
    prevSignedInRef.current = true;
  }, [isLoaded, isSignedIn, userId, queryClient, router]);

  return null;
}
