"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { analysisApi } from "@/lib/api";

export type BusinessLocation = { address: string; isPrimary: boolean };

function buildStateFromUser(user: ReturnType<typeof useUser>["user"]) {
  const answers = (user?.unsafeMetadata?.onboardingAnswers as Record<
    string,
    unknown
  >) ?? {};
  const locations = (user?.unsafeMetadata?.businessLocations as
    | BusinessLocation[]
    | undefined) ?? [];

  const primary =
    locations.find((l) => l.isPrimary)?.address ??
    locations[0]?.address ??
    (typeof answers.location === "string" ? answers.location : "");

  const additional = locations
    .filter((l) => !l.isPrimary)
    .map((l) => l.address);

  return {
    primaryAddress: primary,
    additionalAddresses: additional.length > 0 ? additional : [],
    climate: answers.climate === true,
    events: answers.events === true,
    professionalServices: answers.professionalServices === true,
    payments: answers.payments === true,
  };
}

export function BusinessProfileModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [primaryAddress, setPrimaryAddress] = useState("");
  const [additionalAddresses, setAdditionalAddresses] = useState<string[]>([]);
  const [climate, setClimate] = useState(false);
  const [events, setEvents] = useState(false);
  const [professionalServices, setProfessionalServices] = useState(false);
  const [payments, setPayments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(() => {
    if (!user) return;
    const s = buildStateFromUser(user);
    setPrimaryAddress(s.primaryAddress);
    setAdditionalAddresses(s.additionalAddresses);
    setClimate(s.climate);
    setEvents(s.events);
    setProfessionalServices(s.professionalServices);
    setPayments(s.payments);
  }, [user]);

  useEffect(() => {
    if (open && user) {
      hydrate();
      setError(null);
    }
  }, [open, user, hydrate]);

  const addLocation = () => {
    setAdditionalAddresses((prev) => [...prev, ""]);
  };

  const removeAdditional = (index: number) => {
    setAdditionalAddresses((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAdditional = (index: number, value: string) => {
    setAdditionalAddresses((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedPrimary = primaryAddress.trim();
    if (!trimmedPrimary) {
      setError("Primary location is required.");
      return;
    }

    const extras = additionalAddresses
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const businessLocations: BusinessLocation[] = [
      { address: trimmedPrimary, isPrimary: true },
      ...extras.map((address) => ({ address, isPrimary: false as const })),
    ];

    const prevAnswers =
      (user.unsafeMetadata?.onboardingAnswers as Record<string, unknown>) ??
      {};
    const onboardingAnswers: Record<string, unknown> = {
      ...prevAnswers,
      location: trimmedPrimary,
      climate,
      events,
      professionalServices,
      payments,
    };

    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      await analysisApi.updateUserRiskProfile(
        {
          onboarding_answers: onboardingAnswers,
          business_locations: businessLocations,
        },
        token
      );

      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          onboardingAnswers,
          businessLocations,
        },
      });
      await user.reload();

      onOpenChange(false);
      onSaved();
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Could not save your profile. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Your business profile</DialogTitle>
          <DialogDescription>
            Confirm or update your details. Changes will be reflected in your
            next analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div>
            <label className="text-sm font-medium text-prisere-dark-gray block mb-1.5">
              Primary location
            </label>
            <Input
              value={primaryAddress}
              onChange={(e) => setPrimaryAddress(e.target.value)}
              placeholder="e.g. 123 Main St, Miami, FL 33101"
              className="w-full"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-prisere-dark-gray mb-2">
              Additional locations
            </p>
            <div className="space-y-2">
              {additionalAddresses.map((addr, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50/80 px-3 py-2"
                >
                  <Input
                    value={addr}
                    onChange={(e) => updateAdditional(i, e.target.value)}
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0 flex-1 px-0"
                    placeholder="Address"
                  />
                  <button
                    type="button"
                    onClick={() => removeAdditional(i)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    aria-label="Remove location"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLocation}
              className="mt-2 text-sm font-medium text-prisere-maroon hover:text-prisere-maroon/80 inline-flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              Add location
            </button>
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium text-prisere-dark-gray">
              Risk profile
            </p>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-700">
                Climate-controlled inventory
              </span>
              <Switch checked={climate} onCheckedChange={setClimate} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-700">
                Event-dependent revenue
              </span>
              <Switch checked={events} onCheckedChange={setEvents} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-700">
                Professional services
              </span>
              <Switch
                checked={professionalServices}
                onCheckedChange={setProfessionalServices}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-700">Digital payments</span>
              <Switch checked={payments} onCheckedChange={setPayments} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-prisere-maroon hover:bg-prisere-maroon/90 text-white"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
