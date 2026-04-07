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
  ChevronDown,
  MapPin,
  ShieldAlert,
  Calendar,
  Plus,
  FileText,
  Clock,
  XCircle,
  ArrowRight,
  ArrowUpCircle,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// GapCard — identical to the former gap-results page version
// ---------------------------------------------------------------------------

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

function GapCard({
  gap,
  defaultExpanded = false,
}: {
  gap: CoverageGap;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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
            {gap.affected_locations && gap.affected_locations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {gap.affected_locations.map((loc) => (
                  <span
                    key={loc}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                  >
                    <MapPin className="h-3 w-3" />
                    {loc}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
// Business profile card (from Clerk metadata)
// ---------------------------------------------------------------------------

function BusinessProfileCard({
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

  if (!answers) return null;

  const riskFactors: { label: string; value: string }[] = [];

  if (answers.climate === true)
    riskFactors.push({
      label: "Climate-controlled inventory",
      value: "Yes",
    });
  if (answers.events === true)
    riskFactors.push({
      label: "Revenue depends on nearby events",
      value: "Yes",
    });
  if (answers.professionalServices === true)
    riskFactors.push({
      label: "Provides professional services",
      value: "Yes",
    });
  if (answers.payments === true)
    riskFactors.push({
      label: "Handles data/payments digitally",
      value: "Yes",
    });
  else if (answers.payments === false)
    riskFactors.push({
      label: "Handles data/payments",
      value: "Mostly in-person / cash",
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle
          className="text-base"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Business Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {locations && locations.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Locations
            </p>
            <div className="space-y-1.5">
              {locations.map((loc) => (
                <div
                  key={loc.address}
                  className="flex items-center gap-2 text-sm text-prisere-dark-gray"
                >
                  <MapPin className="h-3.5 w-3.5 text-prisere-maroon flex-shrink-0" />
                  <span>{loc.address}</span>
                  {loc.isPrimary && (
                    <span className="text-xs text-gray-400">(primary)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {riskFactors.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Risk Factors
            </p>
            <div className="space-y-1.5">
              {riskFactors.map((rf) => (
                <div
                  key={rf.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-600">{rf.label}</span>
                  <span className="font-medium text-prisere-dark-gray">
                    {rf.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onEditProfile}
          className="text-sm text-prisere-maroon hover:text-prisere-maroon/80 font-medium mt-2 underline underline-offset-2"
        >
          Edit profile
        </button>
      </CardContent>
    </Card>
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
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-prisere-maroon flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-prisere-dark-gray">
              {gapCount}
            </p>
            <p className="text-xs text-gray-500">Gaps found</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <MapPin className="h-5 w-5 text-prisere-teal flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-prisere-dark-gray">
              {locationCount}
            </p>
            <p className="text-xs text-gray-500">
              Location{locationCount !== 1 ? "s" : ""}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card className="col-span-2 lg:col-span-1">
        <CardContent className="p-4 flex items-center gap-3">
          <Calendar className="h-5 w-5 text-prisere-mustard flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold text-prisere-dark-gray">
              {daysUntilExpiry !== null ? daysUntilExpiry : "—"}
            </p>
            <p className="text-xs text-gray-500">Days until expiry</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renewal alert
// ---------------------------------------------------------------------------

function RenewalAlert({ daysAway, expiryDate }: { daysAway: number; expiryDate: string }) {
  if (daysAway > 30) return null;

  return (
    <Card className="border-prisere-mustard/40 bg-prisere-mustard/10">
      <CardContent className="p-5 flex items-start gap-4">
        <div className="rounded-full bg-prisere-mustard/15 p-2 flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-prisere-mustard" />
        </div>
        <div>
          <p className="font-semibold text-prisere-dark-gray">
            Your policy expires in {daysAway} day{daysAway !== 1 ? "s" : ""}
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            Expires {expiryDate}. Upload your renewal quote to compare what
            changed.
          </p>
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
  const href =
    analysis.status === "completed"
      ? `/results/${analysis.job_id}`
      : analysis.status === "processing"
        ? `/analysis/${analysis.job_id}`
        : undefined;

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-prisere-dark-gray truncate">
            {analysis.baseline_filename}
          </p>
          <p className="text-xs text-gray-500">{timeAgo}</p>
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
            className="text-xs text-prisere-maroon hover:text-prisere-maroon/80 font-medium"
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
    return analyses.find(
      (a: AnalysisJob) => a.status === "completed" && !a.renewal_filename
    );
  }, [analyses]);

  const {
    data: gapResult,
    isLoading: gapLoading,
  } = useGapAnalysisResult(latestGapJob?.job_id ?? "", !!latestGapJob);

  const isFirstVisit = isNewParam || analyses.length <= 1;

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

  // Only block on gap result fetch when we actually have a gap job to load
  const gapResultNeeded = !!latestGapJob;
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

  const rawOnboarding = user?.unsafeMetadata?.hasCompletedOnboarding;
  const onboardingDone =
    rawOnboarding === true || String(rawOnboarding) === "true";
  const hasNoHistory = analyses.length === 0;
  /**
   * Gap-first dashboard when: onboarding done and (no jobs yet, or dev preview),
   * OR user just used "Skip for now" (session + URL) so we show it even if they
   * have older analysis rows from prior sessions.
   */
  const isS3Flow =
    onboardingDone &&
    (hasNoHistory ||
      forceS3LayoutDev ||
      skipGapQuery ||
      skipGapAfterUpload);

  const notCoveredGaps = gapResult
    ? gapResult.gaps.filter((g) => g.status === "not_covered")
    : [];
  const coveredGaps = gapResult
    ? gapResult.gaps.filter((g) => g.status === "covered")
    : [];

  const pastAnalyses = analyses.filter(
    (a: AnalysisJob) => a.job_id !== latestGapJob?.job_id
  );

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
                : isFirstVisit
                  ? `Welcome${user?.firstName ? `, ${user.firstName}` : ""}!`
                  : `Welcome back${user?.firstName ? `, ${user.firstName}` : ""}!`
            }
            subtitle={
              isS3Flow
                ? "You're almost there. Upload your policy to see where you might be exposed."
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
            {/* ---- Returning visit: Renewal alert ---- */}
            {!isFirstVisit && expiryInfo && expiryInfo.daysAway <= 30 && (
              <div className="mb-6">
                <RenewalAlert
                  daysAway={expiryInfo.daysAway}
                  expiryDate={expiryInfo.formatted}
                />
              </div>
            )}

            {/* ---- 1) Start New Comparison ---- */}
            <Card className="mb-8 border-2 border-prisere-maroon/20 bg-prisere-maroon/5">
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="rounded-full bg-prisere-maroon/10 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Plus className="h-8 w-8 text-prisere-maroon" />
                  </div>
                  <h2 className="text-2xl font-semibold mb-2" style={{ fontFamily: "var(--font-heading)" }}>
                    Compare Your Insurance Renewal
                  </h2>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    Upload your current policy and renewal quote to get a plain-language comparison of what changed
                  </p>
                  <Button asChild size="lg" className="bg-prisere-maroon hover:bg-prisere-maroon/90">
                    <Link href="/upload">
                      <Plus className="h-5 w-5 mr-2" />
                      Start New Comparison
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ---- 2) Latest coverage gap analysis summary ---- */}
            {gapResult && (notCoveredGaps.length > 0 || coveredGaps.length > 0) && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2
                    className="text-lg font-semibold text-prisere-dark-gray"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Latest Coverage Gap Analysis
                  </h2>
                  {latestGapJob && (
                    <span className="text-sm text-gray-500">
                      {new Date(latestGapJob.created_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>

                <StatTiles
                  gapCount={gapCount}
                  locationCount={locations.length || 1}
                  daysUntilExpiry={expiryInfo?.daysAway ?? null}
                />

                {latestGapJob && (
                  <div className="mt-4 text-center">
                    <Button asChild variant="outline">
                      <Link href={`/results/${latestGapJob.job_id}`}>
                        View Full Analysis Details
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ---- 3) Business profile & risk factors ---- */}
            <div className="mb-8">
              <BusinessProfileCard
                onEditProfile={() => setProfileModalOpen(true)}
              />
            </div>

            {/* ---- 4) Past analyses ---- */}
            {pastAnalyses.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle
                    className="text-base"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Past Analyses
                  </CardTitle>
                </CardHeader>
                <CardContent>
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
