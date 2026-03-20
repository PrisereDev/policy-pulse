"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserButton } from "@clerk/nextjs";
import { useGapAnalysisResult } from "@/hooks/use-analysis";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import type { CoverageGap } from "@/types/api";

const GAP_TITLES: Record<string, string> = {
  flood: "Flood Insurance",
  spoilage: "Electrical Interruption (Spoilage)",
  event_cancellation: "Event Cancellation",
  eo: "Errors & Omissions (E&O)",
  cyber: "Cyber Insurance",
};

const GAP_WHY: Record<string, string> = {
  flood:
    "Your address is in a zone where standard policies typically exclude water damage. Since flood damage can be a total loss, this fills a critical gap most owners miss.",
  spoilage:
    "You have perishables. A simple 24-hour outage could wipe out your entire stock. This add-on covers the replacement cost so one storm doesn't kill your annual margins.",
  event_cancellation:
    "Your revenue is tied to local anchor events. If an event is pulled (like COVID lockdowns or local cancellations), this protects the income you've already banked on.",
  eo:
    "Since you provide expert services, a mistake or missed deadline could lead to a lawsuit. This covers legal fees and settlements that often exceed the value of the contract.",
  cyber:
    "Storing data or processing digital payments makes you a target. This covers the high cost of data recovery and legal compliance if your systems are breached.",
};

function GapCard({ gap }: { gap: CoverageGap }) {
  const [expanded, setExpanded] = useState(gap.status === "not_covered");
  const isCovered = gap.status === "covered";
  const title = GAP_TITLES[gap.type] || gap.title;
  const why = GAP_WHY[gap.type] || gap.explanation;

  return (
    <Card
      className={`border-l-4 ${
        isCovered ? "border-l-prisere-teal" : "border-l-prisere-maroon"
      }`}
    >
      <CardContent className="p-5">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            {isCovered ? (
              <CheckCircle className="h-5 w-5 text-prisere-teal flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-prisere-maroon flex-shrink-0" />
            )}
            <h3 className="font-semibold text-prisere-dark-gray">{title}</h3>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              className={
                isCovered
                  ? "bg-prisere-teal/10 text-prisere-teal border-prisere-teal/30 hover:bg-prisere-teal/10"
                  : "bg-prisere-maroon/10 text-prisere-maroon border-prisere-maroon/30 hover:bg-prisere-maroon/10"
              }
            >
              {isCovered ? "COVERED" : "NOT COVERED"}
            </Badge>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        {expanded && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-700 leading-relaxed">{why}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GapResultsContent({
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    throw error || new Error("Results not found");
  }

  const notCoveredGaps = result.gaps.filter((g) => g.status === "not_covered");
  const coveredGaps = result.gaps.filter((g) => g.status === "covered");
  const gapCount = notCoveredGaps.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Logo />
          <div className="flex items-center gap-4">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-3xl">
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold text-prisere-dark-gray mb-1"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Your Coverage Analysis
          </h1>
          {result.business_name && (
            <p className="text-lg text-gray-600">{result.business_name}</p>
          )}
        </div>

        {/* Summary banner */}
        <Card
          className={`mb-8 ${
            gapCount > 0
              ? "border-prisere-maroon/30 bg-prisere-maroon/5"
              : "border-prisere-teal/30 bg-prisere-teal/5"
          }`}
        >
          <CardContent className="p-6 text-center">
            {gapCount > 0 ? (
              <>
                <AlertTriangle className="h-8 w-8 text-prisere-maroon mx-auto mb-2" />
                <p className="text-lg font-semibold text-prisere-dark-gray">
                  We found {gapCount} potential gap
                  {gapCount !== 1 ? "s" : ""} in your coverage
                </p>
              </>
            ) : (
              <>
                <CheckCircle className="h-8 w-8 text-prisere-teal mx-auto mb-2" />
                <p className="text-lg font-semibold text-prisere-dark-gray">
                  Your policy covers all identified risks
                </p>
              </>
            )}
            {result.policy_expiration_date && (
              <p className="text-sm text-gray-600 mt-2">
                Policy expires: {result.policy_expiration_date}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gap cards */}
        {notCoveredGaps.length > 0 && (
          <div className="mb-6">
            <h2
              className="text-lg font-semibold text-prisere-dark-gray mb-4"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Coverage Gaps Identified
            </h2>
            <div className="space-y-3">
              {notCoveredGaps.map((gap) => (
                <GapCard key={gap.type} gap={gap} />
              ))}
            </div>
          </div>
        )}

        {coveredGaps.length > 0 && (
          <div className="mb-8">
            <h2
              className="text-lg font-semibold text-prisere-dark-gray mb-4"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {notCoveredGaps.length > 0
                ? "Coverage Confirmed"
                : "All Risks Covered"}
            </h2>
            <div className="space-y-3">
              {coveredGaps.map((gap) => (
                <GapCard key={gap.type} gap={gap} />
              ))}
            </div>
          </div>
        )}

        {/* Continue to scan-complete transition */}
        <div className="text-center mt-2">
          <Button
            onClick={() =>
              router.push(`/scan-complete/${resolvedParams.jobId}`)
            }
            className="bg-prisere-maroon hover:bg-prisere-maroon/90"
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function GapResultsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  return (
    <QueryErrorBoundary>
      <GapResultsContent params={params} />
    </QueryErrorBoundary>
  );
}
