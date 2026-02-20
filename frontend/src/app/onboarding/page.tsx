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
  Shield,
  CreditCard,
} from "lucide-react";

interface Question {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  type: "text" | "boolean";
  placeholder?: string;
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
    title: "Does your inventory require refrigeration or climate control?",
    subtitle:
      "Climate-sensitive inventory may need specific coverage for temperature-related losses.",
    type: "boolean",
  },
  {
    id: "events",
    icon: Briefcase,
    title:
      "Do clients pay you for professional advice, designs, or technical services?",
    subtitle:
      "Professional services carry unique liability risks that standard policies may not cover.",
    type: "boolean",
  },
  {
    id: "errorsAndOmissions",
    icon: Shield,
    title: "Do you currently have Errors & Omissions (E&O) coverage?",
    subtitle:
      "E&O insurance protects against claims of professional mistakes or negligent advice.",
    type: "boolean",
  },
  {
    id: "payments",
    icon: CreditCard,
    title: "Do you handle customer data and payments digitally?",
    subtitle:
      "Digital transactions create cyber exposure that may require specialized coverage.",
    type: "boolean",
  },
];

export default function OnboardingPage() {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const alreadyCompleted =
    isLoaded && !!user?.unsafeMetadata?.hasCompletedOnboarding;

  useEffect(() => {
    if (alreadyCompleted) {
      router.push("/dashboard");
    }
  }, [alreadyCompleted, router]);

  if (!isLoaded || !userId || alreadyCompleted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon"></div>
      </div>
    );
  }

  const question = QUESTIONS[currentStep];
  const isLastStep = currentStep === QUESTIONS.length - 1;
  const currentAnswer = answers[question.id];

  const canProceed =
    question.type === "text"
      ? typeof currentAnswer === "string" && currentAnswer.trim().length > 0
      : currentAnswer !== undefined;

  const handleNext = async () => {
    if (isLastStep) {
      setIsSubmitting(true);
      try {
        await user?.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            hasCompletedOnboarding: true,
            onboardingAnswers: answers,
          },
        });
        router.push("/dashboard");
      } catch (error) {
        console.error("Failed to save onboarding data:", error);
        setIsSubmitting(false);
      }
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const setAnswer = (value: string | boolean) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
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
        <Card className="w-full shadow-md">
          <CardContent className="p-8">
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
              ) : (
                <div className="flex gap-4 w-full">
                  <Button
                    variant={currentAnswer === true ? "default" : "outline"}
                    className={`flex-1 h-12 text-base ${
                      currentAnswer === true
                        ? "bg-prisere-maroon hover:bg-prisere-maroon/90 text-white"
                        : ""
                    }`}
                    onClick={() => setAnswer(true)}
                  >
                    Yes
                  </Button>
                  <Button
                    variant={currentAnswer === false ? "default" : "outline"}
                    className={`flex-1 h-12 text-base ${
                      currentAnswer === false
                        ? "bg-prisere-maroon hover:bg-prisere-maroon/90 text-white"
                        : ""
                    }`}
                    onClick={() => setAnswer(false)}
                  >
                    No
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between w-full mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className={currentStep === 0 ? "invisible" : ""}
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
