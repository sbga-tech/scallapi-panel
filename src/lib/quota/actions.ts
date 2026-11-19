import { z } from "zod"

import { ApiError, type Client } from "@/lib/api"
import type { Credential } from "@/lib/schemas"
import { claudeOrigin } from "./claude"
import { codexIdentity, codexOrigin, codexRequestHeaders } from "./codex"
import { resolvePluginId } from "./grouped"
import { authIndex, claudeHeaders, proxy, successful } from "./transport"
import type { OverageState } from "./types"

const ResetWindow = z.enum(["five_hour", "seven_day", "seven_day_overage_included"])
export const grantRetryWindowMs = 10 * 60 * 1000
const GrantTimestamp = z.string().refine((value) => Number.isFinite(Date.parse(value))).nullish().transform((value) => value == null ? null : Date.parse(value))
const Grant = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  label: z.string().catch("").transform((value) => Array.from(value).filter((char) => char.charCodeAt(0) >= 32 && (char.charCodeAt(0) < 127 || char.charCodeAt(0) > 159)).join("").slice(0, 120)),
  resets_total: z.number().int().nonnegative(), resets_left: z.number().int().nonnegative(),
  starts_at: GrantTimestamp, ends_at: GrantTimestamp,
  clears: z.array(z.unknown()).nullish().transform((values) => (values ?? []).filter((value): value is z.infer<typeof ResetWindow> => ResetWindow.safeParse(value).success)),
  paused: z.boolean().nullish().transform((value) => value ?? false), usable_now: z.boolean().nullish().transform((value) => value ?? false), use_requires_limit: z.boolean().nullish().transform((value) => value ?? true),
  percent_used: z.record(z.string(), z.number().finite().min(0).max(100)).catch({}),
  type: z.enum(["weekly", "session", "full"]).nullish().catch(null), gives_back_weekly: z.boolean().nullish().transform((value) => value ?? false),
}).refine((value) => value.resets_left <= value.resets_total)
const Grants = z.object({ eligible: z.boolean(), ineligible_reason: z.string().nullish(), at_limit: z.boolean().nullish().transform((value) => value ?? false), grants: z.array(Grant).nullish().transform((value) => value ?? []), next_grant_id: z.string().nullish(), weekly_resets_at: GrantTimestamp, cooldown_until: GrantTimestamp }).refine((value) => new Set(value.grants.map((grant) => grant.id)).size === value.grants.length)
export type ClaudeGrant = z.infer<typeof Grant>
export type ClaudeGrants = z.infer<typeof Grants>
const Settled = z.enum(["reset", "already_used", "not_limited", "cooldown", "ineligible", "unavailable", "rate_limited", "auth_error"])
export type GrantResult = z.infer<typeof Settled> | "cooldown_clear_failed"
export type GrantOperation = { grant: ClaudeGrant; organization: string; requestId: string; createdAt: number; result?: GrantResult; busy: boolean }
const grantOperations = new WeakMap<Client, Map<string, GrantOperation>>()
const grantLocks = new WeakMap<Client, Set<string>>()
const overageOperations = new WeakMap<Client, Map<string, { target: boolean; busy: boolean; unresolved: boolean }>>()

export function grantBlocker(status: ClaudeGrants, grant: ClaudeGrant, now = Date.now()): string | null {
  if (!status.eligible) return "ineligible"
  if (grant.paused) return "paused"
  if (!grant.usable_now) return "notUsable"
  if (grant.resets_left <= 0) return "exhausted"
  if (grant.use_requires_limit && !status.at_limit) return "notLimited"
  if (grant.gives_back_weekly && Object.keys(grant.percent_used).length > 0 && Object.values(grant.percent_used).every((value) => value === 0)) return "noUsage"
  if (grant.starts_at !== null && grant.starts_at > now) return "notStarted"
  if (grant.ends_at !== null && grant.ends_at <= now) return "expired"
  if (status.cooldown_until !== null && status.cooldown_until > now) return "cooldown"
  return null
}

export async function readClaudeGrants(client: Client, credential: Credential): Promise<ClaudeGrants> {
  try {
    const response = await proxy(client, authIndex(credential), { method: "GET", url: `${claudeOrigin}/api/oauth/usage?cedar_ember=1&skip_spend=1`, header: claudeHeaders })
    if (response.status === 401 || response.status === 403) throw new Error("quota.grantAuth")
    if (response.status === 429) throw new Error("quota.grantRateLimited")
    if (response.status < 200 || response.status >= 300) throw new Error("quota.grantReadFailed")
    const parsed = z.object({ cedar_ember: Grants }).safeParse(response.body)
    if (!parsed.success) throw new Error("quota.grantInvalid")
    return parsed.data.cedar_ember
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("quota.")) throw error
    throw new Error("quota.grantReadFailed", { cause: error })
  }
}

export function inspectGrantOperation(client: Client, credential: Credential): GrantOperation | undefined {
  return grantOperations.get(client)?.get(credential.auth_index ?? "")
}

export async function clearQuotaCooldown(client: Client, index: string) {
  const response = z.object({ status: z.literal("ok"), auth_index: z.literal(index) }).safeParse(await client.post("/routing/cooldown/reset", { auth_index: index }))
  if (!response.success) throw new Error("quota.cooldownFailed")
}

export async function redeemClaudeGrant(client: Client, credential: Credential, grantId: string, assertCurrent: () => void): Promise<{ result: GrantResult; unresolved: boolean }> {
  const index = authIndex(credential)
  assertCurrent()
  let operations = grantOperations.get(client)
  if (!operations) { operations = new Map(); grantOperations.set(client, operations) }
  let locks = grantLocks.get(client)
  if (!locks) { locks = new Set(); grantLocks.set(client, locks) }
  if (locks.has(index)) throw new Error("quota.actionBusy")
  locks.add(index)
  try {
  let operation = operations.get(index)
  if (operation?.busy) throw new Error("quota.actionBusy")
  if (operation?.result) operation = undefined
  if (operation && (operation.grant.id !== grantId || Date.now() - operation.createdAt >= grantRetryWindowMs)) throw new Error("quota.grantExpiredRetry")
  const wasRetry = Boolean(operation)
  let organization: string
  try {
    const profile = await proxy(client, index, { method: "GET", url: `${claudeOrigin}/api/oauth/profile`, header: claudeHeaders })
    if (profile.status < 200 || profile.status >= 300) throw new Error("quota.grantProfileFailed")
    organization = z.object({ organization: z.object({ uuid: z.string().uuid() }) }).parse(profile.body).organization.uuid.toLowerCase()
  } catch { throw new Error("quota.grantProfileFailed") }
  assertCurrent()
  if (operation && operation.organization !== organization) throw new Error("quota.grantIdentityChanged")
  if (!operation) {
    const status = await readClaudeGrants(client, credential)
    assertCurrent()
    const grant = status.grants.find((candidate) => candidate.id === grantId)
    if (!grant) throw new Error("quota.grantUnavailable")
    const blocker = grantBlocker(status, grant)
    if (blocker) throw new Error(`quota.grantBlocked.${blocker}`)
    const requestId = crypto.randomUUID()
    operation = { grant, organization, requestId, createdAt: Date.now(), busy: false }
    operations.set(index, operation)
  }
  if (operation.busy) throw new Error("quota.actionBusy")
  operation.busy = true
  try {
    let response
    assertCurrent()
    if (wasRetry && Date.now() - operation.createdAt >= grantRetryWindowMs) throw new Error("quota.grantExpiredRetry")
    try {
      response = await proxy(client, index, { method: "POST", url: `${claudeOrigin}/api/organizations/${organization}/reset_rate_limits`, header: claudeHeaders, data: JSON.stringify({ program: "cedar_ember", grant_id: grantId, request_id: operation.requestId }) })
    } catch { throw new Error("quota.grantUnknown") }
    assertCurrent()
    const result = response.status === 429 ? "rate_limited" : response.status === 401 || response.status === 403 ? "auth_error" : response.status >= 200 && response.status < 300 ? z.object({ result: Settled.exclude(["rate_limited", "auth_error"]) }).safeParse(response.body) : null
    const code = typeof result === "string" ? result : result?.success ? result.data.result : null
    if (!code) throw new Error("quota.grantUnknown")
    if (!wasRetry || code === "reset" || code === "already_used") operation.result = code
    if (code === "reset" || code === "already_used") {
      try { await clearQuotaCooldown(client, index) } catch { return { result: "cooldown_clear_failed", unresolved: false } }
    }
    return { result: code, unresolved: !operation.result }
  } finally { operation.busy = false }
  } finally { locks.delete(index) }
}

export async function redeemCodexCredit(client: Client, credential: Credential, assertCurrent: () => void) {
  const index = authIndex(credential)
  assertCurrent()
  const response = successful(await proxy(client, index, { method: "POST", url: `${codexOrigin}/wham/rate-limit-reset-credits/consume`, header: codexRequestHeaders(credential), data: JSON.stringify({ redeem_request_id: crypto.randomUUID() }) }))
  assertCurrent()
  const parsed = z.object({ code: z.enum(["reset", "already_redeemed"]) }).safeParse(response)
  if (!parsed.success) throw new Error("quota.resetNotConfirmed")
  try { await clearQuotaCooldown(client, index) } catch { throw new Error("quota.cooldownFailed") }
}

export async function resetPluginQuota(client: Client, credential: Credential, assertCurrent: () => void) {
  const pluginId = await resolvePluginId(client, credential)
  assertCurrent()
  return z.record(z.string(), z.unknown()).parse(await client.del(`/plugins/${encodeURIComponent(pluginId)}/quota?auth_index=${encodeURIComponent(authIndex(credential))}`))
}

export function overageKey(credential: Credential) {
  const { accountId } = codexIdentity(credential)
  return accountId ? `${accountId}|${credential.email?.trim().toLowerCase() || credential.name}` : null
}

export async function writeCodexOverage(client: Client, credential: Credential, target: boolean): Promise<OverageState> {
  const { accountId } = codexIdentity(credential)
  if (!accountId) throw new Error("quota.missingAccount")
  let operations = overageOperations.get(client)
  if (!operations) { operations = new Map(); overageOperations.set(client, operations) }
  const existing = operations.get(accountId)
  if (existing?.busy) throw new Error("quota.actionBusy")
  if (existing?.unresolved && existing.target !== target) throw new Error("quota.overageOpposite")
  const operation = { target, busy: true, unresolved: existing?.unresolved ?? false }
  operations.set(accountId, operation)
  const query = new URLSearchParams({ feature: "can_consume_personal_credits_chatpass", value: String(target) })
  try {
    let response
    try {
      response = await proxy(client, authIndex(credential), { method: "PATCH", url: `${codexOrigin}/settings/account_user_setting?${query}`, header: codexRequestHeaders(credential) })
    } catch { operation.unresolved = true; return { status: "unconfirmed", target } }
    if (response.status >= 400 && response.status < 500) {
      if (existing?.unresolved) { operation.unresolved = true; return { status: "unconfirmed", target } }
      throw new ApiError(response.status, "quota.overageFailed")
    }
    const parsed = z.object({ can_consume_personal_credits_chatpass: z.boolean() }).safeParse(response.body)
    if (response.status < 200 || response.status >= 300 || !parsed.success || parsed.data.can_consume_personal_credits_chatpass !== target) { operation.unresolved = true; return { status: "unconfirmed", target } }
    if (existing?.unresolved) return { status: "unconfirmed", target }
    return { status: "known", value: target, confirmedAt: Date.now() }
  } finally { operation.busy = false }
}
