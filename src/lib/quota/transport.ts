import { z } from "zod"

import { ApiError, parseError, type Client } from "@/lib/api"
import type { Credential } from "@/lib/schemas"
import type { QuotaProvider, QuotaSnapshot } from "./types"

export const numeric = z.union([z.number().finite(), z.string().trim().min(1).transform(Number).pipe(z.number().finite())]).nullish().transform((value) => value ?? null)
export const text = z.union([z.string(), z.number()]).nullish().transform((value) => value == null ? null : String(value).trim() || null)
export const timestamp = z.union([z.string(), z.number()]).nullish().transform((value) => {
  if (value == null || value === "") return null
  const number = Number(value)
  const result = Number.isFinite(number) ? number < 1e12 ? number * 1000 : number : Date.parse(String(value))
  return Number.isFinite(result) ? result : null
})
export const object = z.record(z.string(), z.unknown())

const Envelope = z.object({ status_code: z.coerce.number(), header: z.record(z.string(), z.array(z.string())).optional().default({}), body: z.unknown() })
export type ProxyRequest = { method: string; url: string; header?: Record<string, string>; data?: string }
export type ProxyResponse = { status: number; headers: Record<string, string[]>; body: unknown }

export function decodeJson(value: unknown): unknown {
  if (typeof value !== "string") return value
  try { return JSON.parse(value) as unknown } catch { return value }
}

export async function proxy(client: Client, authIndex: string, request: ProxyRequest): Promise<ProxyResponse> {
  const response = Envelope.parse(await client.post("/requests/api-call", { auth_index: authIndex, ...request }))
  return { status: response.status_code, headers: response.header, body: decodeJson(response.body) }
}

export function successful(response: ProxyResponse): unknown {
  if (response.status < 200 || response.status >= 300) {
    const error = parseError(response.status, response.body, `HTTP ${response.status}`)
    throw new ApiError(response.status, error.message === `HTTP ${response.status}` ? error.message : `${response.status} ${error.message}`, error.code)
  }
  return response.body
}

export function authIndex(credential: Credential): string {
  if (!credential.auth_index?.trim()) throw new Error("quota.missingIdentity")
  return credential.auth_index.trim()
}

export function quotaProvider(credential: Credential): QuotaProvider | null {
  const raw = credential.provider.trim().toLowerCase().replaceAll("_", "-")
  const provider = raw === "x-ai" || raw === "grok" ? "xai" : raw === "kimi-ai" ? "kimi" : raw
  if (["codex", "claude", "antigravity", "kimi", "xai", "meta", "devin"].includes(provider)) return provider as QuotaProvider
  return [true, "true", "1"].includes(credential.supportsQuota as string | boolean) || [true, "true", "1"].includes(credential.supports_quota as string | boolean) ? "plugin" : null
}

export function emptySnapshot(provider: QuotaProvider): QuotaSnapshot {
  return { provider, windows: [], plan: null, credits: [], extras: [], fetchedAt: Date.now() }
}

export async function downloadCredential(client: Client, credential: Credential): Promise<Record<string, unknown>> {
  if (credential.runtime_only || !credential.name.trim()) throw new Error("quota.notDownloadable")
  const blob = await client.download(`/credentials/download?name=${encodeURIComponent(credential.name)}`)
  const result = object.safeParse(decodeJson(await blob.text()))
  if (!result.success) throw new Error("quota.invalidCredential")
  return result.data
}

export const claudeHeaders = { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "anthropic-beta": "oauth-2025-04-20", "User-Agent": "claude-cli/2.1.280 (external, cli)" }
export const codexHeaders = { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": "codex-tui/0.149.1 (Mac OS 26.5.2; arm64) iTerm.app/3.6.11 (codex-tui; 0.149.1)" }
export const antigravityHeaders = { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": "antigravity/hub/2.23.0 darwin/arm64" }
