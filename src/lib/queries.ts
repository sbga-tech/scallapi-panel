import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Versioned } from "@/lib/api"
import { ApiKeyFamilies, CredentialList, RouteList, type RouteConfig } from "@/lib/schemas"
import { useClient } from "@/lib/session"

export const credentialRefetchMs = 240_000

export const queryKeys = {
  credentials: ["credentials"] as const,
  apiKeys: ["config", "api-keys"] as const,
  routes: ["config", "routes"] as const,
  credentialModels: (name: string) => ["credentials", "models", name] as const,
}

export function useCredentials() {
  const client = useClient()
  return useQuery({
    queryKey: queryKeys.credentials,
    queryFn: async () => CredentialList.parse(await client.get("/credentials")).files,
    refetchInterval: credentialRefetchMs,
  })
}

export function useApiKeyFamilies() {
  const client = useClient()
  return useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: async () => {
      const { data, etag } = await client.read("/config/api-keys")
      return { data: ApiKeyFamilies.parse(data), etag }
    },
  })
}

export function useRoutes() {
  const client = useClient()
  return useQuery({
    queryKey: queryKeys.routes,
    queryFn: async (): Promise<Versioned<RouteConfig[]>> => {
      const { data, etag } = await client.read("/config/routes")
      return { data: RouteList.parse(data), etag }
    },
  })
}

export function useSaveRoutes() {
  const client = useClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ routes, etag }: { routes: RouteConfig[]; etag: string | null }) =>
      client.put("/config/routes", routes, { ifMatch: etag }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.routes }),
  })
}

export function useSetCredentialDisabled() {
  const client = useClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, authIndex, disabled }: { name: string; authIndex?: string; disabled: boolean }) =>
      client.patch("/credentials/status", { name, auth_index: authIndex, disabled }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.credentials }),
  })
}

export function useRefreshCredential() {
  const client = useClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, authIndex }: { name: string; authIndex?: string }) =>
      client.post("/credentials/refresh", { name, auth_index: authIndex }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.credentials }),
  })
}
