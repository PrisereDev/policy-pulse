"use client";

import { Logo } from "@/components/brand/logo";
import { useBusinessDisplayName } from "@/hooks/use-business-display-name";

/** Header logo plus business name: policy-derived when available, else placeholder. */
export function AppLogoWithBusiness() {
  const { label, isPlaceholder } = useBusinessDisplayName();

  return (
    <Logo
      businessLabel={label}
      businessLabelIsPlaceholder={isPlaceholder}
    />
  );
}
