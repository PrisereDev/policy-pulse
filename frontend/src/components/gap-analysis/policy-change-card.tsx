"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, ChevronDown, Minus } from "lucide-react";
import type { PolicyChange } from "@/types/analysis";
import { cn } from "@/lib/utils";
import { LocationTagList } from "./location-tags";

function formatChangeBadgeLabel(change: PolicyChange): string {
  switch (change.change_type) {
    case "increased":
      return "Increased";
    case "decreased":
      return "Decreased";
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    default:
      return "Modified";
  }
}

function policyChangeBadgeClass(change: PolicyChange): string {
  const t = change.change_type;
  if (t === "added") {
    return "bg-prisere-teal/10 text-prisere-teal border-prisere-teal/30 hover:bg-prisere-teal/10 font-normal";
  }
  if (t === "modified") {
    return "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100 font-normal";
  }
  return "bg-rose-100/90 text-prisere-maroon border-rose-200/80 hover:bg-rose-100/90 font-normal";
}

function renewalValueClass(change: PolicyChange): string {
  if (change.change_type === "added") return "text-prisere-teal font-semibold";
  if (change.change_type === "modified") return "text-prisere-dark-gray font-semibold";
  return "text-prisere-maroon font-semibold";
}

/** Align with gap cards: added / limit up / ded down / premium down = good; inverse = bad */
function getChangeTone(change: PolicyChange): "bad" | "good" | "neutral" {
  const { category, change_type } = change;
  if (change_type === "added") return "good";
  if (change_type === "removed") return "bad";
  if (category === "coverage_limit" && change_type === "decreased") return "bad";
  if (category === "coverage_limit" && change_type === "increased") return "good";
  if (category === "deductible" && change_type === "increased") return "bad";
  if (category === "deductible" && change_type === "decreased") return "good";
  if (category === "premium" && change_type === "increased") return "bad";
  if (category === "premium" && change_type === "decreased") return "good";
  if (category === "exclusion" && change_type === "added") return "bad";
  if (category === "exclusion" && change_type === "removed") return "good";
  return "neutral";
}

export function RenewalPolicyChangeCard({ change }: { change: PolicyChange }) {
  const [expanded, setExpanded] = useState(false);
  const tone = getChangeTone(change);

  const renewalDisplay =
    change.change_amount?.trim() &&
    change.renewal_value &&
    !change.renewal_value.includes(change.change_amount)
      ? `${change.renewal_value} (${change.change_amount})`
      : change.renewal_value;

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
    <Card className={borderClass}>
      <CardContent className="p-5">
        <div
          className="flex items-start justify-between cursor-pointer gap-3"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start gap-3 min-w-0">
            {LeadingIcon}
            <div className="min-w-0 space-y-1">
              {/* Headline: the value / numbers change (primary) */}
              <p className="font-semibold text-prisere-dark-gray text-base leading-snug break-words">
                <span className="text-gray-500 line-through font-normal">
                  {change.baseline_value}
                </span>
                <span className="text-gray-400 mx-1.5 font-normal">→</span>
                <span className={renewalValueClass(change)}>{renewalDisplay}</span>
              </p>
              {/* Secondary: what changed (coverage area / label) */}
              <h3 className="text-sm font-medium text-gray-600">{change.title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={policyChangeBadgeClass(change)}>
              {formatChangeBadgeLabel(change)}
            </Badge>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            {change.description?.trim() ? (
              <p className="text-sm text-gray-700 leading-relaxed">
                {change.description.trim()}
              </p>
            ) : null}
            <LocationTagList
              locations={change.affected_locations}
              className={cn(
                "flex flex-wrap gap-2",
                change.description?.trim() ? "mt-4" : "mt-3"
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
