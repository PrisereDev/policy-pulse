"use client";

import { use, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserButton } from "@clerk/nextjs";
import { useGapAnalysisResult } from "@/hooks/use-analysis";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import {
  CheckCircle,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function ScanCompleteContent({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const {
    data: result,
    isLoading,
    error,
  } = useGapAnalysisResult(resolvedParams.jobId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const gapCount = useMemo(() => {
    if (!result) return 0;
    return result.gaps.filter((g) => g.status === "not_covered").length;
  }, [result]);

  const expirationInfo = useMemo(() => {
    if (!result?.policy_expiration_date) return null;
    const days = daysUntil(result.policy_expiration_date);
    if (days > 45) return null;
    return {
      date: formatDate(result.policy_expiration_date),
      daysAway: days,
    };
  }, [result]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    throw error || new Error("Results not found");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Logo />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-2xl">
        {/* Success confirmation */}
        <div className="text-center mb-10">
          <CheckCircle className="h-14 w-14 text-prisere-teal mx-auto mb-4" />
          <h1
            className="text-3xl font-bold text-prisere-dark-gray mb-3"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Scan complete
          </h1>
          <p
            className="text-lg text-gray-600"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {gapCount > 0
              ? `We found ${gapCount} coverage gap${gapCount !== 1 ? "s" : ""} for ${result.business_name}. Your results are saved to your dashboard.`
              : `Your policy covers all identified risks for ${result.business_name}. Your results are saved to your dashboard.`}
          </p>
        </div>

        {/* Policy expiration callout */}
        {expirationInfo && (
          <Card className="mb-8 border-prisere-mustard/40 bg-prisere-mustard/10">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="rounded-full bg-prisere-mustard/15 p-2 flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-prisere-mustard" />
              </div>
              <div>
                <p className="font-semibold text-prisere-dark-gray">
                  Policy expires {expirationInfo.date}
                </p>
                <p className="text-sm text-gray-600 mt-0.5">
                  That&apos;s {expirationInfo.daysAway} day
                  {expirationInfo.daysAway !== 1 ? "s" : ""} from today.
                  We&apos;ll remind you when it&apos;s time to upload your
                  renewal.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* What's next */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2
              className="text-lg font-semibold text-prisere-dark-gray mb-5"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              What&apos;s next
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-prisere-maroon text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-medium text-prisere-dark-gray">
                    Review your gap details on the dashboard
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-gray-300 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="text-gray-400">
                    When your renewal arrives, upload it to compare what changed
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-gray-300 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <p className="text-gray-400">
                    We&apos;ll email you when it&apos;s time to upload your
                    renewal
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-prisere-maroon hover:bg-prisere-maroon/90 h-11"
          >
            Go to dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full h-11" asChild>
            <Link href={`/gap-results/${resolvedParams.jobId}`}>
              View full results
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function ScanCompletePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  return (
    <QueryErrorBoundary>
      <ScanCompleteContent params={params} />
    </QueryErrorBoundary>
  );
}
