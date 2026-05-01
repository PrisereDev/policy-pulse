"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppLogoWithBusiness } from "@/components/brand/app-logo-with-business";
import { PageHeader } from "@/components/brand/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserButton } from "@clerk/nextjs";
import { AnalysisHistoryCard } from "@/components/dashboard/analysis-history-card";
import { QueryErrorBoundary } from "@/components/query-error-boundary";
import { useAnalysisHistory } from "@/hooks/use-analysis";
import { AnalysisJob } from "@/types/api";
import { Search, Filter, Download, Plus, SortAsc, SortDesc } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

type SortField = "created_at" | "status" | "baseline_filename";
type SortOrder = "asc" | "desc";

function HistoryContent() {
  const { user } = useUser();
  const { data: analyses = [], isLoading, error } = useAnalysisHistory();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  
  // Filter and sort analyses
  const filteredAndSortedAnalyses = analyses
    .filter((analysis: AnalysisJob) => {
      const matchesSearch = 
        analysis.baseline_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (analysis.renewal_filename ?? "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || analysis.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a: AnalysisJob, b: AnalysisJob) => {
      let aValue: string | number;
      let bValue: string | number;
      
      switch (sortField) {
        case "created_at":
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case "status":
          aValue = a.status;
          bValue = b.status;
          break;
        case "baseline_filename":
          aValue = a.baseline_filename;
          bValue = b.baseline_filename;
          break;
        default:
          aValue = a.created_at;
          bValue = b.created_at;
      }
      
      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const statusCounts = {
    all: analyses.length,
    completed: analyses.filter((a: AnalysisJob) => a.status === "completed").length,
    processing: analyses.filter((a: AnalysisJob) => a.status === "processing").length,
    failed: analyses.filter((a: AnalysisJob) => a.status === "failed").length,
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleDelete = async (jobId: string) => {
    // TODO: Implement delete functionality with API call
    console.log("Delete analysis:", jobId);
    // This would typically call a delete API endpoint
    // For now, just log it since we don't have delete endpoint in MSW
  };

  const handleExportAll = () => {
    // TODO: Implement export functionality
    console.log("Export all analyses");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your analysis history...</p>
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
          <AppLogoWithBusiness />
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
        <div className="flex items-center justify-between mb-8">
          <PageHeader
            title="Analysis History"
            subtitle={`${analyses.length} total ${analyses.length === 1 ? 'analysis' : 'analyses'}`}
            className="mb-0"
          />
          
          <div className="flex items-center gap-3">
            <Button asChild className="bg-prisere-maroon hover:bg-prisere-maroon/90">
              <Link href="/upload">
                <Plus className="h-4 w-4 mr-2" />
                New Analysis
              </Link>
            </Button>
            
            {analyses.length > 0 && (
              <Button variant="outline" onClick={handleExportAll}>
                <Download className="h-4 w-4 mr-2" />
                Export All
              </Button>
            )}
          </div>
        </div>

        {analyses.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-200">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-gray-100 p-4 mb-4">
                <Plus className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                No analyses yet
              </h3>
              <p className="text-gray-600 text-center mb-6 max-w-md">
                Start your first policy comparison to track changes over time and build your analysis history.
              </p>
              <Button asChild className="bg-prisere-maroon hover:bg-prisere-maroon/90">
                <Link href="/upload">
                  <Plus className="h-4 w-4 mr-2" />
                  Start First Analysis
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Filters and Search */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Filter & Search</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Search */}
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search by filename..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  {/* Status Filter */}
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(statusCounts).map(([status, count]) => (
                      <Badge
                        key={status}
                        variant={statusFilter === status ? "default" : "outline"}
                        className={`cursor-pointer ${
                          statusFilter === status 
                            ? "bg-prisere-maroon hover:bg-prisere-maroon/90" 
                            : "hover:bg-gray-100"
                        }`}
                        onClick={() => setStatusFilter(status)}
                      >
                        {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)} ({count})
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Sort Options */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Filter className="h-4 w-4 mr-2" />
                        Sort
                        {sortOrder === "asc" ? <SortAsc className="h-4 w-4 ml-2" /> : <SortDesc className="h-4 w-4 ml-2" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleSort("created_at")}>
                        Date Created {sortField === "created_at" && (sortOrder === "asc" ? "↑" : "↓")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSort("status")}>
                        Status {sortField === "status" && (sortOrder === "asc" ? "↑" : "↓")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSort("baseline_filename")}>
                        Filename {sortField === "baseline_filename" && (sortOrder === "asc" ? "↑" : "↓")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {filteredAndSortedAnalyses.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <p className="text-gray-500">
                    {searchQuery || statusFilter !== "all" 
                      ? "No analyses match your current filters" 
                      : "No analyses found"}
                  </p>
                  {(searchQuery || statusFilter !== "all") && (
                    <Button 
                      variant="link" 
                      onClick={() => {
                        setSearchQuery("");
                        setStatusFilter("all");
                      }}
                      className="mt-2"
                    >
                      Clear filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredAndSortedAnalyses.map((analysis: AnalysisJob) => (
                  <AnalysisHistoryCard
                    key={analysis.job_id}
                    analysis={analysis}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function HistoryPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn === false) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn !== true) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon"></div>
      </div>
    );
  }

  return (
    <QueryErrorBoundary>
      <HistoryContent />
    </QueryErrorBoundary>
  );
}