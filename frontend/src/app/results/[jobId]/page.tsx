"use client";

import { use, useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserButton } from "@clerk/nextjs";
import { useAnalysisResult } from "@/hooks/use-analysis";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { AppBreadcrumb } from "@/components/navigation/app-breadcrumb";
import { Download, FileText, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";

// Helper function to determine if a change is good or bad for the user
// This drives the sidebar calculations for risk assessment and action items
function getChangeImpact(category: string, changeType: string): 'good' | 'bad' | 'neutral' {
  const badChanges = [
    'decreased', 'excluded', 'removed', 'increased_deductible', 'increased_premium',
    'coverage_limit_decreased', 'deductible_increased', 'premium_increased', 'exclusion_added'
  ];
  
  const goodChanges = [
    'increased', 'included', 'added', 'decreased_deductible', 'decreased_premium',
    'coverage_limit_increased', 'deductible_decreased', 'premium_decreased', 'exclusion_removed'
  ];

  // Check for specific patterns that indicate good/bad changes
  if (category.includes('coverage') && changeType === 'decreased') return 'bad';
  if (category.includes('coverage') && changeType === 'increased') return 'good';
  if (category.includes('deductible') && changeType === 'increased') return 'bad';
  if (category.includes('deductible') && changeType === 'decreased') return 'good';
  if (category.includes('premium') && changeType === 'increased') return 'bad';
  if (category.includes('premium') && changeType === 'decreased') return 'good';
  if (category.includes('exclusion') && changeType === 'added') return 'bad';
  if (category.includes('exclusion') && changeType === 'removed') return 'good';
  if (changeType === 'excluded') return 'bad';
  if (changeType === 'included') return 'good';
  
  // Fallback to general patterns
  if (badChanges.some(pattern => changeType.includes(pattern))) return 'bad';
  if (goodChanges.some(pattern => changeType.includes(pattern))) return 'good';
  
  return 'neutral';
}

// Helper function to provide educational context
function getEducationalContext(category: string, changeType: string): string {
  const contexts: Record<string, string> = {
    'coverage_limit_decreased': 'Lower coverage limits mean less financial protection if you need to file a claim. Your business may be at higher risk.',
    'coverage_limit_increased': 'Higher coverage limits provide more financial protection, which is generally good, but will likely increase your premium.',
    'deductible_increased': 'Higher deductibles mean you\'ll pay more out-of-pocket before insurance kicks in, but this usually lowers your premium.',
    'deductible_decreased': 'Lower deductibles mean less out-of-pocket costs when filing claims, but this typically increases your premium.',
    'exclusion_added': 'New exclusions mean certain risks are no longer covered. You may need separate insurance for these risks.',
    'exclusion_removed': 'Removing exclusions means you now have coverage for risks that were previously not covered.',
    'premium_increased': 'Premium increases could reflect better coverage, higher business risk, or market conditions.',
    'premium_decreased': 'Premium decreases might indicate reduced coverage or lower risk, but verify what changed.',
  };
  
  const key = `${category}_${changeType}`;
  return contexts[key] || 'This change affects your insurance coverage. Consider discussing with your broker to understand the implications.';
}

function ResultsContent({ params }: { params: Promise<{ jobId: string }> }) {
  const resolvedParams = use(params);
  console.log('ResultsContent - jobId:', resolvedParams.jobId);
  const { data: result, isLoading, error } = useAnalysisResult(resolvedParams.jobId);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggleAllAccordions = () => {
    if (expandedItems.length === result?.changes.length) {
      setExpandedItems([]);
    } else {
      setExpandedItems(result?.changes.map((c, i) => c.id || `change-${i}`) || []);
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white">
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <Logo />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        <AppBreadcrumb />
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6 max-w-7xl">
        {/* Header with Key Metrics */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-prisere-dark-gray mb-2" 
              style={{ fontFamily: 'var(--font-heading)' }}>
            Insurance Renewal Analysis
          </h1>
          <div className="flex items-center gap-6 text-lg mb-6">
            <span className="text-gray-600">
              <span className="font-semibold text-prisere-dark-gray">{result.summary.total_changes}</span> changes found
            </span>
            {result.premium_comparison.percentage_change !== null && (
              <>
                <span className="text-gray-400">•</span>
                <span className={`font-semibold ${
                  result.premium_comparison.percentage_change > 0 
                    ? 'text-prisere-maroon' 
                    : result.premium_comparison.percentage_change < 0 
                    ? 'text-prisere-teal' 
                    : 'text-gray-600'
                }`}>
                  {result.premium_comparison.percentage_change > 0 ? '+' : ''}
                  {result.premium_comparison.percentage_change}% premium change
                </span>
              </>
            )}
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content - Policy Changes */}
          <div className="lg:col-span-2">

            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
                  Policy Changes
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllAccordions}
                  className="text-sm"
                >
                  {expandedItems.length === result.changes.length ? (
                    <>
                      <ChevronUp className="w-4 h-4 mr-1" />
                      Collapse All
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4 mr-1" />
                      Expand All
                    </>
                  )}
                </Button>
              </div>
          
              <div className="space-y-3">
                {result.changes.map((change, index) => {
                  const changeKey = change.id || `change-${index}`;
                  const isExpanded = expandedItems.includes(changeKey);
                  const impact = getChangeImpact(change.category, change.change_type);
                  
                  return (
                    <Card 
                      key={changeKey} 
                      className={`border-l-4 transition-all ${
                        impact === 'bad' 
                          ? 'border-l-prisere-maroon bg-white' 
                          : impact === 'good'
                          ? 'border-l-prisere-teal bg-white'
                          : 'border-l-prisere-mustard bg-white'
                      } hover:shadow-md`}
                    >
                      <div className="p-4">
                        <div 
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => {
                            setExpandedItems(prev => 
                              prev.includes(changeKey) 
                                ? prev.filter(id => id !== changeKey)
                                : [...prev, changeKey]
                            );
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {/* Impact Indicator */}
                            <div className={`w-3 h-3 rounded-full ${
                              impact === 'bad' ? 'bg-prisere-maroon' 
                                : impact === 'good' ? 'bg-prisere-teal' 
                                : 'bg-prisere-mustard'
                            }`}></div>
                            
                            <div className="flex-1">
                              <h3 className="font-semibold text-base text-prisere-dark-gray mb-1">
                                {change.title}
                              </h3>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="px-2 py-1 bg-gray-100 rounded text-gray-700 font-medium">
                                  {change.baseline_value}
                                </span>
                                <span className="text-gray-400">→</span>
                                <span className={`px-2 py-1 rounded font-medium ${
                                  impact === 'bad' 
                                    ? 'bg-prisere-maroon/10 text-prisere-maroon' 
                                    : impact === 'good'
                                    ? 'bg-prisere-teal/10 text-prisere-teal'
                                    : 'bg-prisere-mustard/10 text-prisere-mustard'
                                }`}>
                                  {change.renewal_value}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`} />
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t">
                            <div className={`p-3 rounded-lg border ${
                              impact === 'bad' 
                                ? 'bg-red-50 border-red-200' 
                                : impact === 'good'
                                ? 'bg-teal-50 border-teal-200'
                                : 'bg-amber-50 border-amber-200'
                            }`}>
                              <h4 className={`font-medium mb-2 text-sm ${
                                impact === 'bad' 
                                  ? 'text-red-800' 
                                  : impact === 'good'
                                  ? 'text-teal-800'
                                  : 'text-amber-800'
                              }`}>
                                Impact on Your Business
                              </h4>
                              <p className={`text-sm leading-relaxed ${
                                impact === 'bad' 
                                  ? 'text-red-700' 
                                  : impact === 'good'
                                  ? 'text-teal-700'
                                  : 'text-amber-700'
                              }`}>
                                {getEducationalContext(change.category, change.change_type)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar - Business Impact Analysis */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-6">
              
              {/* Change Summary */}
              <Card className="border-l-4 border-l-prisere-maroon">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'var(--font-heading)' }}>
                    <FileText className="h-4 w-4 text-prisere-maroon" />
                    Change Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg mb-3">
                    <p className="text-sm font-medium text-red-800 mb-1">Coverage Analysis</p>
                    <p className="text-xs text-red-700">
                      Multiple coverage modifications detected. Changes include reduced liability limits, increased deductibles, and new exclusions.
                    </p>
                  </div>
                  <div className="text-sm text-gray-600">
                    <div className="flex justify-between mb-1">
                      <span>Changes Detected:</span>
                      <span className="font-medium text-gray-800">{result.changes.length} total</span>
                    </div>
                    {result.premium_comparison.difference !== null && (
                      <div className="flex justify-between">
                        <span>Premium Change:</span>
                        <span className="font-medium text-gray-800">${Math.abs(result.premium_comparison.difference).toLocaleString()}/year</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Educational Context */}
              <Card className="border-l-4 border-l-prisere-mustard">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'var(--font-heading)' }}>
                    <FileText className="h-4 w-4 text-prisere-mustard" />
                    Understanding Your Changes
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 mb-2">Summary of Changes</p>
                    <div className="space-y-1 text-xs text-amber-700">
                      {result.premium_comparison.difference !== null && result.premium_comparison.percentage_change !== null && (
                        <p>• Premium {result.premium_comparison.difference > 0 ? 'increased' : 'decreased'} by {Math.abs(result.premium_comparison.percentage_change)}% (${Math.abs(result.premium_comparison.difference).toLocaleString()})</p>
                      )}
                      <p>• {result.changes.filter(c => getChangeImpact(c.category, c.change_type) === 'bad').length} coverage modifications detected</p>
                      <p>• Changes affect liability limits, deductibles, and exclusions</p>
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                    <p className="text-sm font-medium text-blue-800 mb-1">Educational Note</p>
                    <p className="text-xs text-blue-700">
                      Insurance renewals commonly include premium adjustments and coverage modifications. Discuss these changes with your licensed broker to understand how they apply to your specific business situation.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Breakdown */}
              {result.premium_comparison.baseline_premium !== null && 
               result.premium_comparison.renewal_premium !== null && 
               result.premium_comparison.difference !== null ? (
                <Card className="border-l-4 border-l-prisere-teal">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'var(--font-heading)' }}>
                      <TrendingUp className="h-4 w-4 text-prisere-teal" />
                      Financial Impact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current Premium:</span>
                        <span className="font-medium">${result.premium_comparison.baseline_premium.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Renewal Premium:</span>
                        <span className={`font-medium ${
                          result.premium_comparison.difference > 0 
                            ? 'text-prisere-maroon' 
                            : 'text-prisere-teal'
                        }`}>
                          ${result.premium_comparison.renewal_premium.toLocaleString()}
                        </span>
                      </div>
                      <div className="border-t pt-2 flex justify-between">
                        <span className="text-gray-600">
                          {result.premium_comparison.difference > 0 ? 'Annual Increase:' : 'Annual Savings:'}
                        </span>
                        <span className={`font-medium ${
                          result.premium_comparison.difference > 0 
                            ? 'text-prisere-maroon' 
                            : 'text-prisere-teal'
                        }`}>
                          {result.premium_comparison.difference > 0 ? '+' : ''}${result.premium_comparison.difference.toLocaleString()}
                        </span>
                      </div>
                      <div className={`p-2 rounded text-xs ${
                        result.premium_comparison.difference > 0 
                          ? 'bg-red-50 text-red-800 border border-red-200' 
                          : 'bg-teal-50 text-teal-800 border border-teal-200'
                      }`}>
                        {result.premium_comparison.difference > 0 
                          ? "Premium increased while some coverage amounts decreased" 
                          : "Premium decreased - review coverage changes"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-l-4 border-l-prisere-mustard">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: 'var(--font-heading)' }}>
                      <TrendingUp className="h-4 w-4 text-prisere-mustard" />
                      Financial Impact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 mb-1">Premium Information Not Available</p>
                      <p className="text-xs text-amber-700">
                        Premium amounts could not be extracted from the policy documents. Please verify premium details with your insurance broker.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Download Report */}
              <Card className="border-l-4 border-l-prisere-dark-gray">
                <CardContent className="pt-4">
                  <Button className="w-full bg-prisere-maroon hover:bg-prisere-maroon/90 mb-3">
                    <Download className="mr-2 h-4 w-4" />
                    Download Full Report
                  </Button>
                  <p className="text-xs text-gray-500 text-center">
                    Share this analysis with your insurance broker
                  </p>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default function ResultsPage({ params }: { params: Promise<{ jobId: string }> }) {
  return (
    <QueryErrorBoundary>
      <ResultsContent params={params} />
    </QueryErrorBoundary>
  );
}