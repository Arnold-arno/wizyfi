import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/client";

// Query keys in the existing hooks (usePlans, useVouchers…) do not include the
// organization id, so the cache MUST be cleared whenever the active
// organization changes or the user signs out — otherwise tenant A's rows
// would briefly render under tenant B. See Header's organization switcher.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Don't hammer on 4xx (auth/permission/validation); do retry flaky network/5xx.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
