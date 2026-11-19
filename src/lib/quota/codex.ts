import { z } from "zod"

import type { Client } from "@/lib/api"
import type { Credential } from "@/lib/schemas"
import { authIndex, codexHeaders, decodeJson, emptySnapshot, numeric, object, proxy, successful, text, timestamp } from "./transport"
import type { CodexResetCredit, QuotaSnapshot, QuotaWindow } from "./types"

export const codexOrigin = "https://chatgpt.com/backend-api"

const Window = z.object({
  used_percent: numeric, usedPercent: numeric,
  reset_at: timestamp, resetAt: timestamp,
  reset_after_seconds: numeric, resetAfterSeconds: numeric,
  limit_window_seconds: numeric, limitWindowSeconds: numeric,
})
const Limit = z.object({
  primary_window: Window.nullish(), primaryWindow: Window.nullish(),
  secondary_window: Window.nullish(), secondaryWindow: Window.nullish(),
  limit_reached: z.boolean().optional(), limitReached: z.boolean().optional(), allowed: z.boolean().optional(),
})
const ResetCredits = z.object({
  available_count: numeric, availableCount: numeric,
  applicable_available_count: numeric, applicableAvailableCount: numeric,
  credits: z.array(z.object({ id: text, status: text, reset_type: text, resetType: text, expires_at: timestamp, expiresAt: timestamp, granted_at: timestamp, grantedAt: timestamp })).optional().default([]),
}).refine((value) => value.credits.length > 0 || value.available_count !== null || value.availableCount !== null || value.applicable_available_count !== null || value.applicableAvailableCount !== null)
const Usage = z.object({
  plan_type: text, planType: text,
  rate_limit: Limit.nullish(), rateLimit: Limit.nullish(),
  code_review_rate_limit: Limit.nullish(), codeReviewRateLimit: Limit.nullish(),
  additional_rate_limits: z.array(z.object({ limit_name: text, limitName: text, metered_feature: text, meteredFeature: text, rate_limit: Limit.nullish(), rateLimit: Limit.nullish() })).optional(),
  additionalRateLimits: z.array(z.object({ limit_name: text, limitName: text, metered_feature: text, meteredFeature: text, rate_limit: Limit.nullish(), rateLimit: Limit.nullish() })).optional(),
  credits: z.object({ balance: text, unlimited: z.boolean().optional() }).nullish(),
  rate_limit_reset_credits: z.unknown(), rateLimitResetCredits: z.unknown(),
})
type RateLimit = z.infer<typeof Limit>
type UsageWindow = z.infer<typeof Window>

function tokenPayload(value: unknown): Record<string, unknown> {
  const record = object.safeParse(value)
  if (record.success) return record.data
  if (typeof value !== "string") return {}
  const direct = object.safeParse(decodeJson(value))
  if (direct.success) return direct.data
  const segment = value.split(".")[1]
  if (!segment) return {}
  try { return object.parse(JSON.parse(atob(segment.replaceAll("-", "+").replaceAll("_", "/")))) } catch { return {} }
}

export function codexIdentity(credential: Credential) {
  const sources = [credential, object.catch({}).parse(credential.metadata), object.catch({}).parse(credential.attributes)]
  const claims = sources.map((source) => tokenPayload(source.id_token))
  const authClaims = claims.map((claim) => object.catch({}).parse(claim["https://api.openai.com/auth"] ?? claim))
  const accountId = [...sources, ...claims].map((source) => text.parse(source.chatgpt_account_id ?? source.chatgptAccountId)).find(Boolean) ?? null
  const plan = [...sources, ...authClaims].map((source) => text.parse(source.plan_type ?? source.planType ?? source.chatgpt_plan_type)).find(Boolean) ?? null
  const subscriptionEndsAt = [...sources, ...authClaims].flatMap((source) => {
    const subscription = object.catch({}).parse(source.subscription)
    return [source.chatgpt_subscription_active_until, source.chatgptSubscriptionActiveUntil, source.subscription_active_until, source.subscriptionActiveUntil, subscription.active_until, subscription.activeUntil]
  }).map((value) => timestamp.catch(null).parse(value)).find((value) => value !== null) ?? null
  return { accountId, plan, subscriptionEndsAt }
}

export function codexRequestHeaders(credential: Credential) {
  const { accountId } = codexIdentity(credential)
  return accountId ? { ...codexHeaders, "Chatgpt-Account-Id": accountId } : codexHeaders
}

function rateWindows(limit: RateLimit | null | undefined, prefix: string, label: string): QuotaWindow[] {
  if (!limit) return []
  const primary = limit.primary_window ?? limit.primaryWindow
  const secondary = limit.secondary_window ?? limit.secondaryWindow
  const candidates = [primary, secondary].filter((window): window is UsageWindow => window != null)
  const seconds = (window: UsageWindow) => window.limit_window_seconds ?? window.limitWindowSeconds
  const monthly = (window: UsageWindow) => (seconds(window) ?? 0) >= 28 * 86400 && (seconds(window) ?? 0) <= 31 * 86400
  const long = candidates.find((window) => seconds(window) === 604800 || monthly(window)) ?? (secondary !== primary ? secondary : null)
  const short = candidates.find((window) => seconds(window) === 18000) ?? (primary !== long ? primary : null)
  return [short, long].flatMap((window, index) => {
    if (!window) return []
    const resetsAt = window.reset_at ?? window.resetAt ?? ((window.reset_after_seconds ?? window.resetAfterSeconds) != null ? Date.now() + (window.reset_after_seconds ?? window.resetAfterSeconds ?? 0) * 1000 : null)
    const period = index === 0 ? "fiveHour" : monthly(window) ? "monthly" : "weekly"
    return [{ id: `${prefix}-${period}`, label, labelKey: `quota.${period}`, group: label || undefined, usedPercent: window.used_percent ?? window.usedPercent ?? ((limit.limit_reached || limit.limitReached || limit.allowed === false) && resetsAt !== null ? 100 : null), resetsAt, periodHours: seconds(window) === null ? null : (seconds(window) ?? 0) / 3600 }]
  })
}

export async function fetchCodexQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  const index = authIndex(credential)
  const header = codexRequestHeaders(credential)
  const identity = codexIdentity(credential)
  const subscription = identity.accountId ? proxy(client, index, { method: "GET", url: `${codexOrigin}/subscriptions?account_id=${encodeURIComponent(identity.accountId)}`, header }).then(successful).then((body) => z.object({ active_until: timestamp }).parse(body).active_until).catch(() => null) : Promise.resolve(null)
  const payload = Usage.parse(successful(await proxy(client, index, { method: "GET", url: `${codexOrigin}/wham/usage`, header })))
  let resetError: string | null = null
  const resetPayload = await proxy(client, index, { method: "GET", url: `${codexOrigin}/wham/rate-limit-reset-credits`, header: { ...header, Accept: "application/json", "OpenAI-Beta": "codex-1", Originator: "Codex Desktop" } }).then(successful).then((body) => ResetCredits.parse(body)).catch((error: unknown) => { resetError = error instanceof Error ? error.message : "quota.invalidResponse"; return null })
  const usageResets = ResetCredits.safeParse(payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits)
  const credits: CodexResetCredit[] = (resetPayload?.credits ?? []).filter((credit) => credit.status === "available" && (credit.reset_type ?? credit.resetType) === "codex_rate_limits" && (credit.expires_at ?? credit.expiresAt) !== null).map((credit) => ({ id: credit.id ?? "", expiresAt: credit.expires_at ?? credit.expiresAt, grantedAt: credit.granted_at ?? credit.grantedAt }))
  const usageResetData = usageResets.success ? usageResets.data : null
  const availableResets = resetPayload?.available_count ?? resetPayload?.availableCount ?? (credits.length > 0 ? credits.length : null) ?? usageResetData?.available_count ?? usageResetData?.availableCount ?? null
  return {
    ...emptySnapshot("codex"),
    plan: payload.plan_type ?? payload.planType ?? identity.plan,
    windows: [...rateWindows(payload.rate_limit ?? payload.rateLimit, "code", ""), ...rateWindows(payload.code_review_rate_limit ?? payload.codeReviewRateLimit, "review", "Code review"), ...(payload.additional_rate_limits ?? payload.additionalRateLimits ?? []).flatMap((item, index) => rateWindows(item.rate_limit ?? item.rateLimit, `additional-${index}`, item.limit_name ?? item.limitName ?? item.metered_feature ?? item.meteredFeature ?? `Limit ${index + 1}`))],
    credits: [{ id: "account", label: "", labelKey: "quota.credits", balance: payload.credits?.balance ?? null, unlimited: payload.credits?.unlimited }],
    codex: { accountId: identity.accountId, availableResets, applicableResets: usageResetData?.applicable_available_count ?? usageResetData?.applicableAvailableCount ?? resetPayload?.applicable_available_count ?? resetPayload?.applicableAvailableCount ?? availableResets, resetCredits: credits, resetError, subscriptionEndsAt: await subscription ?? identity.subscriptionEndsAt },
  }
}
