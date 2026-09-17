import { useMemo } from "react";
import { FleetApiClient } from "@fleet/api-client";
import { useAuthStore } from "@/stores/authStore";
import { getApiBaseUrl } from "@/lib/amplify";

export function useApiClient() {
  const getAccessToken = useAuthStore((s) => s.getAccessToken);

  return useMemo(
    () => new FleetApiClient(getApiBaseUrl(), getAccessToken),
    [getAccessToken],
  );
}
