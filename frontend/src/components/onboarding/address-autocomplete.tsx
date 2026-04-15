"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEventHandler } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const GEOAPIFY_AUTOCOMPLETE =
  "https://api.geoapify.com/v1/geocode/autocomplete";

const API_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ?? "";

export type ParsedAddress = {
  fullAddress: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  lat: number | null;
  lng: number | null;
};

/** Normalize a Geoapify result object (JSON `results[]` item or GeoJSON feature properties). */
export function parseGeoapifyResult(
  raw: Record<string, unknown>
): ParsedAddress | null {
  const address_line1 =
    raw.address_line1 != null ? String(raw.address_line1).trim() : "";
  const housenumber =
    raw.housenumber != null ? String(raw.housenumber).trim() : "";
  const streetName = raw.street != null ? String(raw.street).trim() : "";

  let street = address_line1;
  if (!street) {
    street = [housenumber, streetName].filter(Boolean).join(" ").trim();
  }

  const city = String(raw.city ?? "").trim();
  const state = String(
    raw.state_code ?? raw.state ?? ""
  ).trim();
  const zip = String(raw.postcode ?? "").trim();
  const country = String(raw.country ?? "").trim();

  let formatted = String(raw.formatted ?? raw.name ?? "").trim();
  if (!formatted) {
    formatted = buildLocationLine({
      street,
      city,
      state,
      zip,
      country,
    });
  }
  if (!formatted) return null;

  const latRaw = raw.lat;
  const lonRaw = raw.lon;
  const lat =
    typeof latRaw === "number"
      ? latRaw
      : latRaw != null
        ? parseFloat(String(latRaw))
        : NaN;
  const lng =
    typeof lonRaw === "number"
      ? lonRaw
      : lonRaw != null
        ? parseFloat(String(lonRaw))
        : NaN;

  return {
    fullAddress: formatted,
    street,
    city,
    state,
    zip,
    country,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function buildLocationLine(parts: {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}): string {
  const segments: string[] = [];
  const st = parts.street.trim();
  if (st) segments.push(st);
  const cityState = [parts.city.trim(), parts.state.trim()]
    .filter(Boolean)
    .join(", ");
  if (cityState) segments.push(cityState);
  const z = parts.zip.trim();
  if (z) segments.push(z);
  const c = parts.country.trim();
  if (c) segments.push(c);
  return segments.join(", ");
}

function extractResultList(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.results)) {
    return o.results.filter(
      (r): r is Record<string, unknown> =>
        r !== null && typeof r === "object" && !Array.isArray(r)
    );
  }
  if (Array.isArray(o.features)) {
    return o.features
      .map((f) => {
        if (!f || typeof f !== "object" || !("properties" in f)) return null;
        const p = (f as { properties?: unknown }).properties;
        return p !== null && typeof p === "object" && !Array.isArray(p)
          ? (p as Record<string, unknown>)
          : null;
      })
      .filter((x): x is Record<string, unknown> => x !== null);
  }
  return [];
}

export interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (parsed: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  autoFocus?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address…",
  className,
  inputClassName,
  disabled,
  id,
  onKeyDown,
  autoFocus,
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncing, setDebouncing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runFetch = useCallback(
    async (text: string, signal: AbortSignal) => {
      if (!API_KEY) {
        setFetchError("Address search is not configured.");
        setResults([]);
        return;
      }

      const params = new URLSearchParams({
        text,
        filter: "countrycode:us",
        format: "json",
        apiKey: API_KEY,
      });

      const res = await fetch(`${GEOAPIFY_AUTOCOMPLETE}?${params}`, {
        signal,
      });

      if (!res.ok) {
        setFetchError("Could not load suggestions. Try again.");
        setResults([]);
        return;
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        setFetchError("Invalid response from address service.");
        setResults([]);
        return;
      }

      const list = extractResultList(data);
      setFetchError(null);
      setResults(list);
    },
    []
  );

  useEffect(() => {
    const q = value.trim();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (q.length < 3) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      setDebouncing(false);
      setFetchError(null);
      return;
    }

    setDebouncing(true);
    debounceRef.current = setTimeout(() => {
      setDebouncing(false);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setFetchError(null);

      runFetch(q, ac.signal)
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setFetchError("Could not load suggestions. Try again.");
          setResults([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [value, runFetch]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const handlePick = (raw: Record<string, unknown>) => {
    const parsed = parseGeoapifyResult(raw);
    if (!parsed) return;
    onSelect(parsed);
    onChange(parsed.fullAddress);
    setOpen(false);
    setResults([]);
  };

  const showDropdown = open && value.trim().length >= 3;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Input
          id={id}
          type="text"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          disabled={disabled || !API_KEY}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
            if (v.trim().length < 3) {
              setOpen(false);
              setResults([]);
              setFetchError(null);
            } else {
              setOpen(true);
            }
          }}
          onFocus={() => {
            if (value.trim().length >= 3) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn("w-full pr-10", inputClassName)}
        />
        {(debouncing || loading) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground pointer-events-none" />
        )}
      </div>

      {!API_KEY && (
        <p className="mt-1.5 text-xs text-amber-700">
          Set NEXT_PUBLIC_GEOAPIFY_API_KEY to enable address search.
        </p>
      )}

      {showDropdown && (
        <ul
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-left text-sm shadow-md"
          role="listbox"
        >
          {fetchError && (
            <li className="px-3 py-2 text-muted-foreground">{fetchError}</li>
          )}
          {!fetchError && (debouncing || loading) && (
            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
          )}
          {!fetchError &&
            !debouncing &&
            !loading &&
            results.map((raw, idx) => {
              const formatted = String(
                raw.formatted ?? raw.name ?? ""
              );
              return (
                <li key={`${formatted}-${idx}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handlePick(raw)}
                  >
                    {formatted || "Address"}
                  </button>
                </li>
              );
            })}
          {!fetchError &&
            !debouncing &&
            !loading &&
            results.length === 0 && (
              <li className="px-3 py-2 text-muted-foreground">
                No matches found
              </li>
            )}
        </ul>
      )}
    </div>
  );
}
