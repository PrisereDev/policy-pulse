"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useCreateAnalysis } from "@/hooks/use-analysis";
import { AppLogoWithBusiness } from "@/components/brand/app-logo-with-business";
import { PageHeader } from "@/components/brand/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileUploadCard } from "@/components/upload/file-upload-card";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function UploadPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [renewalFile, setRenewalFile] = useState<File | null>(null);
  
  const createAnalysisMutation = useCreateAnalysis();

  useEffect(() => {
    if (isLoaded && isSignedIn === false) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn !== true) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon" />
      </div>
    );
  }

  const handleStartAnalysis = async () => {
    if (!baselineFile || !renewalFile) return;
    
    try {
      const result = await createAnalysisMutation.mutateAsync({
        baselineFile,
        renewalFile,
      });
      
      router.push(`/analysis/${result.job_id}`);
    } catch (error) {
      console.error("Failed to start analysis:", error);
      // Error handling will be shown by React Query error boundary
    }
  };

  const canProceed = baselineFile && renewalFile;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <AppLogoWithBusiness />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 max-w-5xl">
        <Link 
          href="/dashboard"
          className="inline-flex items-center text-sm text-gray-600 hover:text-prisere-dark-gray mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to dashboard
        </Link>

        <PageHeader
          title="Upload Your Policies"
          subtitle="Upload your current policy and renewal quote to compare what's changed"
          className="mb-8"
        />

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-prisere-dark-gray">Step 1 of 3: Upload Documents</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-prisere-maroon h-2 rounded-full" style={{ width: '33%' }}></div>
          </div>
        </div>

        {/* Upload Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
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

        {/* Info Card */}
        <Card className="bg-blue-50 border-blue-200 p-6 mb-8">
          <h3 className="font-semibold text-prisere-dark-gray mb-2" 
              style={{ fontFamily: 'var(--font-heading)' }}>
            What we do with your files
          </h3>
          <ul className="space-y-2 text-sm text-gray-700" style={{ fontFamily: 'var(--font-body)' }}>
            <li>• Your PDFs are encrypted and uploaded securely</li>
            <li>• Files are analyzed by AI to identify changes</li>
            <li>• Documents are automatically deleted after processing</li>
            <li>• We only store the comparison results, not your files</li>
          </ul>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <Link href="/dashboard">
            <Button variant="outline">
              Cancel
            </Button>
          </Link>
          <Button 
            onClick={handleStartAnalysis}
            disabled={!canProceed || createAnalysisMutation.isPending}
            className="bg-prisere-maroon hover:bg-prisere-maroon/90 disabled:opacity-50"
          >
            {createAnalysisMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>
                Start Analysis
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}