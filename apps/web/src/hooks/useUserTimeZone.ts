import { DEFAULT_USER_TIME_ZONE } from "@fleet/constants";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/hooks/useApiClient";

export function useUserTimeZone(): string {
  const api = useApiClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
    staleTime: 60_000,
  });
  return me.data?.timeZone ?? DEFAULT_USER_TIME_ZONE;
}
