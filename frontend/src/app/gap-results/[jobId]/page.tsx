"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function GapResultsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prisere-maroon" />
    </div>
  );
}
