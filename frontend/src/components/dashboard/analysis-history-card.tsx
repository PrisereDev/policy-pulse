"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnalysisJob } from "@/types/api";
import { formatDistanceToNow } from "date-fns";
import { FileText, Clock, CheckCircle, XCircle, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AnalysisHistoryCardProps {
  analysis: AnalysisJob;
  onDelete?: (jobId: string) => void;
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: "bg-slate-100 text-slate-800",
    label: "Queued",
  },
  processing: {
    icon: Clock,
    color: "bg-yellow-100 text-yellow-800",
    label: "Processing"
  },
  completed: {
    icon: CheckCircle,
    color: "bg-green-100 text-green-800",
    label: "Completed"
  },
  failed: {
    icon: XCircle,
    color: "bg-red-100 text-red-800",
    label: "Failed"
  }
};

export function AnalysisHistoryCard({ analysis, onDelete }: AnalysisHistoryCardProps) {
  const config = statusConfig[analysis.status];
  const StatusIcon = config.icon;
  
  const timeAgo = formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-medium mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              Policy Comparison
            </CardTitle>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={config.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
              <span className="text-xs text-gray-500">{timeAgo}</span>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {analysis.status === "completed" && (
                <DropdownMenuItem asChild>
                  <Link href={`/results/${analysis.job_id}`}>
                    <FileText className="h-4 w-4 mr-2" />
                    View Results
                  </Link>
                </DropdownMenuItem>
              )}
              {(analysis.status === "processing" || analysis.status === "pending") && (
                <DropdownMenuItem asChild>
                  <Link href={`/analysis/${analysis.job_id}`}>
                    <Clock className="h-4 w-4 mr-2" />
                    View Progress
                  </Link>
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem 
                  onClick={() => onDelete(analysis.job_id)}
                  className="text-red-600"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="text-sm">
            <span className="text-gray-500">Baseline:</span>
            <span className="ml-2 text-gray-900 font-medium truncate block">
              {analysis.baseline_filename}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500">Renewal:</span>
            <span className="ml-2 text-gray-900 font-medium truncate block">
              {analysis.renewal_filename}
            </span>
          </div>
        </div>
        
        <div className="mt-4">
          {analysis.status === "completed" && (
            <Button 
              asChild 
              variant="outline" 
              size="sm" 
              className="w-full border-prisere-maroon text-prisere-maroon hover:bg-prisere-maroon hover:text-white"
            >
              <Link href={`/results/${analysis.job_id}`}>
                <FileText className="h-4 w-4 mr-2" />
                View Results
              </Link>
            </Button>
          )}
          
          {(analysis.status === "processing" || analysis.status === "pending") && (
            <Button 
              asChild 
              variant="outline" 
              size="sm" 
              className="w-full"
            >
              <Link href={`/analysis/${analysis.job_id}`}>
                <Clock className="h-4 w-4 mr-2" />
                View Progress
              </Link>
            </Button>
          )}
          
          {analysis.status === "failed" && (
            <div className="text-sm text-red-600 text-center py-2">
              {analysis.error_message || "Analysis failed"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}