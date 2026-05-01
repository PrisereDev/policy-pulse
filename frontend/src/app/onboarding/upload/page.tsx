"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCreateGapAnalysis } from "@/hooks/use-analysis";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileUploadCard } from "@/components/upload/file-upload-card";
import { Shield, ArrowRight } from "lucide-react";
import { setSkipGapUploadIntent } from "@/lib/prisere-dashboard-session";

export default function OnboardingUploadPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const createGapAnalysis = useCreateGapAnalysis();

  const clerkAnswers = user?.unsafeMetadata?.onboardingAnswers as
    | Record<string, unknown>
    | undefined;

  const onboardingAnswers = useMemo(() => {
    if (clerkAnswers) return clerkAnswers;
    if (typeof window === "undefined") return undefined;
    try {
      const stored = sessionStorage.getItem("onboardingAnswers");
      return stored ? (JSON.parse(stored) as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }, [clerkAnswers]);

  const businessLocations = useMemo(() => {
    const clerkLocations = user?.unsafeMetadata?.businessLocations as
      | Array<{ address: string; isPrimary: boolean }>
      | undefined;
    if (clerkLocations) return clerkLocations;
    if (typeof window === "undefined") return undefined;
    try {
      const stored = sessionStorage.getItem("businessLocations");
      return stored
        ? (JSON.parse(stored) as Array<{ address: string; isPrimary: boolean }>)
        : undefined;
    } catch {
      return undefined;
    }
  }, [user?.unsafeMetadata?.businessLocations]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn === false) {
      router.replace("/sign-in");
      return;
    }
    /** Answers may live only in Clerk metadata; until `user` is loaded, missing answers must not redirect. */
    if (!userLoaded) return;
    if (isSignedIn === true && !onboardingAnswers) {
      router.replace("/onboarding");
    }
  }, [isLoaded, isSignedIn, userLoaded, onboardingAnswers, router]);

  if (!isLoaded || isSignedIn !== true || !userLoaded || !onboardingAnswers) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon" />
      </div>
    );
  }

  const handleAnalyze = async () => {
    if (!policyFile || !onboardingAnswers) return;

    try {
      const result = await createGapAnalysis.mutateAsync({
        policyFile,
        riskProfile: onboardingAnswers,
        businessLocations,
      });

      await user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          hasCompletedOnboarding: true,
        },
      });
      await user?.reload();

      router.push(`/analysis/${result.job_id}?type=gap`);
    } catch (error) {
      console.error("Failed to start gap analysis:", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg flex flex-col items-center">
        <div className="mb-8">
          <Logo width={200} height={66} />
        </div>

        <h1
          className="text-center text-2xl font-bold text-prisere-dark-gray mb-2"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Now, upload your current policy
        </h1>
        <p
          className="text-center text-gray-600 mb-8"
          style={{ fontFamily: "var(--font-body)" }}
        >
          We&apos;ll scan it against your risk profile to find coverage gaps
          that could leave you exposed.
        </p>

        <div className="w-full mb-6">
          <FileUploadCard
            title="Current Insurance Policy"
            description="Upload the policy you currently have in effect"
            file={policyFile}
            onFileSelect={setPolicyFile}
            onFileRemove={() => setPolicyFile(null)}
          />
        </div>

        <Card className="w-full mb-6 bg-gray-50 border-gray-200">
          <CardContent className="p-4 flex items-start gap-3">
            <Shield className="h-5 w-5 text-prisere-teal flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              Your document is encrypted and auto-deleted after analysis. We
              never share your data.
            </p>
          </CardContent>
        </Card>

        <Button
          onClick={handleAnalyze}
          disabled={!policyFile || createGapAnalysis.isPending}
          className="w-full bg-prisere-maroon hover:bg-prisere-maroon/90 disabled:opacity-50 h-12 text-base"
        >
          {createGapAnalysis.isPending ? (
            "Uploading..."
          ) : (
            <>
              Analyze My Coverage
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        {createGapAnalysis.isError && (
          <p className="mt-4 text-sm text-red-600 text-center">
            Something went wrong. Please try again.
          </p>
        )}

        <button
          onClick={async () => {
            setSkipGapUploadIntent();
            await user?.update({
              unsafeMetadata: {
                ...user.unsafeMetadata,
                hasCompletedOnboarding: true,
              },
            });
            await user?.reload();
            router.push("/dashboard?skipGap=1");
          }}
          className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
