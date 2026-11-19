import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import type { Credential } from "@/lib/schemas"
import { useClient } from "@/lib/session"
import { inspectGrantOperation, overageKey, readClaudeGrants, redeemClaudeGrant, redeemCodexCredit, resetPluginQuota, writeCodexOverage } from "./actions"
import { fetchQuota } from "./providers"
import { quotaProvider } from "./transport"
import type { OverageState } from "./types"

export type { QuotaSnapshot, QuotaWindow, QuotaCredit, QuotaMetric, QuotaProvider, OverageState } from "./types"
export type { ClaudeGrant, ClaudeGrants, GrantOperation, GrantResult } from "./actions"
export { grantBlocker, grantRetryWindowMs } from "./actions"
export { fetchQuota } from "./providers"
export { fetchPluginQuota } from "./grouped"
export { quotaProvider } from "./transport"

export const quotaKey = (authIndex: string | undefined) => ["quota", authIndex] as const

function useQuotaSession() {
  const client = useClient()
  return useCallback(() => {
    if (!(client as typeof client & { isCurrent(): boolean }).isCurrent()) throw new Error("quota.sessionChanged")
  }, [client])
}

export function useQuota(credential: Credential) {
  const client = useClient()
  const provider = quotaProvider(credential)
  const canLoad = provider !== null && Boolean(credential.auth_index) && !credential.disabled && !credential.runtime_only
  const query = useQuery({
    queryKey: quotaKey(credential.auth_index),
    queryFn: () => fetchQuota(client, credential),
    enabled: canLoad && provider === "devin",
    staleTime: provider === "devin" ? 0 : Infinity,
    refetchOnMount: provider === "devin" ? "always" : false,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  return { ...query, provider, canLoad }
}

export function useQuotaReset(credential: Credential) {
  const client = useClient()
  const cache = useQueryClient()
  const assertCurrent = useQuotaSession()
  return useMutation({
    mutationKey: ["quota-reset", credential.auth_index],
    mutationFn: async () => {
      assertCurrent()
      const provider = quotaProvider(credential)
      if (provider === "codex") await redeemCodexCredit(client, credential, assertCurrent)
      else if (provider === "plugin") await resetPluginQuota(client, credential, assertCurrent)
      else throw new Error("quota.unsupported")
      assertCurrent()
      return fetchQuota(client, credential)
    },
    retry: false,
    onSuccess: (snapshot) => { assertCurrent(); cache.setQueryData(quotaKey(credential.auth_index), snapshot) },
  })
}

export function useClaudeResetGrants(credential: Credential, open: boolean) {
  const client = useClient()
  const cache = useQueryClient()
  const assertCurrent = useQuotaSession()
  const quota = useQuota(credential)
  const query = useQuery({ queryKey: ["quota-grants", credential.auth_index], queryFn: () => readClaudeGrants(client, credential), enabled: (open || quota.isFetched) && !quota.isFetching && quotaProvider(credential) === "claude" && !credential.disabled && !credential.runtime_only, staleTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const mutation = useMutation({
    mutationKey: ["quota-grant-claim", credential.auth_index],
    mutationFn: (grantId: string) => redeemClaudeGrant(client, credential, grantId, assertCurrent),
    retry: false,
    onSuccess: async (result) => {
      assertCurrent()
      if (result.result === "reset" || result.result === "already_used" || result.result === "cooldown_clear_failed") {
        await cache.fetchQuery({ queryKey: quotaKey(credential.auth_index), queryFn: () => fetchQuota(client, credential), staleTime: 0, retry: false }).catch(() => null)
        assertCurrent()
      }
      await cache.invalidateQueries({ queryKey: ["quota-grants", credential.auth_index] })
    },
  })
  const busy = useIsMutating({ mutationKey: ["quota-grant-claim", credential.auth_index] }) > 0
  return { query, mutation, busy, operation: inspectGrantOperation(client, credential) }
}

export function useCodexOverage(credential: Credential) {
  const client = useClient()
  const cache = useQueryClient()
  const assertCurrent = useQuotaSession()
  const key = overageKey(credential)
  const queryKey = ["quota-overage", key] as const
  const query = useQuery<OverageState | null>({ queryKey, queryFn: () => null, enabled: false, staleTime: Infinity, gcTime: Infinity })
  const mutation = useMutation({
    mutationKey: ["quota-overage-write", key],
    mutationFn: (target: boolean) => { assertCurrent(); return writeCodexOverage(client, credential, target) },
    retry: false,
    onSuccess: (state) => {
      assertCurrent()
      const account = key?.split("|")[0]
      cache.setQueriesData<OverageState | null>({ queryKey: ["quota-overage"], predicate: (query) => typeof query.queryKey[1] === "string" && query.queryKey[1].startsWith(`${account}|`) }, state.status === "unconfirmed" ? state : null)
      cache.setQueryData<OverageState>(queryKey, state)
    },
  })
  const busy = useIsMutating({ mutationKey: ["quota-overage-write", key] }) > 0
  return { state: query.data, mutation, busy, available: key !== null }
}
