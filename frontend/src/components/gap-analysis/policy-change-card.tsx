"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, ChevronDown, Minus } from "lucide-react";
import type { PolicyChange } from "@/types/analysis";
import { cn } from "@/lib/utils";
import { LocationTagList } from "./location-tags";
import {
  computeRenewalDisplay,
  formatChangeBadgeLabel,
  getChangeTone,
  policyChangeBadgeClassInteractive,
  renewalValueClass,
} from "./policy-change-formatting";

export function RenewalPolicyChangeCard({ change }: { change: PolicyChange }) {
  const [expanded, setExpanded] = useState(false);
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
            <Badge className={policyChangeBadgeClassInteractive(change)}>
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
