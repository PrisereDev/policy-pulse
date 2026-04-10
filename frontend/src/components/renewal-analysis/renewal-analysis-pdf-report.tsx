import { forwardRef } from "react";
import { GAP_TITLES } from "@/components/gap-analysis/gap-analysis-card";
import { inferGapUpdateStatus } from "@/components/gap-analysis/gap-update-inference";
import {
  computeRenewalDisplay,
  formatChangeBadgeLabel,
  getChangeTone,
  policyChangeBadgeClass,
  renewalValueClass,
} from "@/components/gap-analysis/policy-change-formatting";
import { SectionLabel } from "@/components/gap-analysis/section-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CoverageGap } from "@/types/api";
import type { AnalysisResult } from "@/types/analysis";
import { AlertTriangle, CheckCircle, MapPin, Minus } from "lucide-react";

function formatPremiumDelta(result: AnalysisResult): string {
  const pct = result.premium_comparison.percentage_change;
  if (pct === null || pct === undefined) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function PdfPolicyChangeBlock({ change }: { change: AnalysisResult["changes"][number] }) {
  const tone = getChangeTone(change);
  const renewalDisplay = computeRenewalDisplay(change);

  const LeadingIcon =
    tone === "good" ? (
      <CheckCircle className="h-5 w-5 text-prisere-teal flex-shrink-0" />
    ) : tone === "bad" ? (
      <AlertTriangle className="h-5 w-5 text-prisere-maroon flex-shrink-0" />
    ) : (
      <Minus className="h-5 w-5 text-prisere-mustard flex-shrink-0" />
    );

  const borderClass =
    tone === "good"
      ? "border-l-4 border-l-prisere-teal"
      : tone === "bad"
        ? "border-l-4 border-l-prisere-maroon"
        : "border-l-4 border-l-prisere-mustard";

  return (
    <Card
      className={`${borderClass} break-inside-avoid border border-gray-200/80 bg-white shadow-none`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {LeadingIcon}
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-prisere-dark-gray text-base leading-snug break-words">
                <span className="text-gray-500 line-through font-normal">
                  {change.baseline_value}
                </span>
                <span className="text-gray-400 mx-1.5 font-normal">→</span>
                <span className={renewalValueClass(change)}>{renewalDisplay}</span>
              </p>
              <h3 className="text-sm font-medium text-gray-600">{change.title}</h3>
            </div>
          </div>
          <Badge className={policyChangeBadgeClass(change)}>
            {formatChangeBadgeLabel(change)}
          </Badge>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          {change.description?.trim() ? (
            <p className="text-sm text-gray-700 leading-relaxed">{change.description.trim()}</p>
          ) : null}
          {change.affected_locations && change.affected_locations.length > 0 ? (
            <div
              className={
                change.description?.trim()
                  ? "mt-4 flex flex-wrap gap-2"
                  : "mt-3 flex flex-wrap gap-2"
              }
            >
              {change.affected_locations.map((loc) => (
                <span
                  key={loc}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  {loc}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PdfGapUpdateBlock({
  gap,
  changes,
}: {
  gap: CoverageGap;
  changes: AnalysisResult["changes"];
}) {
  const title = GAP_TITLES[gap.type] || gap.title;
  const updateStatus = inferGapUpdateStatus(gap, changes);
  const badgeLabel =
    updateStatus === "now_covered" ? "Now covered" : "Still not covered";
  const badgeClass =
    updateStatus === "now_covered"
      ? "bg-prisere-teal/10 text-prisere-teal border border-prisere-teal/30 font-normal"
      : "bg-rose-100/90 text-prisere-maroon border border-rose-200/80 font-normal";
  const borderClass =
    updateStatus === "now_covered"
      ? "border-l-4 border-l-prisere-teal"
      : "border-l-4 border-l-prisere-maroon";

  const subtitle = gap.explanation?.trim();

  return (
    <Card
      className={`${borderClass} break-inside-avoid border border-gray-200/80 bg-white shadow-none`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-prisere-dark-gray">{title}</h3>
            {subtitle ? (
              <p className="text-sm text-gray-600 mt-1 leading-snug">{subtitle}</p>
            ) : null}
          </div>
          <Badge className={badgeClass}>{badgeLabel}</Badge>
        </div>
        {gap.affected_locations && gap.affected_locations.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
            {gap.affected_locations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                {loc}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export type RenewalAnalysisPdfReportProps = {
  businessName: string;
  comparedLabel: string | null;
  result: AnalysisResult;
  sortedGapItems: CoverageGap[];
  gapsNowCoveredCount: number | null;
};

export const RenewalAnalysisPdfReport = forwardRef<
  HTMLDivElement,
  RenewalAnalysisPdfReportProps
>(function RenewalAnalysisPdfReport(
  {
    businessName,
    comparedLabel,
    result,
    sortedGapItems,
    gapsNowCoveredCount,
  },
  ref
) {
  const subtitle = comparedLabel
    ? `${businessName} — Compared ${comparedLabel} policy vs. renewal quote`
    : `${businessName} — Policy vs. renewal quote comparison`;

  return (
    <div
      ref={ref}
      className="w-[8.5in] max-w-[8.5in] box-border bg-gray-50 px-10 py-8 text-prisere-dark-gray [&_*]:!cursor-default"
      style={{
        fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
        backgroundColor: "rgb(249, 250, 251)",
        color: "rgb(17, 24, 39)",
      }}
    >
      <header className="mb-8 pb-6 border-b border-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Prisere-logo-transparent.png"
          alt="PRISERE"
          width={120}
          height={40}
          className="object-contain mb-4 h-10 w-auto max-w-[120px]"
        />
        <p className="text-sm font-medium text-gray-700">{businessName}</p>
        {comparedLabel ? (
          <p className="text-xs text-gray-500 mt-1">Comparison date: {comparedLabel}</p>
        ) : null}
      </header>

      <h1
        className="text-2xl font-bold text-prisere-dark-gray mb-2"
        style={{ fontFamily: "var(--font-heading), ui-serif, Georgia, serif" }}
      >
        Renewal Analysis
      </h1>
      <p className="text-sm text-gray-600 mb-8">{subtitle}</p>

      <div className="grid gap-4 grid-cols-3 mb-10">
        <Card className="border-gray-200/90 bg-white shadow-none break-inside-avoid">
          <CardContent className="p-5 text-center">
            <p className="text-2xl font-semibold tabular-nums text-prisere-dark-gray">
              {result.summary.total_changes}
            </p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
              Changes found
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200/90 bg-white shadow-none break-inside-avoid">
          <CardContent className="p-5 text-center">
            <p
              className={`text-2xl font-semibold tabular-nums ${
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
        <Card className="border-gray-200/90 bg-white shadow-none break-inside-avoid">
          <CardContent className="p-5 text-center">
            <p className="text-2xl font-semibold tabular-nums text-prisere-dark-gray">
              {gapsNowCoveredCount === null ? "—" : gapsNowCoveredCount}
            </p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
              Gaps now covered
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <SectionLabel>What changed in your renewal</SectionLabel>
        <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5">
          {result.changes.map((change, index) => (
            <PdfPolicyChangeBlock
              key={change.id || `change-${index}`}
              change={change}
            />
          ))}
        </div>
      </div>

      {sortedGapItems.length > 0 ? (
        <div className="mb-4">
          <SectionLabel>Coverage gap update</SectionLabel>
          <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5">
            {sortedGapItems.map((g, idx) => (
              <PdfGapUpdateBlock
                key={`${g.type}-${g.title}-${idx}`}
                gap={g}
                changes={result.changes}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
