"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useOnboardingGuard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const hasCompleted =
    isLoaded && user?.unsafeMetadata?.hasCompletedOnboarding === true;

  const needsOnboarding =
    isLoaded && !!user && !user.unsafeMetadata?.hasCompletedOnboarding;

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
