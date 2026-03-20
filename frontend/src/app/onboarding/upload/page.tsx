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

export default function OnboardingUploadPage() {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
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

  useEffect(() => {
    if (!isLoaded) return;
    if (!userId) {
      router.push("/sign-in");
    } else if (!onboardingAnswers) {
      router.push("/onboarding");
    }
  }, [isLoaded, userId, onboardingAnswers, router]);

  if (!isLoaded || !userId || !onboardingAnswers) {
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
      });

      await user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          hasCompletedOnboarding: true,
        },
      });

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
          onClick={() => router.push("/dashboard")}
          className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
