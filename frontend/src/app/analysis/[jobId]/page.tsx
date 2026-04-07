"use client";

import { use, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAnalysisStatus, useAnalysisResult, useGapAnalysisResult } from "@/hooks/use-analysis";
import { Logo } from "@/components/brand/logo";
import { LoadingSpinner } from "@/components/brand/loading-spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UserButton } from "@clerk/nextjs";
import { educationalTips } from "@/mocks/analysis-data";

const processingSteps = [
  { progress: 15, message: "Reading your current policy..." },
  { progress: 35, message: "Analyzing coverage sections..." },
  { progress: 50, message: "Reading your renewal policy..." },
  { progress: 75, message: "Comparing coverage changes..." },
  { progress: 90, message: "Generating your report..." },
  { progress: 100, message: "Complete!" },
];

export default function AnalysisPage({ params }: { params: Promise<{ jobId: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedParams = use(params);
  const analysisType = searchParams.get("type");
  const [currentStep, setCurrentStep] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);
  
  const isGap = analysisType === "gap";
  const { data: analysisJob } = useAnalysisStatus(resolvedParams.jobId);
  const isCompleted = analysisJob?.status === "completed";

  const { data: comparisonResult } = useAnalysisResult(
    resolvedParams.jobId,
    isCompleted && !isGap,
    true
  );

  const { data: gapResult } = useGapAnalysisResult(
    resolvedParams.jobId,
    isCompleted && isGap,
  );

  const result = isGap ? gapResult : comparisonResult;

  useEffect(() => {
    if (isCompleted && result) {
      const destination = isGap
        ? `/dashboard?new=true`
        : `/results/${resolvedParams.jobId}`;
      router.push(destination);
      return;
    }

    // Simulate processing steps for UI (independent of real status)
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= processingSteps.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, 3000); // 3 seconds per step

    // Rotate educational tips
    const tipInterval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % educationalTips.length);
    }, 5000); // 5 seconds per tip

    return () => {
      clearInterval(stepInterval);
      clearInterval(tipInterval);
    };
  }, [analysisJob?.status, result, resolvedParams.jobId, router]);

  const currentProgress = processingSteps[currentStep];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Logo />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="text-center mb-12">
          <h1 
            className="text-3xl font-bold text-prisere-dark-gray mb-4"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Analyzing your policies
          </h1>
          <p 
            className="text-lg text-gray-600"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            This usually takes 90-120 seconds
          </p>
        </div>

        {/* Progress Section */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex items-center justify-center mb-6">
              <LoadingSpinner size="lg" color="maroon" />
            </div>
            
            <div className="space-y-4">
              <p className="text-center text-lg font-medium text-prisere-dark-gray">
                {currentProgress.message}
              </p>
              
              <Progress value={currentProgress.progress} className="h-3" />
              
              <p className="text-center text-sm text-gray-500">
                {currentProgress.progress}% complete
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Educational Content */}
        <Card className="bg-prisere-teal/5 border-prisere-teal/20">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl mb-3">
                {educationalTips[currentTip].icon}
              </div>
              <h3 className="font-semibold text-prisere-dark-gray mb-2"
                  style={{ fontFamily: 'var(--font-heading)' }}>
                {educationalTips[currentTip].title}
              </h3>
              <p className="text-gray-700" style={{ fontFamily: 'var(--font-body)' }}>
                {educationalTips[currentTip].content}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            You can close this window and return later. We&apos;ll save your results.
          </p>
        </div>
      </main>
    </div>
  );
}