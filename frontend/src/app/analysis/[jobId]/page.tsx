"use client";

import { use, useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAnalysisStatus,
  useAnalysisResult,
  useGapAnalysisResult,
} from "@/hooks/use-analysis";
import {
  useMidPhaseRotatingMessage,
  useSmoothedAnalysisProgress,
} from "@/hooks/use-smoothed-analysis-progress";
import { AppLogoWithBusiness } from "@/components/brand/app-logo-with-business";
import { LoadingSpinner } from "@/components/brand/loading-spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UserButton } from "@clerk/nextjs";
import { educationalTips } from "@/mocks/analysis-data";

export default function AnalysisPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedParams = use(params);
  const analysisType = searchParams.get("type");
  const [currentTip, setCurrentTip] = useState(0);

  const isGap = analysisType === "gap";
  const { data: analysisJob, isLoading: statusLoading } = useAnalysisStatus(
    resolvedParams.jobId
  );
  const isCompleted = analysisJob?.status === "completed";
  const isFailed = analysisJob?.status === "failed";

  const { data: comparisonResult } = useAnalysisResult(
    resolvedParams.jobId,
    isCompleted && !isGap,
    true
  );

  const { data: gapResult } = useGapAnalysisResult(
    resolvedParams.jobId,
    isCompleted && isGap,
    true
  );

  const result = isGap ? gapResult : comparisonResult;

  /** Don’t show 100% until we can navigate — job may report 100 while client still loads result payload. */
  const waitingForResultPayload = isCompleted && !result;

  const rawProgress =
    typeof analysisJob?.progress === "number" && Number.isFinite(analysisJob.progress)
      ? Math.min(100, Math.max(0, analysisJob.progress))
      : 0;

  const smoothedProgress = useSmoothedAnalysisProgress(
    resolvedParams.jobId,
    analysisJob?.progress ?? undefined,
    analysisJob?.status
  );

  const midPhaseActive =
    !isFailed &&
    !isCompleted &&
    analysisJob?.status === "processing" &&
    rawProgress >= 50 &&
    rawProgress < 90;

  const rotatingMessage = useMidPhaseRotatingMessage(midPhaseActive, isGap);

  const displayProgress = useMemo(() => {
    if (statusLoading && !analysisJob) return 0;
    if (waitingForResultPayload) {
      return Math.min(smoothedProgress, 98);
    }
    return smoothedProgress;
  }, [analysisJob, statusLoading, waitingForResultPayload, smoothedProgress]);

  const displayMessage = useMemo(() => {
    if (isFailed) {
      return (
        analysisJob?.error_message ||
        "Analysis could not be completed. Please try again."
      );
    }
    if (waitingForResultPayload) {
      return "Loading your results…";
    }
    if (analysisJob?.status === "completed") {
      return "Complete!";
    }
    if (rotatingMessage) {
      return rotatingMessage;
    }
    if (analysisJob?.message) {
      return analysisJob.message;
    }
    if (!analysisJob) {
      return "Starting analysis…";
    }
    if (analysisJob.status === "pending") {
      return "Queued…";
    }
    return "Processing your policy…";
  }, [analysisJob, isFailed, waitingForResultPayload, rotatingMessage]);

  useEffect(() => {
    if (!isCompleted || !result) return;
    const destination = isGap
      ? `/dashboard?new=true&jobId=${encodeURIComponent(resolvedParams.jobId)}`
      : `/results/${resolvedParams.jobId}`;
    router.push(destination);
  }, [
    isCompleted,
    result,
    isGap,
    resolvedParams.jobId,
    router,
  ]);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % educationalTips.length);
    }, 5000);
    return () => clearInterval(tipInterval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <AppLogoWithBusiness />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="text-center mb-12">
          <h1
            className="text-3xl font-bold text-prisere-dark-gray mb-4"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {isFailed ? "Analysis stopped" : "Analyzing your policies"}
          </h1>
          <p
            className="text-lg text-gray-600"
            style={{ fontFamily: "var(--font-body)" }}
          >
            This usually takes 90–120 seconds
          </p>
        </div>

        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex items-center justify-center mb-6">
              <LoadingSpinner size="lg" color="maroon" />
            </div>

            <div className="space-y-4">
              <p className="text-center text-lg font-medium text-prisere-dark-gray">
                {displayMessage}
              </p>

              <Progress value={displayProgress} className="h-3" />

              <p className="text-center text-sm text-gray-500">
                {Math.round(displayProgress)}% complete
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-prisere-teal/5 border-prisere-teal/20">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl mb-3">
                {educationalTips[currentTip].icon}
              </div>
              <h3
                className="font-semibold text-prisere-dark-gray mb-2"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {educationalTips[currentTip].title}
              </h3>
              <p
                className="text-gray-700"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {educationalTips[currentTip].content}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            You can close this window and return later. We&apos;ll save your
            results.
          </p>
        </div>
      </main>
    </div>
  );
}
