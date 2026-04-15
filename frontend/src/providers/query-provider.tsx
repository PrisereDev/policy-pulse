"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { AuthSessionSync } from "@/components/auth/auth-session-sync";

interface ErrorWithStatus {
  status?: number;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: (failureCount, error: unknown) => {
              // Don't retry on 4xx errors except 408, 429
              const errorWithStatus = error as ErrorWithStatus;
              if (errorWithStatus?.status && errorWithStatus.status >= 400 && errorWithStatus.status < 500) {
                if (errorWithStatus.status === 408 || errorWithStatus.status === 429) {
                  return failureCount < 2;
                }
                return false;
              }
              // Retry on network errors and 5xx errors
              return failureCount < 3;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
          mutations: {
            retry: (failureCount, error: unknown) => {
              // Don't retry mutations on 4xx errors
              const errorWithStatus = error as ErrorWithStatus;
              if (errorWithStatus?.status && errorWithStatus.status >= 400 && errorWithStatus.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionSync />
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}