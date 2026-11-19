import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { queryKeys } from "@/lib/queries"
import type { Credential } from "@/lib/schemas"
import { useClient } from "@/lib/session"

export const RefreshResults = z.object({
  ok: z.literal(true),
  results: z.array(z.object({ id: z.string(), success: z.boolean(), error: z.string().optional() })),
})
export type RefreshResult = z.infer<typeof RefreshResults>["results"][number]

const BatchResult = z.looseObject({
  failed: z
    .array(z.object({ name: z.string(), error: z.string().optional() }))
    .nullish()
    .transform((value) => value ?? []),
})
export type BatchFailure = z.infer<typeof BatchResult>["failed"][number]

function useInvalidateCredentials() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.credentials })
}

export function useSetDisabled() {
  const client = useClient()
  const invalidate = useInvalidateCredentials()
  return useMutation({
    mutationFn: async ({ credentials, disabled }: { credentials: Credential[]; disabled: boolean }) => {
      const failures: BatchFailure[] = []
      for (const credential of credentials) {
        try {
          await client.patch("/credentials/status", {
            name: credential.name,
            disabled,
            ...(credential.auth_index ? { auth_index: credential.auth_index } : {}),
          })
        } catch (error) {
          failures.push({ name: credential.name, error: (error as Error).message })
        }
      }
      return failures
    },
    onSettled: invalidate,
  })
}

export function useRefreshOne() {
  const client = useClient()
  const invalidate = useInvalidateCredentials()
  return useMutation({
    mutationFn: async (credential: Credential) => {
      await client.post("/credentials/refresh", {
        name: credential.name,
        ...(credential.auth_index ? { auth_index: credential.auth_index } : {}),
      })
    },
    onSettled: invalidate,
  })
}

export function useRefreshAll() {
  const client = useClient()
  const invalidate = useInvalidateCredentials()
  return useMutation({
    mutationFn: async () => RefreshResults.parse(await client.post("/credentials/refresh", { all: true })).results,
    onSettled: invalidate,
  })
}

export function useDeleteCredentials() {
  const client = useClient()
  const invalidate = useInvalidateCredentials()
  return useMutation({
    mutationFn: async (target: { names: string[] } | { all: true }) => {
      if ("all" in target) {
        await client.del("/credentials?all=true")
        return []
      }
      return BatchResult.parse(await client.del("/credentials", { names: target.names })).failed
    },
    onSettled: invalidate,
  })
}

export function useResetCooldown() {
  const client = useClient()
  const invalidate = useInvalidateCredentials()
  return useMutation({
    mutationFn: (authIndex: string) => client.post("/routing/cooldown/reset", { auth_index: authIndex }),
    onSettled: invalidate,
  })
}

export function useDownloadCredentials() {
  const client = useClient()
  return useMutation({
    mutationFn: async (credentials: Credential[]) => {
      for (const credential of credentials) {
        const blob = await client.download(`/credentials/download?name=${encodeURIComponent(credential.name)}`)
        const link = document.createElement("a")
        link.href = URL.createObjectURL(blob)
        link.download = credential.name
        link.click()
        URL.revokeObjectURL(link.href)
      }
    },
  })
}
