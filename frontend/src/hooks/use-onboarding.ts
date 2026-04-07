"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useOnboardingGuard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const raw = user?.unsafeMetadata?.hasCompletedOnboarding;
  const completedFlag =
    raw === true || String(raw) === "true";

  const hasCompleted = isLoaded && completedFlag;

  const needsOnboarding =
    isLoaded && !!user && !completedFlag;

  useEffect(() => {
    if (needsOnboarding) {
      router.push("/onboarding");
    }
  }, [needsOnboarding, router]);

  return {
    isOnboarded: hasCompleted,
    isLoading: !isLoaded || !user || needsOnboarding,
  };
}
