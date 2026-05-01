"use client";

import { useState, useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  ArrowLeft,
  MapPin,
  Thermometer,
  Briefcase,
  Calendar,
  CreditCard,
  X,
  Plus,
} from "lucide-react";
import {
  AddressAutocomplete,
  type ParsedAddress,
} from "@/components/onboarding/address-autocomplete";

interface Question {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  type: "text" | "boolean";
  placeholder?: string;
  trueLabel?: string;
  falseLabel?: string;
}

const QUESTIONS: Question[] = [
  {
    id: "location",
    icon: MapPin,
    title: "Where is your business located?",
    subtitle:
      "This helps us assess location-specific risks like property and premise liability.",
    type: "text",
    placeholder: "e.g., New York, NY",
  },
  {
    id: "climate",
    icon: Thermometer,
    title:
      "Does your inventory require constant refrigeration or climate control?",
    subtitle:
      "Climate-sensitive inventory may need specific coverage for temperature-related losses.",
    type: "boolean",
  },
  {
    id: "events",
    icon: Calendar,
    title:
      "Does your revenue depend on specific, scheduled events happening nearby?",
    subtitle:
      "Event-dependent revenue can create unique exposure if cancellations or disruptions occur.",
    type: "boolean",
    trueLabel: "Yes (e.g., festivals, games, graduations)",
    falseLabel: "No",
  },
  {
    id: "professionalServices",
    icon: Briefcase,
    title:
      "Do clients pay you for professional advice, designs, or technical services?",
    subtitle:
      "Professional services carry unique liability risks that standard policies may not cover.",
    type: "boolean",
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "How do you handle customer data and payments?",
    subtitle:
      "Your transaction method affects your cyber exposure and the type of coverage you may need.",
    type: "boolean",
    trueLabel: "Mostly digital / online",
    falseLabel: "Mostly in-person / cash",
  },
];

export default function OnboardingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasMultipleLocations, setHasMultipleLocations] = useState<
    boolean | undefined
  >(undefined);
  const [additionalLocations, setAdditionalLocations] = useState<string[]>([]);
  const [showLocationSubView, setShowLocationSubView] = useState(false);

  const [addressSearch, setAddressSearch] = useState("");
  /** Set when user picks a Geoapify result (optional metadata for onboarding payload). */
  const [primaryGeo, setPrimaryGeo] = useState<{
    lat: string;
    lng: string;
  } | null>(null);

  const alreadyCompleted =
    isLoaded && !!user?.unsafeMetadata?.hasCompletedOnboarding;

  useEffect(() => {
    if (alreadyCompleted) {
      router.push("/dashboard");
    }
  }, [alreadyCompleted, router]);

  useEffect(() => {
    const q = QUESTIONS[currentStep];
    if (q?.id !== "location" || showLocationSubView) return;
    const loc = addressSearch.trim();
    setAnswers((prev) => {
      if (prev.location === loc) return prev;
      return { ...prev, location: loc };
    });
  }, [addressSearch, currentStep, showLocationSubView]);

  if (!isLoaded || isSignedIn !== true || alreadyCompleted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon"></div>
      </div>
    );
  }

  const question = QUESTIONS[currentStep];
  const isLastStep = currentStep === QUESTIONS.length - 1;
  const currentAnswer = answers[question.id];

  const primaryLocationText =
    question.id === "location" && !showLocationSubView
      ? addressSearch.trim()
      : typeof currentAnswer === "string"
        ? currentAnswer
        : "";

  const canProceed =
    question.id === "location"
      ? primaryLocationText.trim().length > 0 &&
        (hasMultipleLocations === false || showLocationSubView)
      : question.type === "text"
        ? typeof currentAnswer === "string" && currentAnswer.trim().length > 0
        : currentAnswer !== undefined;

  const handleNext = async () => {
    if (isLastStep) {
      setIsSubmitting(true);
      try {
        const locationStr = addressSearch.trim();

        const businessLocations = [
          { address: locationStr, isPrimary: true },
          ...additionalLocations
            .filter((loc) => loc.trim().length > 0)
            .map((loc) => ({ address: loc, isPrimary: false })),
        ];

        const answersPayload = {
          ...answers,
          location: locationStr,
          ...(primaryGeo
            ? { addressLat: primaryGeo.lat, addressLng: primaryGeo.lng }
            : {}),
        };
        sessionStorage.setItem(
          "onboardingAnswers",
          JSON.stringify(answersPayload)
        );
        sessionStorage.setItem(
          "businessLocations",
          JSON.stringify(businessLocations)
        );
        await user?.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            onboardingAnswers: answersPayload,
            businessLocations,
          },
        });
        router.push("/onboarding/upload");
      } catch (error) {
        console.error("Failed to save onboarding data:", error);
        setIsSubmitting(false);
      }
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (showLocationSubView) {
      setShowLocationSubView(false);
      return;
    }
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const setAnswer = (value: string | boolean) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  };

  const handlePrimaryAddressSelect = (parsed: ParsedAddress) => {
    setPrimaryGeo(
      parsed.lat != null && parsed.lng != null
        ? { lat: String(parsed.lat), lng: String(parsed.lng) }
        : null
    );
  };

  const Icon = question.icon;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg flex flex-col items-center">
        <div className="mb-8">
          <Logo width={200} height={66} />
        </div>

        <h1
          className="text-center text-2xl font-bold text-prisere-dark-gray mb-1"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Let&apos;s get to know your business
        </h1>
        <p
          className="text-center text-gray-600 mb-6"
          style={{ fontFamily: "var(--font-body)" }}
        >
          A few quick questions so we can tailor your experience
        </p>

        {/* Progress bar */}
        <div className="w-full mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-prisere-dark-gray">
              Question {currentStep + 1} of {QUESTIONS.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-prisere-maroon h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((currentStep + 1) / QUESTIONS.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Question card */}
        <Card className="w-full shadow-md overflow-visible">
          <CardContent className="p-8 overflow-visible">
            {question.id === "location" && showLocationSubView ? (
              <div className="flex flex-col items-center text-center w-full">
                <div className="rounded-full bg-prisere-maroon/10 p-4 w-16 h-16 mb-6 flex items-center justify-center">
                  <MapPin className="h-8 w-8 text-prisere-maroon" />
                </div>

                <h2
                  className="text-xl font-bold text-prisere-dark-gray mb-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Your business locations
                </h2>
                <p
                  className="text-gray-600 mb-6 text-sm"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Add all locations in this state for accurate risk assessment.
                </p>

                <div className="w-full space-y-3">
                  {/* Primary address (read-only) */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-md">
                    <MapPin className="h-4 w-4 text-prisere-maroon flex-shrink-0" />
                    <span className="flex-1 text-sm text-prisere-dark-gray text-left">
                      {currentAnswer as string}
                    </span>
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                      (primary)
                    </span>
                  </div>

                  {/* Additional locations */}
                  {additionalLocations.map((loc, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-1 text-left">
                        <AddressAutocomplete
                          id={`additional-address-${i}`}
                          value={loc}
                          onChange={(v) => {
                            setAdditionalLocations((prev) => {
                              const next = [...prev];
                              next[i] = v;
                              return next;
                            });
                          }}
                          onSelect={() => {}}
                          placeholder="Search a US address…"
                          autoFocus={i === additionalLocations.length - 1}
                        />
                      </div>
                      <button
                        onClick={() =>
                          setAdditionalLocations((prev) =>
                            prev.filter((_, j) => j !== i)
                          )
                        }
                        className="mt-3 p-1 text-gray-400 hover:text-red-500 transition-colors"
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() =>
                    setAdditionalLocations((prev) => [...prev, ""])
                  }
                  className="flex items-center gap-1.5 mt-4 text-sm text-prisere-maroon hover:text-prisere-maroon/80 font-medium transition-colors"
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Add another location
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="rounded-full bg-prisere-maroon/10 p-4 w-16 h-16 mb-6 flex items-center justify-center">
                  <Icon className="h-8 w-8 text-prisere-maroon" />
                </div>

                <h2
                  className="text-xl font-bold text-prisere-dark-gray mb-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {question.title}
                </h2>
                <p
                  className="text-gray-600 mb-8 text-sm"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {question.subtitle}
                </p>

                {question.type === "text" ? (
                  question.id === "location" ? (
                    <>
                      <div className="w-full space-y-4 text-left relative z-10 overflow-visible">
                        <div>
                          <label
                            htmlFor="address-search"
                            className="text-sm font-medium text-prisere-dark-gray mb-1.5 block"
                            style={{ fontFamily: "var(--font-heading)" }}
                          >
                            Search address
                          </label>
                          <AddressAutocomplete
                            id="address-search"
                            value={addressSearch}
                            onChange={(v) => {
                              setAddressSearch(v);
                              if (!v.trim()) setPrimaryGeo(null);
                            }}
                            onSelect={handlePrimaryAddressSelect}
                            placeholder="Start typing a US address…"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && canProceed) {
                                e.preventDefault();
                                handleNext();
                              }
                            }}
                          />
                        </div>
                      </div>

                      {primaryLocationText.trim().length > 0 && (
                          <div className="w-full mt-8">
                            <p
                              className="text-sm font-medium text-prisere-dark-gray mb-3"
                              style={{ fontFamily: "var(--font-heading)" }}
                            >
                              Do you have additional locations in this state?
                            </p>
                            <div className="flex gap-4 w-full">
                              <Button
                                variant={
                                  hasMultipleLocations === false
                                    ? "default"
                                    : "outline"
                                }
                                className={`flex-1 h-12 text-sm ${
                                  hasMultipleLocations === false
                                    ? "bg-prisere-maroon hover:bg-prisere-maroon/90 text-white"
                                    : ""
                                }`}
                                onClick={() => {
                                  setHasMultipleLocations(false);
                                  setShowLocationSubView(false);
                                  setAdditionalLocations([]);
                                }}
                              >
                                No, just this one
                              </Button>
                              <Button
                                variant={
                                  hasMultipleLocations === true
                                    ? "default"
                                    : "outline"
                                }
                                className={`flex-1 h-12 text-sm ${
                                  hasMultipleLocations === true
                                    ? "bg-prisere-maroon hover:bg-prisere-maroon/90 text-white"
                                    : ""
                                }`}
                                onClick={() => {
                                  setHasMultipleLocations(true);
                                  setShowLocationSubView(true);
                                  if (additionalLocations.length === 0) {
                                    setAdditionalLocations([""]);
                                  }
                                }}
                              >
                                Yes, I have other locations
                              </Button>
                            </div>
                          </div>
                        )}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={(currentAnswer as string) || ""}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder={question.placeholder}
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:border-prisere-maroon focus:ring-1 focus:ring-prisere-maroon focus:outline-none text-center"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canProceed) handleNext();
                      }}
                      autoFocus
                    />
                  )
                ) : (
                  <div className="flex gap-4 w-full">
                    <Button
                      variant={currentAnswer === true ? "default" : "outline"}
                      className={`flex-1 h-12 text-sm ${
                        currentAnswer === true
                          ? "bg-prisere-maroon hover:bg-prisere-maroon/90 text-white"
                          : ""
                      }`}
                      onClick={() => setAnswer(true)}
                    >
                      {question.trueLabel ?? "Yes"}
                    </Button>
                    <Button
                      variant={currentAnswer === false ? "default" : "outline"}
                      className={`flex-1 h-12 text-sm ${
                        currentAnswer === false
                          ? "bg-prisere-maroon hover:bg-prisere-maroon/90 text-white"
                          : ""
                      }`}
                      onClick={() => setAnswer(false)}
                    >
                      {question.falseLabel ?? "No"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between w-full mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 && !showLocationSubView}
            className={
              currentStep === 0 && !showLocationSubView ? "invisible" : ""
            }
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed || isSubmitting}
            className="bg-prisere-maroon hover:bg-prisere-maroon/90 disabled:opacity-50"
          >
            {isSubmitting ? (
              "Saving..."
            ) : isLastStep ? (
              <>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
