"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2 } from "lucide-react";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoDetect?: boolean;
  autoFocus?: boolean;
}

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }

    const existing = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
}

function extractCityState(
  results: google.maps.GeocoderResult[]
): string | null {
  for (const result of results) {
    const components = result.address_components;
    let city = "";
    let state = "";

    for (const c of components) {
      if (c.types.includes("locality")) city = c.long_name;
      if (c.types.includes("administrative_area_level_1"))
        state = c.short_name;
    }

    if (city && state) return `${city}, ${state}`;
  }
  return null;
}

const US_STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

async function reverseGeocodeNominatim(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    const city = addr.city || addr.town || addr.village || "";
    const stateRaw = addr.state || "";
    const state = US_STATE_ABBR[stateRaw] || stateRaw;

    if (city && state) return `${city}, ${state}`;
    return null;
  } catch {
    return null;
  }
}

export function LocationInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoDetect = true,
  autoFocus: autoFocusProp = true,
}: LocationInputProps) {
  const [mapsReady, setMapsReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [predictions, setPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const autocompleteRef =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoDetected = useRef(false);

  // Load the Google Maps script once
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    loadGoogleMapsScript()
      .then(() => setMapsReady(true))
      .catch(() => {});
  }, []);

  // Initialize services when Maps is ready
  useEffect(() => {
    if (!mapsReady) return;
    autocompleteRef.current = new google.maps.places.AutocompleteService();
    geocoderRef.current = new google.maps.Geocoder();
  }, [mapsReady]);

  // Feature 1: auto-detect location on mount (no Google dependency)
  useEffect(() => {
    if (!autoDetect || hasAutoDetected.current || !navigator.geolocation) return;
    hasAutoDetected.current = true;
    setDetecting(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;

        if (geocoderRef.current) {
          geocoderRef.current.geocode(
            { location: { lat, lng } },
            (results, status) => {
              setDetecting(false);
              if (status === google.maps.GeocoderStatus.OK && results) {
                const formatted = extractCityState(results);
                if (formatted) onChangeRef.current(formatted);
              }
            }
          );
        } else {
          const formatted = await reverseGeocodeNominatim(lat, lng);
          setDetecting(false);
          if (formatted) onChangeRef.current(formatted);
        }
      },
      () => {
        setDetecting(false);
      },
      { timeout: 8000 }
    );
  }, []);

  // Feature 2: debounced autocomplete
  const fetchPredictions = useCallback(
    (input: string) => {
      if (!autocompleteRef.current || input.trim().length < 2) {
        setPredictions([]);
        setShowDropdown(false);
        return;
      }

      autocompleteRef.current.getPlacePredictions(
        {
          input,
          types: ["locality"],
          componentRestrictions: { country: "us" },
        },
        (results, status) => {
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            results
          ) {
            setPredictions(results);
            setShowDropdown(true);
            setActiveIndex(-1);
          } else {
            setPredictions([]);
            setShowDropdown(false);
          }
        }
      );
    },
    []
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), 300);
  };

  const selectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
    const terms = prediction.terms;
    // terms[0] = city, terms[1] = state (typically)
    let formatted = prediction.structured_formatting.main_text;
    if (terms.length >= 2) {
      formatted = `${terms[0].value}, ${terms[1].value}`;
    }
    onChange(formatted);
    setPredictions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && predictions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i < predictions.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : predictions.length - 1));
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        selectPrediction(predictions[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        return;
      }
    }

    onKeyDown?.(e);
  };

  return (
    <div ref={wrapperRef} className="w-full relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (predictions.length > 0) setShowDropdown(true);
        }}
        placeholder={placeholder}
        className="w-full px-4 py-3 border border-gray-300 rounded-md focus:border-prisere-maroon focus:ring-1 focus:ring-prisere-maroon focus:outline-none text-center"
        autoFocus={autoFocusProp}
        autoComplete="off"
      />

      {detecting && (
        <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Detecting your location…</span>
        </div>
      )}

      {showDropdown && predictions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {predictions.map((p, i) => (
            <li
              key={p.place_id}
              onMouseDown={() => selectPrediction(p)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? "bg-prisere-maroon/10 text-prisere-dark-gray"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span>{p.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
