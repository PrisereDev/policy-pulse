"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOnboardingGuard } from "@/hooks/use-onboarding";
import { Logo } from "@/components/brand/logo";
import { PageHeader } from "@/components/brand/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserButton } from "@clerk/nextjs";
import { AnalysisHistoryCard } from "@/components/dashboard/analysis-history-card";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { useAnalysisHistory } from "@/hooks/use-analysis";
import { AnalysisJob } from "@/types/api";
import { Plus } from "lucide-react";
import Link from "next/link";
function DashboardContent() {
  const { user } = useUser();
  const { data: analyses = [], isLoading, error } = useAnalysisHistory();
  const hasAnalyses = analyses.length > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    throw error;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Welcome Section */}
        <div className="mb-8">
          <PageHeader
            title={`Welcome back${user?.firstName ? `, ${user.firstName}` : ''}!`}
            subtitle="Compare your insurance renewal with your current policy to understand what changed"
            className="mb-6"
          />
        </div>

        {/* Primary Action - New Policy Comparison */}
        <Card className="mb-8 border-2 border-prisere-maroon/20 bg-prisere-maroon/5">
          <CardContent className="p-8">
            <div className="text-center">
              <div className="rounded-full bg-prisere-maroon/10 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Plus className="h-8 w-8 text-prisere-maroon" />
              </div>
              <h2 className="text-2xl font-semibold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
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

        <div className="space-y-8">
          {/* Analysis History Section */}
          {hasAnalyses && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
                  Your Past Comparisons
                </h2>
                <Button asChild variant="outline" size="sm">
                  <Link href="/history">
                    View All
                  </Link>
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {analyses.slice(0, 6).map((analysis: AnalysisJob) => (
                  <AnalysisHistoryCard
                    key={analysis.job_id}
                    analysis={analysis}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Educational Tips Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Insurance Renewal Tips
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="p-6">
                  <h4 className="font-medium mb-2">Review Coverage Limits</h4>
                  <p className="text-sm text-gray-600">
                    Check if your coverage amounts have changed. Lower limits might mean reduced protection.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <h4 className="font-medium mb-2">Check Your Deductibles</h4>
                  <p className="text-sm text-gray-600">
                    Higher deductibles mean lower premiums, but more out-of-pocket costs when you file a claim.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <h4 className="font-medium mb-2">Look for New Exclusions</h4>
                  <p className="text-sm text-gray-600">
                    New exclusions might remove coverage you previously had. Ask your broker about any changes.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <h4 className="font-medium mb-2">Understand Premium Changes</h4>
                  <p className="text-sm text-gray-600">
                    Premium increases might reflect better coverage, or just market conditions. Compare carefully.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Getting Started for new users */}
          {!hasAnalyses && (
              <Card>
                <CardHeader>
                  <CardTitle style={{ fontFamily: 'var(--font-heading)' }}>
                    Getting Started
                  </CardTitle>
                  <CardDescription>
                    Make the most of your insurance comparison tool
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="bg-prisere-maroon text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
                        1
                      </div>
                      <div>
                        <p className="font-medium">Upload your current policy</p>
                        <p className="text-sm text-gray-600">Start with your existing insurance policy PDF</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-prisere-maroon text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
                        2
                      </div>
                      <div>
                        <p className="font-medium">Add your renewal quote</p>
                        <p className="text-sm text-gray-600">Upload the renewal quote you received</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-prisere-maroon text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
                        3
                      </div>
                      <div>
                        <p className="font-medium">Review the analysis</p>
                        <p className="text-sm text-gray-600">Get detailed insights about what changed</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon"></div>
      </div>
    );
  }

  return (
    <QueryErrorBoundary>
      <DashboardContent />
    </QueryErrorBoundary>
  );
}