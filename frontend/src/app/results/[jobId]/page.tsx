"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/brand/logo";
import { resolveBusinessDisplayName } from "@/lib/business-display-name";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GapAnalysisCard } from "@/components/gap-analysis/gap-analysis-card";
import { RenewalPolicyChangeCard } from "@/components/gap-analysis/policy-change-card";
import { SectionLabel } from "@/components/gap-analysis/section-label";
import {
  countGapsNewlyCovered,
  inferGapUpdateStatus,
} from "@/components/gap-analysis/gap-update-inference";
import { RenewalAnalysisPdfReport } from "@/components/renewal-analysis/renewal-analysis-pdf-report";
import {
  useAnalysisHistory,
  useAnalysisResult,
  useGapAnalysisResult,
} from "@/hooks/use-analysis";
import {
  buildRenewalAnalysisFilename,
  generateRenewalAnalysisPdf,
} from "@/lib/renewal-analysis-pdf";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import type { AnalysisJob, CoverageGap } from "@/types/api";

function isGapAnalysisJob(a: AnalysisJob): boolean {
  return !a.renewal_filename || String(a.renewal_filename).trim() === "";
}

function formatPremiumDelta(result: {
  premium_comparison: {
    difference: number | null;
    percentage_change: number | null;
  };
}): string {
  const pct = result.premium_comparison.percentage_change;
  if (pct === null || pct === undefined) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function ResultsContent({ params }: { params: Promise<{ jobId: string }> }) {
  const resolvedParams = use(params);
  const { user } = useUser();
  const { data: result, isLoading, error } = useAnalysisResult(
    resolvedParams.jobId
  );

  const { data: analyses = [] } = useAnalysisHistory();

  const latestGapJob = useMemo(() => {
    const completedGaps = analyses.filter(
      (a: AnalysisJob) => a.status === "completed" && isGapAnalysisJob(a)
    );
    if (completedGaps.length === 0) return undefined;
    return [...completedGaps].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [analyses]);

  const gapJobId = latestGapJob?.job_id ?? "";
  const gapQueryEnabled = !!latestGapJob;

  const { data: gapResult } = useGapAnalysisResult(gapJobId, gapQueryEnabled);

  const sortedGapItems = useMemo((): CoverageGap[] => {
    if (!gapResult?.gaps?.length) return [];
    return [...gapResult.gaps].sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "not_covered" ? -1 : 1;
    });
  }, [gapResult]);

  const businessDisplay = useMemo(
    () => resolveBusinessDisplayName(gapResult?.business_name, user),
    [gapResult?.business_name, user]
  );
  const businessName = businessDisplay.label;

  const comparedLabel = result?.metadata?.completed_at
    ? new Date(result.metadata.completed_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const subtitle = comparedLabel
    ? `${businessName} — Compared ${comparedLabel} policy vs. renewal quote`
    : `${businessName} — Policy vs. renewal quote comparison`;

  const gapsNowCoveredCount = useMemo(() => {
    if (!gapResult?.gaps?.length || !result?.changes) return null;
    return countGapsNewlyCovered(gapResult.gaps, result.changes);
  }, [gapResult, result]);

  const pdfReportRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    const el = pdfReportRef.current;
    if (!el) return;
    setPdfLoading(true);
    try {
      const filename = buildRenewalAnalysisFilename(businessName);
      await generateRenewalAnalysisPdf(el, filename);
    } catch (e) {
      console.error("PDF generation failed:", e);
    } finally {
      setPdfLoading(false);
    }
  }, [businessName]);

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

  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Off-screen PDF source: full expanded report for html2pdf only */}
      <div
        className="fixed left-[-14000px] top-0 z-[-10] pointer-events-none"
        aria-hidden
      >
        <RenewalAnalysisPdfReport
          ref={pdfReportRef}
          businessName={businessName}
          comparedLabel={comparedLabel}
          result={result}
          sortedGapItems={sortedGapItems}
          gapsNowCoveredCount={gapsNowCoveredCount}
        />
      </div>
      <header className="bg-white border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <Logo
              businessLabel={businessDisplay.label}
              businessLabelIsPlaceholder={businessDisplay.isPlaceholder}
            />
            <div className="flex items-center gap-4">
              {email && (
                <span className="text-sm text-gray-600 hidden sm:inline max-w-[220px] truncate">
                  {email}
                </span>
              )}
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <Link
          href="/dashboard"
          className="inline-flex text-sm text-gray-600 hover:text-prisere-maroon mb-6"
        >
          ← Back to dashboard
        </Link>

        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-prisere-dark-gray mb-2"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Renewal Analysis
          </h1>
          <p className="text-gray-600">{subtitle}</p>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-10">
          <Card className="border-gray-200/90 bg-white shadow-none">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-semibold tabular-nums text-prisere-dark-gray">
                {result.summary.total_changes}
              </p>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
                Changes found
              </p>
            </CardContent>
          </Card>
          <Card className="border-gray-200/90 bg-white shadow-none">
            <CardContent className="p-5 text-center">
              <p
                className={`text-3xl font-semibold tabular-nums ${
                  result.premium_comparison.percentage_change === null
                    ? "text-gray-500"
                    : result.premium_comparison.percentage_change! > 0
                      ? "text-prisere-maroon"
                      : result.premium_comparison.percentage_change! < 0
                        ? "text-prisere-teal"
                        : "text-prisere-dark-gray"
                }`}
              >
                {formatPremiumDelta(result)}
              </p>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
                Premium change
              </p>
            </CardContent>
          </Card>
          <Card className="border-gray-200/90 bg-white shadow-none">
            <CardContent className="p-5 text-center">
              <p className="text-3xl font-semibold tabular-nums text-prisere-dark-gray">
                {gapsNowCoveredCount === null ? "—" : gapsNowCoveredCount}
              </p>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
                Gaps now covered
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-10">
          <SectionLabel>What changed in your renewal</SectionLabel>
          <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5">
            {result.changes.map((change, index) => {
              const changeKey = change.id || `change-${index}`;
              return (
                <RenewalPolicyChangeCard key={changeKey} change={change} />
              );
            })}
          </div>
        </div>

        {sortedGapItems.length > 0 && (
          <div className="mb-10">
            <SectionLabel>Coverage gap update</SectionLabel>
            <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5">
              {sortedGapItems.map((g, idx) => (
                <GapAnalysisCard
                  key={`${g.type}-${g.title}-${idx}`}
                  gap={g}
                  defaultExpanded={false}
                  plain
                  mode="update"
                  updateStatus={inferGapUpdateStatus(g, result.changes)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-prisere-maroon hover:bg-prisere-maroon/90"
          >
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button
            variant="outline"
            type="button"
            className="border-gray-300"
            disabled={pdfLoading}
            onClick={() => void handleDownloadPdf()}
          >
            {pdfLoading ? "Generating PDF…" : "Download report"}
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function ResultsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  return (
    <QueryErrorBoundary>
      <ResultsContent params={params} />
    </QueryErrorBoundary>
  );
}
