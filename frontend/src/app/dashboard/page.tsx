"use client";

import { useAuth, useUser, UserButton } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import {
  clearSkipGapUploadIntent,
  readSkipGapUploadIntent,
  setSkipGapUploadIntent,
} from "@/lib/prisere-dashboard-session";
import { useOnboardingGuard } from "@/hooks/use-onboarding";
import { BusinessProfileModal } from "@/components/profile/business-profile-modal";
import { Logo } from "@/components/brand/logo";
import { PageHeader } from "@/components/brand/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { FileUploadCard } from "@/components/upload/file-upload-card";
import { GapAnalysisCard } from "@/components/gap-analysis/gap-analysis-card";
import {
  useAnalysisHistory,
  useGapAnalysisResult,
  useCreateAnalysis,
  useCreateGapAnalysis,
} from "@/hooks/use-analysis";
import type { AnalysisJob, CoverageGap } from "@/types/api";
import {
  AlertTriangle,
  CheckCircle,
  Plus,
  FileText,
  Clock,
  XCircle,
  ArrowRight,
  ArrowUpCircle,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

/** Single-policy gap analyses have no renewal file; renewals always have a renewal filename. */
function isGapAnalysisJob(a: AnalysisJob): boolean {
  return !a.renewal_filename || String(a.renewal_filename).trim() === "";
}

// ---------------------------------------------------------------------------
// Renewal upload section
// ---------------------------------------------------------------------------

function RenewalUploadSection() {
  const router = useRouter();
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [renewalFile, setRenewalFile] = useState<File | null>(null);
  const createAnalysis = useCreateAnalysis();

  const handleStartAnalysis = async () => {
    if (!baselineFile || !renewalFile) return;
    try {
      const result = await createAnalysis.mutateAsync({
        baselineFile,
        renewalFile,
      });
      router.push(`/analysis/${result.job_id}`);
    } catch (error) {
      console.error("Failed to start analysis:", error);
    }
  };

  return (
    <div>
      <h2
        className="text-lg font-semibold text-prisere-dark-gray mb-4"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Compare Your Insurance Renewal
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Upload your current policy and renewal quote to get a plain-language
        comparison of what changed.
      </p>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <FileUploadCard
          title="Current Policy"
          description="Upload your existing insurance policy"
          file={baselineFile}
          onFileSelect={setBaselineFile}
          onFileRemove={() => setBaselineFile(null)}
        />
        <FileUploadCard
          title="Renewal Quote"
          description="Upload your renewal policy or quote"
          file={renewalFile}
          onFileSelect={setRenewalFile}
          onFileRemove={() => setRenewalFile(null)}
        />
      </div>
      <Button
        onClick={handleStartAnalysis}
        disabled={!baselineFile || !renewalFile || createAnalysis.isPending}
        className="bg-prisere-maroon hover:bg-prisere-maroon/90 disabled:opacity-50"
      >
        {createAnalysis.isPending ? (
          "Processing..."
        ) : (
          <>
            Start Comparison
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-file drop zone (compact, for gap analysis on dashboard)
// ---------------------------------------------------------------------------

function SingleFileDropZone({
  file,
  onFileSelect,
  onFileRemove,
}: {
  file: File | null;
  onFileSelect: (f: File) => void;
  onFileRemove: () => void;
}) {
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: import("react-dropzone").FileRejection[]) => {
      if (rejectedFiles.length > 0) return;
      if (acceptedFiles.length > 0) onFileSelect(acceptedFiles[0]);
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  if (file) {
    const sizeStr =
      file.size < 1048576
        ? Math.round(file.size / 1024) + " KB"
        : Math.round(file.size / 1048576) + " MB";

    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-6 w-6 text-prisere-maroon flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{sizeStr}</p>
            </div>
          </div>
          <button
            onClick={onFileRemove}
            className="p-1 text-gray-400 hover:text-gray-600"
            type="button"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg py-8 px-6 text-center cursor-pointer transition-colors",
        isDragActive
          ? "border-prisere-maroon bg-prisere-maroon/5"
          : "border-gray-300 hover:border-gray-400"
      )}
    >
      <input {...getInputProps()} />
      <p className="text-sm font-medium text-gray-700">
        Drop your policy PDF here
      </p>
      <p className="text-xs text-gray-400 mt-1">
        or click to browse — PDF, max 10MB
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk profile summary (compact inline version for S3 dashboard)
// ---------------------------------------------------------------------------

function RiskProfileSummary({
  onEditProfile,
}: {
  onEditProfile: () => void;
}) {
  const { user } = useUser();

  const answers = user?.unsafeMetadata?.onboardingAnswers as
    | Record<string, unknown>
    | undefined;
  const locations = user?.unsafeMetadata?.businessLocations as
    | Array<{ address: string; isPrimary: boolean }>
    | undefined;

  if (!answers || !locations || locations.length === 0) return null;

  const primary = locations.find((l) => l.isPrimary) ?? locations[0];
  const otherCount = locations.length - 1;

  const riskLabels: string[] = [];
  if (answers.climate === true) riskLabels.push("Perishables");
  if (answers.events === true) riskLabels.push("Event-dependent");
  if (answers.professionalServices === true) riskLabels.push("Professional services");
  if (answers.payments === true) riskLabels.push("Digital payments");

  const businessName =
    (user?.unsafeMetadata?.businessName as string | undefined) ||
    (answers.businessName as string | undefined) ||
    (user?.firstName ? `${user.firstName}'s Business` : null);

  // Try to infer a "flood zone" label from location risk metadata if present
  const floodCount = locations.filter((l) => {
    const meta = (user?.unsafeMetadata?.locationRisks as Record<string, string[]> | undefined);
    return meta?.[l.address]?.includes("flood");
  }).length;

  const riskFactorLines: string[] = [];
  if (floodCount > 0) {
    riskFactorLines.push(`Flood zone (${floodCount}/${locations.length} locs)`);
  }
  riskFactorLines.push(...riskLabels);

  return (
    <div className="rounded-xl bg-gray-50/90 border border-gray-200/80 p-6 mt-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Your Risk Profile
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="border-gray-200/80 shadow-none bg-white">
          <CardContent className="p-4">
            <p className="font-semibold text-prisere-dark-gray text-sm">
              {businessName ?? "Your Business"}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{primary.address}</p>
            {otherCount > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                + {otherCount} other location{otherCount > 1 ? "s" : ""}
              </p>
            )}
            <button
              type="button"
              onClick={onEditProfile}
              className="text-xs text-prisere-maroon hover:text-prisere-maroon/80 font-medium mt-3 inline-block underline underline-offset-2 text-left"
            >
              Edit profile
            </button>
          </CardContent>
        </Card>

        <Card className="border-gray-200/80 shadow-none bg-white">
          <CardContent className="p-4">
            <p className="font-semibold text-prisere-dark-gray text-sm">
              Risk factors
            </p>
            {riskFactorLines.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {riskFactorLines.map((line) => (
                  <li key={line} className="text-sm text-gray-500">{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 mt-1">None detected</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No-history dashboard (S3 flow: onboarding done, no analyses yet)
// ---------------------------------------------------------------------------

function NoHistoryDashboard({
  onClearSkipIntent,
  onEditProfile,
}: {
  onClearSkipIntent: () => void;
  onEditProfile: () => void;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const createGapAnalysis = useCreateGapAnalysis();

  const riskProfile = user?.unsafeMetadata?.onboardingAnswers as
    | Record<string, unknown>
    | undefined;
  const businessLocations = user?.unsafeMetadata?.businessLocations as
    | Array<{ address: string; isPrimary: boolean }>
    | undefined;

  const handleAnalyze = async () => {
    if (!policyFile || !riskProfile) return;
    try {
      const result = await createGapAnalysis.mutateAsync({
        policyFile,
        riskProfile,
        businessLocations,
      });
      clearSkipGapUploadIntent();
      onClearSkipIntent();
      router.push(`/analysis/${result.job_id}?type=gap`);
    } catch (error) {
      console.error("Failed to start gap analysis:", error);
    }
  };

  return (
    <>
      {/* Primary CTA — gap analysis upload */}
      <Card className="mb-6 border-2 border-rose-200/90 bg-rose-50/70 shadow-sm">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-rose-100 p-3 w-14 h-14 mb-4 flex items-center justify-center">
              <ArrowUpCircle className="h-7 w-7 text-prisere-maroon" />
            </div>
            <h2
              className="text-xl font-semibold text-prisere-dark-gray mb-1"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Upload your policy to find coverage gaps
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-md">
              We&apos;ll scan it against your risk profile to identify what
              your current policy doesn&apos;t cover.
            </p>

            <div className="w-full max-w-md mb-5">
              <SingleFileDropZone
                file={policyFile}
                onFileSelect={setPolicyFile}
                onFileRemove={() => setPolicyFile(null)}
              />
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={!policyFile || createGapAnalysis.isPending}
              className="bg-prisere-maroon hover:bg-prisere-maroon/90 disabled:opacity-50 h-11 px-10 rounded-md text-white"
            >
              {createGapAnalysis.isPending ? (
                "Analyzing..."
              ) : (
                "Analyze my coverage"
              )}
            </Button>

            {createGapAnalysis.isError && (
              <p className="mt-3 text-sm text-red-600">
                Something went wrong. Please try again.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Secondary CTA — renewal comparison */}
      <div className="mb-8 rounded-lg border-2 border-dashed border-gray-300 bg-white/80 px-6 py-6 text-center">
        <p className="text-sm text-gray-600 mb-4">
          Already have a renewal quote?
        </p>
        <Button asChild variant="outline" size="sm" className="border-gray-300">
          <Link
            href="/upload"
            onClick={() => {
              clearSkipGapUploadIntent();
              onClearSkipIntent();
            }}
          >
            Compare your policies
          </Link>
        </Button>
      </div>

      {/* Risk profile summary */}
      <RiskProfileSummary onEditProfile={onEditProfile} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Prominent gap re-upload (after profile change on full dashboard)
// ---------------------------------------------------------------------------

function DashboardGapReuploadSection({
  onAnalysisStarted,
}: {
  onAnalysisStarted?: () => void;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const createGapAnalysis = useCreateGapAnalysis();

  const riskProfile = user?.unsafeMetadata?.onboardingAnswers as
    | Record<string, unknown>
    | undefined;
  const businessLocations = user?.unsafeMetadata?.businessLocations as
    | Array<{ address: string; isPrimary: boolean }>
    | undefined;

  const handleAnalyze = async () => {
    if (!policyFile || !riskProfile) return;
    try {
      const result = await createGapAnalysis.mutateAsync({
        policyFile,
        riskProfile,
        businessLocations,
      });
      onAnalysisStarted?.();
      router.push(`/analysis/${result.job_id}?type=gap`);
    } catch (error) {
      console.error("Failed to start gap analysis:", error);
    }
  };

  return (
    <Card className="mb-8 border-2 border-rose-200/90 bg-rose-50/70 shadow-sm">
      <CardContent className="p-8">
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-rose-100 p-3 w-14 h-14 mb-4 flex items-center justify-center">
            <ArrowUpCircle className="h-7 w-7 text-prisere-maroon" />
          </div>
          <h2
            className="text-xl font-semibold text-prisere-dark-gray mb-1"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Upload your policy to find coverage gaps
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md">
            We&apos;ll scan it against your updated risk profile to identify what
            your current policy doesn&apos;t cover.
          </p>
          <div className="w-full max-w-md mb-5">
            <SingleFileDropZone
              file={policyFile}
              onFileSelect={setPolicyFile}
              onFileRemove={() => setPolicyFile(null)}
            />
          </div>
          <Button
            onClick={handleAnalyze}
            disabled={!policyFile || createGapAnalysis.isPending}
            className="bg-prisere-maroon hover:bg-prisere-maroon/90 disabled:opacity-50 h-11 px-10 rounded-md text-white"
          >
            {createGapAnalysis.isPending ? "Analyzing…" : "Analyze my coverage"}
          </Button>
          {createGapAnalysis.isError && (
            <p className="mt-3 text-sm text-red-600">
              Something went wrong. Please try again.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stat tiles
// ---------------------------------------------------------------------------

function StatTiles({
  gapCount,
  locationCount,
  daysUntilExpiry,
}: {
  gapCount: number;
  locationCount: number;
  daysUntilExpiry: number | null;
}) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
      <Card className="border-gray-200/90 bg-gray-100/80 shadow-none">
        <CardContent className="p-5 text-center">
          <p className="text-3xl font-semibold tabular-nums text-prisere-mustard">
            {gapCount}
          </p>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
            Gaps found
          </p>
        </CardContent>
      </Card>
      <Card className="border-gray-200/90 bg-gray-100/80 shadow-none">
        <CardContent className="p-5 text-center">
          <p className="text-3xl font-semibold tabular-nums text-prisere-mustard">
            {locationCount}
          </p>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
            Location{locationCount !== 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>
      <Card className="border-gray-200/90 bg-gray-100/80 shadow-none sm:col-span-1 col-span-1">
        <CardContent className="p-5 text-center">
          <p className="text-3xl font-semibold tabular-nums text-prisere-mustard">
            {daysUntilExpiry !== null ? `${daysUntilExpiry}d` : "—"}
          </p>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
            Until expiry
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renewal countdown + upload CTA (prominence scales as expiry approaches)
// ---------------------------------------------------------------------------

const RENEWAL_UPLOAD_COPY =
  "Upload your renewal quote to compare what changed and check if your gaps are covered.";

function RenewalCountdownSection({
  daysAway,
}: {
  /** When null/undefined, expiry headline is omitted; instructional text + button still show. */
  daysAway?: number | null;
}) {
  const hasExpiry = typeof daysAway === "number" && !Number.isNaN(daysAway);

  const urgency = !hasExpiry
    ? "unknown"
    : daysAway <= 14
      ? "critical"
      : daysAway <= 30
        ? "high"
        : daysAway <= 60
          ? "medium"
          : "low";

  const uploadBtn = (
    <Button
      asChild
      className="bg-prisere-maroon hover:bg-prisere-maroon/90 text-white w-fit shrink-0"
    >
      <Link href="/upload">Upload renewal quote</Link>
    </Button>
  );

  const copy = (
    <div className="min-w-0 flex-1">
      {hasExpiry && (
        <p
          className={cn(
            "font-semibold text-prisere-dark-gray",
            urgency === "critical" && "text-lg"
          )}
        >
          Your policy expires in {daysAway} day{daysAway !== 1 ? "s" : ""}.
        </p>
      )}
      <p
        className={cn(
          "text-sm text-gray-600",
          hasExpiry && "mt-1"
        )}
      >
        {RENEWAL_UPLOAD_COPY}
      </p>
      <div className={cn(hasExpiry ? "mt-4" : "mt-1")}>{uploadBtn}</div>
    </div>
  );

  const iconWrap = (
    <div
      className={cn(
        "rounded-full p-2 flex-shrink-0 self-start",
        urgency === "unknown" && "bg-amber-100",
        urgency === "low" && "bg-gray-100",
        urgency === "medium" && "bg-prisere-mustard/15",
        (urgency === "high" || urgency === "critical") && "bg-amber-100"
      )}
    >
      <AlertTriangle
        className={cn(
          "h-5 w-5",
          urgency === "unknown" && "text-amber-700",
          urgency === "low" && "text-gray-400",
          urgency === "medium" && "text-prisere-mustard",
          (urgency === "high" || urgency === "critical") && "text-amber-700"
        )}
      />
    </div>
  );

  if (urgency === "unknown") {
    return (
      <Card className="border-amber-200/90 bg-amber-50/90 shadow-sm rounded-lg">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            {iconWrap}
            {copy}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (urgency === "low") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
        <div className="flex items-start gap-3">
          {iconWrap}
          {copy}
        </div>
      </div>
    );
  }

  if (urgency === "medium") {
    return (
      <Card className="border-prisere-mustard/35 bg-amber-50/50 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {iconWrap}
            {copy}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "border-amber-200/90 shadow-md",
        urgency === "critical"
          ? "bg-amber-50 ring-2 ring-amber-300/60"
          : "bg-amber-50/90"
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          {iconWrap}
          {copy}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Analysis history row (compact)
// ---------------------------------------------------------------------------

const statusConfig: Record<
  string,
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  processing: {
    icon: Clock,
    color: "bg-yellow-100 text-yellow-800",
    label: "Processing",
  },
  completed: {
    icon: CheckCircle,
    color: "bg-green-100 text-green-800",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "bg-red-100 text-red-800",
    label: "Failed",
  },
};

function AnalysisHistoryRow({ analysis }: { analysis: AnalysisJob }) {
  const config = statusConfig[analysis.status] ?? statusConfig.failed;
  const StatusIcon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(analysis.created_at), {
    addSuffix: true,
  });
  const gap = isGapAnalysisJob(analysis);
  const title = gap ? "Coverage gap analysis" : "Renewal comparison";
  const detailLine = gap
    ? `${analysis.baseline_filename}`
    : `${analysis.baseline_filename} · ${analysis.renewal_filename ?? "renewal"}`;

  const href =
    analysis.status === "completed"
      ? gap
        ? `/scan-complete/${analysis.job_id}`
        : `/results/${analysis.job_id}`
      : analysis.status === "processing"
        ? gap
          ? `/analysis/${analysis.job_id}?type=gap`
          : `/analysis/${analysis.job_id}`
        : undefined;

  return (
    <div className="flex items-center justify-between py-4 border-b last:border-b-0 border-gray-100">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-prisere-dark-gray">
              {title}
            </p>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide border-gray-200 text-gray-500 font-normal"
            >
              {gap ? "Gap" : "Renewal"}
            </Badge>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{detailLine}</p>
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <Badge variant="outline" className={config.color}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
        {href && (
          <Link
            href={href}
            className="text-sm text-prisere-maroon hover:text-prisere-maroon/80 font-medium underline underline-offset-2"
          >
            View
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard content
// ---------------------------------------------------------------------------

function DashboardContent() {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileUpdatedBanner, setProfileUpdatedBanner] = useState(false);
  const {
    data: analyses = [],
    isLoading: historyLoading,
    error: historyError,
  } = useAnalysisHistory();

  const isNewParam = searchParams.get("new") === "true";
  /** Dev-only: append ?s3=1 to preview the post-onboarding / no-history layout while your account still has analyses. */
  const forceS3LayoutDev =
    process.env.NODE_ENV === "development" &&
    searchParams.get("s3") === "1";

  const skipGapQuery = searchParams.get("skipGap") === "1";
  const [skipGapAfterUpload, setSkipGapAfterUpload] = useState(skipGapQuery);

  useLayoutEffect(() => {
    if (skipGapQuery) {
      setSkipGapUploadIntent();
    }
    if (readSkipGapUploadIntent()) {
      setSkipGapAfterUpload(true);
    }
  }, [skipGapQuery]);

  useEffect(() => {
    if (!skipGapQuery) return;
    router.replace("/dashboard", { scroll: false });
  }, [skipGapQuery, router]);

  const latestGapJob = useMemo(() => {
    const completedGaps = analyses.filter(
      (a: AnalysisJob) =>
        a.status === "completed" && isGapAnalysisJob(a)
    );
    if (completedGaps.length === 0) return undefined;
    return [...completedGaps].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
  }, [analyses]);

  const gapJobId = latestGapJob?.job_id ?? "";
  const gapQueryEnabled = !!latestGapJob;

  const {
    data: gapResult,
    isLoading: gapLoading,
    isError: gapResultError,
  } = useGapAnalysisResult(gapJobId, gapQueryEnabled);

  const isFirstVisit = isNewParam || analyses.length <= 1;
  const isReturningGapRecap = !!(latestGapJob && gapResult);

  const locations = (user?.unsafeMetadata?.businessLocations as
    | Array<{ address: string; isPrimary: boolean }>
    | undefined) ?? [];

  const gapCount = useMemo(() => {
    if (!gapResult) return 0;
    return gapResult.gaps.filter((g) => g.status === "not_covered").length;
  }, [gapResult]);

  const expiryInfo = useMemo(() => {
    if (!gapResult?.policy_expiration_date) return null;
    const target = new Date(gapResult.policy_expiration_date);
    const now = new Date();
    const daysAway = Math.ceil(
      (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      daysAway,
      formatted: target.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  }, [gapResult]);

  const rawOnboarding = user?.unsafeMetadata?.hasCompletedOnboarding;
  const onboardingDone =
    rawOnboarding === true || String(rawOnboarding) === "true";
  const hasNoHistory = analyses.length === 0;
  const isS3Flow =
    onboardingDone &&
    (hasNoHistory ||
      forceS3LayoutDev ||
      skipGapQuery ||
      skipGapAfterUpload);

  const sortedDashboardGaps = useMemo((): CoverageGap[] => {
    if (!gapResult?.gaps?.length) return [];
    return [...gapResult.gaps].sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === "not_covered" ? -1 : 1;
    });
  }, [gapResult]);

  /** All jobs (gap + renewal), newest first — include latest gap so coverage runs always appear in the list */
  const pastAnalyses = useMemo(
    () =>
      [...analyses].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [analyses]
  );

  const onboardingAnswersMeta = user?.unsafeMetadata?.onboardingAnswers as
    | Record<string, unknown>
    | undefined;
  const recapBusinessName =
    gapResult?.business_name?.trim() ||
    (user?.unsafeMetadata?.businessName as string | undefined) ||
    (typeof onboardingAnswersMeta?.businessName === "string"
      ? onboardingAnswersMeta.businessName
      : undefined) ||
    (user?.firstName ? `${user.firstName}'s business` : "Your business");

  const lastAnalyzedLabel = latestGapJob
    ? new Date(latestGapJob.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Only block on gap result fetch when we actually have a gap job to load
  const gapResultNeeded = gapQueryEnabled;
  if (historyLoading || (gapResultNeeded && gapLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (historyError) throw historyError;

  if (gapResultNeeded && gapResultError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-md text-center rounded-lg border border-red-200 bg-red-50/80 p-8">
          <p className="font-semibold text-prisere-dark-gray">
            Couldn&apos;t load gap analysis
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Refresh the page or try again in a moment. If this persists, start a
            new gap analysis from your profile.
          </p>
        </div>
      </div>
    );
  }

  /**
   * Gap-first dashboard when: onboarding done and (no jobs yet, or dev preview),
   * OR user just used "Skip for now" (session + URL) so we show it even if they
   * have older analysis rows from prior sessions.
   */
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user?.emailAddresses[0]?.emailAddress}
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        {/* ---- Welcome heading ---- */}
        <div className="mb-8">
          <PageHeader
            title={
              isS3Flow
                ? `Welcome${user?.firstName ? `, ${user.firstName}` : ""}`
                : isReturningGapRecap
                  ? `Welcome back${user?.firstName ? `, ${user.firstName}` : ""}`
                  : isFirstVisit
                    ? `Welcome${user?.firstName ? `, ${user.firstName}` : ""}!`
                    : `Welcome back${user?.firstName ? `, ${user.firstName}` : ""}!`
            }
            subtitle={
              isS3Flow
                ? "You're almost there. Upload your policy to see where you might be exposed."
                : isReturningGapRecap && lastAnalyzedLabel
                  ? `${recapBusinessName} — Last analyzed ${lastAnalyzedLabel}`
                  : isFirstVisit
                    ? "Here's what we found in your policy"
                    : "Your coverage overview at a glance"
            }
          />
        </div>

        {profileUpdatedBanner && (
          <div
            className="mb-6 rounded-lg border border-prisere-mustard/40 bg-prisere-mustard/10 px-4 py-3 text-sm text-prisere-dark-gray"
            role="status"
          >
            Your profile has been updated. Upload your current policy to
            re-analyze your coverage.
          </div>
        )}

        {/* ---- S3 flow: onboarding complete, no analyses yet ---- */}
        {isS3Flow ? (
          <NoHistoryDashboard
            onClearSkipIntent={() => setSkipGapAfterUpload(false)}
            onEditProfile={() => setProfileModalOpen(true)}
          />
        ) : (
          <>
            {profileUpdatedBanner && (
              <DashboardGapReuploadSection
                onAnalysisStarted={() => setProfileUpdatedBanner(false)}
              />
            )}

            {/* ---- S4: Gap recap (most recent completed gap job + useGapAnalysisResult) ---- */}
            {isReturningGapRecap && (
              <>
                <div className="mb-6">
                  <StatTiles
                    gapCount={gapCount}
                    locationCount={locations.length || 1}
                    daysUntilExpiry={expiryInfo?.daysAway ?? null}
                  />
                </div>

                <div className="mb-8">
                  <RenewalCountdownSection
                    daysAway={expiryInfo?.daysAway ?? null}
                  />
                </div>

                <div className="mb-8">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                    Coverage gaps
                  </p>
                  <div className="space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 sm:p-5">
                    {sortedDashboardGaps.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No individual gaps were flagged in this run.
                      </p>
                    ) : (
                      sortedDashboardGaps.map((g, idx) => (
                        <GapAnalysisCard
                          key={`${g.type}-${g.title}-${idx}`}
                          gap={g}
                          defaultExpanded={false}
                        />
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ---- Renewal comparison CTA when no gap recap to anchor the page ---- */}
            {!isReturningGapRecap && (
              <Card className="mb-8 border-2 border-prisere-maroon/20 bg-prisere-maroon/5">
                <CardContent className="p-8">
                  <div className="text-center">
                    <div className="rounded-full bg-prisere-maroon/10 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <Plus className="h-8 w-8 text-prisere-maroon" />
                    </div>
                    <h2
                      className="text-2xl font-semibold mb-2"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Compare your insurance renewal
                    </h2>
                    <p className="text-gray-600 mb-6 max-w-md mx-auto text-sm">
                      Upload your current policy and renewal quote for a
                      plain-language comparison of what changed.
                    </p>
                    <Button
                      asChild
                      size="lg"
                      className="bg-prisere-maroon hover:bg-prisere-maroon/90"
                    >
                      <Link href="/upload">
                        <Plus className="h-5 w-5 mr-2" />
                        Start new comparison
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ---- Business profile + risk factors (two-column, matches reference) ---- */}
            <div className="mb-8">
              <RiskProfileSummary
                onEditProfile={() => setProfileModalOpen(true)}
              />
            </div>

            {/* ---- Past analyses: gap + renewal, labeled ---- */}
            {pastAnalyses.length > 0 && (
              <Card className="border-gray-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle
                    className="text-xs font-semibold text-gray-500 uppercase tracking-widest"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Past analyses
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {pastAnalyses.map((a: AnalysisJob) => (
                    <AnalysisHistoryRow key={a.job_id} analysis={a} />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        <BusinessProfileModal
          open={profileModalOpen}
          onOpenChange={setProfileModalOpen}
          onSaved={() => setProfileUpdatedBanner(true)}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper with auth + onboarding guard
// ---------------------------------------------------------------------------

function DashboardInner() {
  const { isLoaded, userId } = useAuth();
  const { isOnboarded, isLoading: onboardingLoading } = useOnboardingGuard();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !userId) {
      router.push("/sign-in");
    }
  }, [isLoaded, userId, router]);

  if (!isLoaded || !userId || onboardingLoading || !isOnboarded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon" />
      </div>
    );
  }

  return (
    <QueryErrorBoundary>
      <DashboardContent />
    </QueryErrorBoundary>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon" />
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
