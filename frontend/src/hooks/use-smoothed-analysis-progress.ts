"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Time over which we ramp from 50% toward the mid-phase cap (matches ~90–120s product expectation). */
const ESTIMATED_MID_PHASE_MS = 85_000;
/** While backend is still in the long comparison step (<90%), never show above this. */
const MID_PHASE_CAP = 89;
const TICK_MS = 80;
const LERP = 0.18;

function clampProgress(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * Smooths the long 50–90% backend gap: backend remains source of truth, but the UI
 * advances gradually up to {@link MID_PHASE_CAP} until the backend reaches ≥90%.
 */
export function useSmoothedAnalysisProgress(
  jobId: string,
  backendProgress: number | undefined,
  status: string | undefined
): number {
  const [displayed, setDisplayed] = useState(0);
  const midEnteredAtRef = useRef<number | null>(null);

  const getTarget = useCallback(
    (raw: number): number => {
      if (status === "failed") {
        midEnteredAtRef.current = null;
        return raw;
      }
      if (raw >= 90) {
        midEnteredAtRef.current = null;
        return raw;
      }
      if (raw < 50) {
        midEnteredAtRef.current = null;
        return raw;
      }
      if (midEnteredAtRef.current === null) {
        midEnteredAtRef.current = Date.now();
      }
      const elapsed = Date.now() - midEnteredAtRef.current;
      const ramp =
        50 + (MID_PHASE_CAP - 50) * Math.min(1, elapsed / ESTIMATED_MID_PHASE_MS);
      return Math.min(MID_PHASE_CAP, Math.max(raw, ramp));
    },
    [status]
  );

  useEffect(() => {
    midEnteredAtRef.current = null;
    setDisplayed(0);
  }, [jobId]);

  useEffect(() => {
    if (status !== "failed") return;
    const raw = clampProgress(
      typeof backendProgress === "number" ? backendProgress : 0
    );
    setDisplayed(raw);
  }, [status, backendProgress]);

  useEffect(() => {
    const raw = () =>
      clampProgress(typeof backendProgress === "number" ? backendProgress : 0);
    const tick = () => {
      const target = getTarget(raw());
      setDisplayed((d) => {
        const next = d + (target - d) * LERP;
        return Math.abs(next - target) < 0.08 ? target : next;
      });
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [backendProgress, status, getTarget]);

  return displayed;
}

const COMPARISON_MID_MESSAGES = [
  "Analyzing policy differences…",
  "Reviewing coverage, exclusions, and limits…",
  "Comparing policy changes…",
] as const;

const GAP_MID_MESSAGES = [
  "Analyzing policy differences…",
  "Reviewing coverage, exclusions, and limits…",
  "Comparing your risk profile to your policy…",
] as const;

/**
 * Cycles friendly copy during the long mid-phase (backend 50–89%) so the screen
 * does not look frozen. Backend progress remains authoritative.
 */
export function useMidPhaseRotatingMessage(
  active: boolean,
  isGap: boolean
): string | null {
  const messages = isGap ? GAP_MID_MESSAGES : COMPARISON_MID_MESSAGES;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!active) {
      setIdx(0);
      return;
    }
    setIdx(0);
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % messages.length),
      18_000
    );
    return () => window.clearInterval(id);
  }, [active, messages.length, isGap]);

  return active ? messages[idx] ?? null : null;
}
