"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, ChevronDown } from "lucide-react";
import type { CoverageGap } from "@/types/api";
import { LocationTagList } from "./location-tags";

export const GAP_TITLES: Record<string, string> = {
  flood: "Flood Insurance",
  spoilage: "Electrical Interruption (Spoilage)",
  event_cancellation: "Event Cancellation",
  eo: "Errors & Omissions (E&O)",
  cyber: "Cyber Insurance",
};

export const GAP_WHY: Record<string, string> = {
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

export type GapAnalysisCardProps = {
  gap: CoverageGap;
  defaultExpanded?: boolean;
  /** Dashboard-style card (left border + icons) vs plain renewal layout */
  plain?: boolean;
  /** When set, show subtitle and renewal-style coverage badges */
  mode?: "standard" | "update";
  /** Required when mode="update" */
  updateStatus?: "still_not_covered" | "now_covered";
};

export function GapAnalysisCard({
  gap,
  defaultExpanded = false,
  plain = false,
  mode = "standard",
  updateStatus,
}: GapAnalysisCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isCovered = gap.status === "covered";
  const title = GAP_TITLES[gap.type] || gap.title;
  const why = GAP_WHY[gap.type] || gap.explanation;
  const isUpdate = mode === "update";

  let badgeClass: string;
  let badgeLabel: string;

  if (isUpdate && updateStatus) {
    badgeLabel =
      updateStatus === "now_covered" ? "Now covered" : "Still not covered";
    badgeClass =
      updateStatus === "now_covered"
        ? "bg-prisere-teal/10 text-prisere-teal border-prisere-teal/30 hover:bg-prisere-teal/10"
        : "bg-rose-100/90 text-prisere-maroon border-rose-200/80 hover:bg-rose-100/90 font-normal";
  } else {
    badgeLabel = isCovered ? "Covered" : "Not covered";
    badgeClass = isCovered
      ? "bg-prisere-teal/10 text-prisere-teal border-prisere-teal/30 hover:bg-prisere-teal/10"
      : "bg-rose-100/90 text-prisere-maroon border-rose-200/80 hover:bg-rose-100/90 font-normal";
  }

  const borderClass = plain
    ? "border border-gray-200/80"
    : `border-l-4 ${
        isCovered ? "border-l-prisere-teal" : "border-l-prisere-maroon"
      }`;

  return (
    <Card className={borderClass}>
      <CardContent className="p-5">
        <div
          className="flex items-start justify-between cursor-pointer gap-3"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start gap-3 min-w-0">
            {!plain &&
              (isUpdate && updateStatus ? (
                updateStatus === "now_covered" ? (
                  <CheckCircle className="h-5 w-5 text-prisere-teal flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-prisere-maroon flex-shrink-0" />
                )
              ) : isCovered ? (
                <CheckCircle className="h-5 w-5 text-prisere-teal flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-prisere-maroon flex-shrink-0" />
              ))}
            <div className="min-w-0">
              <h3 className="font-semibold text-prisere-dark-gray">{title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Badge className={badgeClass}>{badgeLabel}</Badge>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
        {expanded && (
          <div className="mt-4 pt-4 border-t">
            {isUpdate ? (
              (gap.explanation?.trim() || why) && (
                <p className="text-sm text-gray-700 leading-relaxed">
                  {gap.explanation?.trim() || why}
                </p>
              )
            ) : (
              <p className="text-sm text-gray-700 leading-relaxed">{why}</p>
            )}
            <LocationTagList
              locations={gap.affected_locations}
              className={
                (isUpdate && (gap.explanation?.trim() || why)) || !isUpdate
                  ? "mt-4 flex flex-wrap gap-2"
                  : "mt-3 flex flex-wrap gap-2"
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
