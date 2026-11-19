import { z } from "zod"

import { ApiError, type Client } from "@/lib/api"
import type { Credential } from "@/lib/schemas"
import { fetchClaudeQuota } from "./claude"
import { fetchCodexQuota } from "./codex"
import { fetchAntigravityQuota, fetchPluginQuota } from "./grouped"
import { authIndex, downloadCredential, emptySnapshot, numeric, object, proxy, quotaProvider, successful, text, timestamp } from "./transport"
import type { QuotaSnapshot, QuotaWindow } from "./types"

const MetaWindow = z.object({ used_percent: numeric, resets_at: timestamp, window_duration_mins: numeric }).nullish()
const Meta = z.object({ subs_tier_name: text, is_subs_active: z.boolean().optional(), subs_usage: z.object({ tier: text, window: MetaWindow, weekly: MetaWindow }).nullish() })
const Devin = z.object({ userStatus: z.object({ planStatus: z.object({ planInfo: z.object({ planName: text }).nullish(), planStart: timestamp, planEnd: timestamp, dailyQuotaRemainingPercent: numeric, dailyQuotaResetAtUnix: timestamp, weeklyQuotaRemainingPercent: numeric, weeklyQuotaResetAtUnix: timestamp }) }) })
const KimiDetail = z.object({ name: text, title: text, scope: text, limit: numeric, used: numeric, remaining: numeric, reset_at: timestamp, resetAt: timestamp, reset_time: timestamp, resetTime: timestamp, reset_in: numeric, resetIn: numeric, ttl: numeric, duration: numeric, timeUnit: text })
const Kimi = z.object({ limits: z.array(KimiDetail.extend({ detail: KimiDetail.nullish(), window: z.object({ duration: numeric, timeUnit: text }).nullish() })).optional().default([]), usage: KimiDetail.nullish(), usages: z.object({ limit_month_total: z.object({ used_ratio: numeric, reset_time: timestamp }).nullish() }).nullish() })

async function fetchMetaQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  const index = authIndex(credential)
  const downloaded = await downloadCredential(client, credential)
  const token = z.string().trim().regex(/^dca:[^\s]+$/).safeParse(downloaded.dca_token)
  if (!token.success) throw new Error("quota.missingDca")
  let response
  try {
    response = await proxy(client, index, { method: "POST", url: "https://api.meta.ai/muse-code/key", header: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token.data}`, "x-api-version": "1.0.0" }, data: "{}" })
  } catch { throw new Error("quota.metaFailed") }
  if (response.status < 200 || response.status >= 300) throw new ApiError(response.status, "quota.metaFailed")
  const parsed = Meta.safeParse(response.body)
  if (!parsed.success) throw new Error("quota.invalidResponse")
  const payload = parsed.data
  return { ...emptySnapshot("meta"), plan: payload.subs_tier_name ?? payload.subs_usage?.tier ?? null, windows: (["window", "weekly"] as const).map((id) => ({ id, label: "", labelKey: `quota.${id === "window" ? "session" : "weekly"}`, usedPercent: payload.subs_usage?.[id]?.used_percent ?? null, resetsAt: payload.subs_usage?.[id]?.resets_at ?? null, periodHours: id === "weekly" ? 168 : (payload.subs_usage?.window?.window_duration_mins ?? 0) / 60 || null })), extras: payload.is_subs_active === undefined ? [] : [{ id: "active", label: "", labelKey: "quota.subscriptionActive", value: payload.is_subs_active }] }
}

async function fetchDevinQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  const payload = Devin.parse(successful(await proxy(client, authIndex(credential), { method: "POST", url: "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus", header: { "Content-Type": "application/json", "Connect-Protocol-Version": "1" }, data: JSON.stringify({ metadata: { ideName: "chisel", ideVersion: "3000.10.21", apiKey: "$TOKEN$", locale: "en", os: "darwin", extensionVersion: "3000.10.21", clientName: "chisel" } }) }))).userStatus.planStatus
  const windows = (["daily", "weekly"] as const).map((id) => {
    const remaining = payload[`${id}QuotaRemainingPercent`]
    return { id, label: "", labelKey: `quota.${id}`, usedPercent: remaining !== null && remaining >= 0 && remaining <= 100 ? 100 - remaining : null, resetsAt: payload[`${id}QuotaResetAtUnix`], periodHours: id === "daily" ? 24 : 168 }
  })
  if (!windows.some((window) => window.usedPercent !== null || window.resetsAt !== null)) throw new Error("quota.emptyData")
  return { ...emptySnapshot("devin"), plan: payload.planInfo?.planName ?? null, windows, extras: [{ id: "plan-start", label: "", labelKey: "quota.planStart", value: payload.planStart === null ? null : new Date(payload.planStart).toISOString() }, { id: "plan-end", label: "", labelKey: "quota.planEnd", value: payload.planEnd === null ? null : new Date(payload.planEnd).toISOString() }] }
}

async function fetchKimiQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  const index = authIndex(credential)
  const downloaded = await downloadCredential(client, credential)
  const domain = text.parse(downloaded.domain)?.toLowerCase()
  const baseUrl = text.parse(Object.hasOwn(downloaded, "base_url") ? downloaded.base_url : downloaded["base-url"])
  let baseDomain: string | null = null
  if (baseUrl) {
    try {
      const host = new URL(baseUrl).hostname
      baseDomain = host === "kimi.ai" || host.endsWith(".kimi.ai") ? "ai" : host === "kimi.com" || host.endsWith(".kimi.com") ? "com" : null
    } catch { baseDomain = null }
  }
  const type = text.parse(downloaded.type)
  const selected = domain ? ["ai", "kimi-ai", "kimi.ai"].includes(domain) || domain.endsWith(".kimi.ai") ? "ai" : "com" : baseDomain ?? (type ? /kimi-ai|kimi\.ai/i.test(type) ? "ai" : "com" : /kimi-ai|kimi\.ai/i.test(`${credential.provider} ${credential.id ?? ""} ${credential.name}`) ? "ai" : "com")
  const url = `https://api.kimi.${selected}/coding/v1/usages`
  const payload = Kimi.parse(successful(await proxy(client, index, { method: "GET", url, header: { Authorization: "Bearer $TOKEN$" } })))
  const windows: QuotaWindow[] = []
  for (const [position, item] of payload.limits.entries()) {
    const detail = item.detail ?? item
    const duration = item.window?.duration ?? item.duration ?? detail.duration
    const unit = (item.window?.timeUnit ?? item.timeUnit ?? detail.timeUnit ?? "MINUTE").replace(/^TIME_UNIT_/, "").toLowerCase().replace(/s$/, "")
    const hours = duration === null ? null : duration * ({ second: 1 / 3600, minute: 1 / 60, hour: 1, day: 24, week: 168 }[unit] ?? 1 / 60)
    const used = detail.used ?? (detail.limit !== null && detail.remaining !== null ? detail.limit - detail.remaining : null)
    if (used === null && detail.limit === null) continue
    const offset = detail.reset_in ?? detail.resetIn ?? detail.ttl
    windows.push({ id: `limit-${position}`, label: item.name ?? detail.name ?? item.title ?? detail.title ?? item.scope ?? detail.scope ?? (hours !== null ? `${hours}h` : `${position + 1}`), used: used ?? 0, limit: detail.limit ?? 0, usedPercent: detail.limit !== null && detail.limit > 0 ? (used ?? 0) / detail.limit * 100 : null, resetsAt: detail.reset_at ?? detail.resetAt ?? detail.reset_time ?? detail.resetTime ?? (offset !== null ? Date.now() + offset * 1000 : null), periodHours: hours })
  }
  const usage = payload.usage
  if (usage && (usage.used !== null || usage.limit !== null || usage.remaining !== null)) {
    const used = usage.used ?? (usage.limit !== null && usage.remaining !== null ? usage.limit - usage.remaining : 0)
    const offset = usage.reset_in ?? usage.resetIn ?? usage.ttl
    windows.push({ id: "summary", label: "", labelKey: "quota.weekly", used, limit: usage.limit ?? 0, usedPercent: usage.limit !== null && usage.limit > 0 ? used / usage.limit * 100 : null, resetsAt: usage.reset_at ?? usage.resetAt ?? usage.reset_time ?? usage.resetTime ?? (offset !== null ? Date.now() + offset * 1000 : null) })
  }
  const monthly = payload.usages?.limit_month_total
  if (monthly?.used_ratio !== null && monthly?.used_ratio !== undefined) windows.push({ id: "monthly", label: "", labelKey: "quota.monthly", usedPercent: monthly.used_ratio * 100, resetsAt: monthly.reset_time })
  if (!windows.length) throw new Error("quota.emptyData")
  const plan = await proxy(client, index, { method: "GET", url: url.replace(/\/usages$/, "/me"), header: { Authorization: "Bearer $TOKEN$", Accept: "application/json" } }).then(successful).then((body) => z.object({ user_id: z.string().trim().min(1), user_level_name: text }).parse(body).user_level_name).catch(() => null)
  return { ...emptySnapshot("kimi"), windows, plan }
}

const cents = z.union([numeric, z.object({ val: numeric }).transform((value) => value.val)])
const Billing = z.object({ config: z.object({ currentPeriod: z.object({ type: text, start: timestamp, end: timestamp }).nullish(), current_period: z.object({ type: text, start: timestamp, end: timestamp }).nullish(), creditUsagePercent: numeric, credit_usage_percent: numeric, productUsage: z.array(z.object({ product: text, usagePercent: numeric, usage_percent: numeric })).optional(), product_usage: z.array(z.object({ product: text, usagePercent: numeric, usage_percent: numeric })).optional(), monthlyLimit: cents, monthly_limit: cents, used: cents, onDemandCap: cents, on_demand_cap: cents, onDemandUsed: cents, on_demand_used: cents, prepaidBalance: cents, prepaid_balance: cents, billingPeriodStart: timestamp, billing_period_start: timestamp, billingPeriodEnd: timestamp, billing_period_end: timestamp }) })
const xaiHeaders = { Authorization: "Bearer $TOKEN$", "x-xai-token-auth": "xai-grok-cli", "x-grok-client-version": "1.0.70", accept: "*/*", "user-agent": "grok-pager/1.0.70 grok-shell/1.0.70 (macos; aarch64)" }

async function fetchXaiQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  const index = authIndex(credential)
  const snapshot = emptySnapshot("xai")
  const metadata = object.catch({}).parse(credential.metadata)
  const attributes = object.catch({}).parse(credential.attributes)
  const oauth = object.catch({}).parse(credential.oauth ?? metadata.oauth ?? attributes.oauth)
  const user = object.catch({}).parse(credential.user ?? metadata.user ?? attributes.user)
  const userId = [credential, metadata, attributes, oauth, user].flatMap((source) => [source.sub, source.subject, source.user_id, source.userId, source === user ? source.id : null]).map((value) => text.parse(value)).find(Boolean)
  const header = userId ? { ...xaiHeaders, "x-userid": userId } : xaiHeaders
  const records: Record<string, unknown>[] = [credential]
  for (let depth = 0, start = 0; depth < 2; depth++) {
    const end = records.length
    for (const record of records.slice(start, end)) {
      for (const key of ["metadata", "attributes", "oauth", "raw", "credential", "auth"]) {
        const parsed = object.safeParse(record[key])
        if (parsed.success) records.push(parsed.data)
      }
    }
    start = end
  }
  const usesApi = records.some((record) => [true, 1, "true", "1", "yes", "y", "on"].includes((record.using_api ?? record.usingApi) as string | number | boolean))
  const paidPrefix = records.some((record) => typeof record.prefix === "string" && record.prefix.trim().toLowerCase() === "paid")
  const paidTier = records.some((record) => ["access_token", "accessToken", "id_token", "idToken", "token"].some((key) => {
    const token = z.string().safeParse(record[key])
    if (!token.success) return false
    const segment = token.data.split(".")[1]
    if (!segment) return false
    try {
      const normalized = segment.replaceAll("-", "+").replaceAll("_", "/")
      const claims = object.parse(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (char) => char.charCodeAt(0)))))
      const tier = Object.entries(claims).find(([key]) => key.toLowerCase() === "tier" || key.toLowerCase().endsWith("/tier") || key.toLowerCase().endsWith(":tier"))
      return tier !== undefined && (numeric.parse(tier[1]) ?? 0) >= 1
    } catch { return false }
  }))
  const mode = usesApi && paidPrefix || paidTier
  let billingError: unknown = new Error("quota.emptyData")
  if (!mode) {
    const results = await Promise.allSettled(["https://cli-chat-proxy.grok.com/v1/billing?format=credits", "https://cli-chat-proxy.grok.com/v1/billing"].map(async (url) => Billing.parse(successful(await proxy(client, index, { method: "GET", url, header }))).config))
    const configs = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
    const failed = results.find((result) => result.status === "rejected")
    if (failed?.status === "rejected") billingError = failed.reason
    const weekly = configs.find((config) => (config.currentPeriod ?? config.current_period)?.type?.toLowerCase().includes("weekly") || config.creditUsagePercent !== null || config.credit_usage_percent !== null || (config.productUsage ?? config.product_usage ?? []).length > 0)
    if (weekly) {
      const period = weekly.currentPeriod ?? weekly.current_period
      snapshot.windows.push({ id: "weekly", label: "", labelKey: "quota.weekly", usedPercent: weekly.creditUsagePercent ?? weekly.credit_usage_percent, resetsAt: period?.end ?? weekly.billingPeriodEnd ?? weekly.billing_period_end, periodHours: period?.end && period.start ? (period.end - period.start) / 3600000 : null })
      snapshot.windows.push(...(weekly.productUsage ?? weekly.product_usage ?? []).map((product, index) => ({ id: `product-${index}`, label: product.product ?? String(index + 1), usedPercent: product.usagePercent ?? product.usage_percent, resetsAt: null })))
    }
    const monthly = configs.find((config) => (config.monthlyLimit ?? config.monthly_limit ?? config.used ?? config.onDemandCap ?? config.on_demand_cap ?? config.billingPeriodEnd ?? config.billing_period_end) !== null)
    if (monthly) {
      const limit = monthly.monthlyLimit ?? monthly.monthly_limit
      const used = monthly.used
      const onDemandLimit = monthly.onDemandCap ?? monthly.on_demand_cap
      const onDemandUsed = monthly.onDemandUsed ?? monthly.on_demand_used ?? (used !== null && limit !== null ? Math.max(0, used - limit) : null)
      const end = monthly.billingPeriodEnd ?? monthly.billing_period_end
      snapshot.windows.push({ id: "monthly", label: "", labelKey: "quota.monthly", usedPercent: limit !== null && limit > 0 && used !== null ? Math.min(used, limit) / limit * 100 : null, used: used === null ? null : limit !== null && limit > 0 ? Math.min(used, limit) / 100 : used / 100, limit: limit === null ? null : limit / 100, unit: "USD", resetsAt: end })
      snapshot.windows.push({ id: "on-demand", label: "", labelKey: "quota.onDemand", usedPercent: onDemandUsed !== null && onDemandLimit !== null && onDemandLimit > 0 ? onDemandUsed / onDemandLimit * 100 : null, used: onDemandUsed === null ? null : onDemandUsed / 100, limit: onDemandLimit === null ? null : onDemandLimit / 100, unit: "USD", resetsAt: end })
      const prepaid = monthly.prepaidBalance ?? monthly.prepaid_balance
      if (prepaid !== null) snapshot.credits.push({ id: "prepaid", label: "", labelKey: "quota.prepaid", balance: prepaid / 100, unit: "USD" })
    }
  }
  if (!snapshot.windows.length) {
    const [profile, health] = await Promise.allSettled([
      proxy(client, index, { method: "GET", url: "https://api.x.ai/v1/me", header: { Authorization: "Bearer $TOKEN$", accept: "application/json" } }).then(successful),
      proxy(client, index, { method: "POST", url: "https://api.x.ai/v1/chat/completions", header: { Authorization: "Bearer $TOKEN$", accept: "application/json", "Content-Type": "application/json" }, data: JSON.stringify({ model: "grok-4.5", messages: [{ role: "user", content: "ping" }], max_tokens: 1, stream: false }) }).then(successful),
    ])
    if (health.status === "rejected") throw mode ? health.reason : billingError
    const profileData = profile.status === "fulfilled" ? z.object({ user_id: text, userId: text, team_id: text, teamId: text }).safeParse(profile.value) : null
    snapshot.plan = "Paid"
    if (profileData?.success) {
      const userId = profileData.data.user_id ?? profileData.data.userId
      const teamId = profileData.data.team_id ?? profileData.data.teamId
      if (userId) snapshot.extras.push({ id: "user", label: "", labelKey: "quota.userId", value: userId })
      if (teamId) snapshot.extras.push({ id: "team", label: "", labelKey: "quota.teamId", value: teamId })
    }
    snapshot.extras.push({ id: "health", label: "", labelKey: "quota.apiHealth", value: true })
    return snapshot
  }
  const plans = await Promise.allSettled(["user?include=subscription", "settings"].map(async (path) => z.object({ subscriptionTier: text, subscription_tier: text, subscription_tier_display: text, subscriptionTierDisplay: text }).parse(successful(await proxy(client, index, { method: "GET", url: `https://cli-chat-proxy.grok.com/v1/${path}`, header: xaiHeaders })))))
  for (const result of plans.reverse()) if (result.status === "fulfilled") snapshot.plan ??= result.value.subscription_tier_display ?? result.value.subscriptionTierDisplay ?? result.value.subscriptionTier ?? result.value.subscription_tier
  return snapshot
}

export async function fetchQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  switch (quotaProvider(credential)) {
    case "codex": return fetchCodexQuota(client, credential)
    case "claude": return fetchClaudeQuota(client, credential)
    case "antigravity": return fetchAntigravityQuota(client, credential)
    case "kimi": return fetchKimiQuota(client, credential)
    case "xai": return fetchXaiQuota(client, credential)
    case "meta": return fetchMetaQuota(client, credential)
    case "devin": return fetchDevinQuota(client, credential)
    case "plugin": return fetchPluginQuota(client, credential)
    default: throw new Error("quota.unsupported")
  }
}
