import { z } from "zod"

import type { Client } from "@/lib/api"
import type { Credential } from "@/lib/schemas"
import { authIndex, claudeHeaders, emptySnapshot, numeric, proxy, successful, text, timestamp } from "./transport"
import type { QuotaCredit, QuotaSnapshot, QuotaWindow } from "./types"

export const claudeOrigin = "https://api.anthropic.com"
const Window = z.object({ utilization: numeric, resets_at: timestamp, limit_dollars: numeric, used_dollars: numeric, remaining_dollars: numeric })
const Extra = z.object({ is_enabled: z.boolean().nullish(), monthly_limit: numeric, used_credits: numeric, utilization: numeric, currency: text, disabled_reason: text, user_disabled: z.boolean().nullish(), spend_limit_reached: z.boolean().nullish() })
const ScopedLimit = z.object({ kind: text, scope: z.object({ model: z.object({ display_name: text }).nullish() }).nullish(), percent: numeric, resets_at: timestamp, is_active: z.boolean().nullish() })
const Profile = z.object({ organization: z.object({ organization_type: text, subscription_status: text, rate_limit_tier: text, rateLimitTier: text, uuid: text }).nullish(), account: z.object({ has_claude_max: z.union([z.boolean(), z.number(), z.string()]).nullish(), has_claude_pro: z.union([z.boolean(), z.number(), z.string()]).nullish() }).nullish() })
const windowLabels: Record<string, string> = { five_hour: "fiveHour", seven_day: "weekly", seven_day_oauth_apps: "oauthWeekly", seven_day_opus: "opusWeekly", seven_day_sonnet: "sonnetWeekly", seven_day_cowork: "coworkWeekly", iguana_necktie: "fableWeekly" }

export async function fetchClaudeQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  const index = authIndex(credential)
  const profilePromise = proxy(client, index, { method: "GET", url: `${claudeOrigin}/api/oauth/profile`, header: claudeHeaders }).then(successful).then((value) => Profile.parse(value)).catch(() => null)
  const usage = z.record(z.string(), z.unknown()).parse(successful(await proxy(client, index, { method: "GET", url: `${claudeOrigin}/api/oauth/usage`, header: { ...claudeHeaders, Accept: "application/json" } })))
  const limits = z.array(ScopedLimit).catch([]).parse(usage.limits).filter((limit) => limit.kind === "weekly_scoped" && ["fable", "fable 5"].includes(limit.scope?.model?.display_name?.toLowerCase() ?? "") && limit.percent !== null)
  const fable = limits.find((limit) => limit.is_active) ?? limits[0]
  const windows: QuotaWindow[] = []
  const credits: QuotaCredit[] = []
  for (const [key, raw] of Object.entries(usage)) {
    const result = Window.safeParse(raw)
    if (!result.success) continue
    const window = result.data
    const dollar = !["five_hour", "seven_day", "extra_usage"].includes(key) && ["limit_dollars", "used_dollars", "remaining_dollars", "utilization", "resets_at"].every((field) => Object.hasOwn(raw as object, field))
    if (dollar) {
      credits.push({ id: key, label: key, labelKey: key === "iguana_necktie" ? "quota.cloudCredits" : undefined, balance: window.remaining_dollars, used: window.used_dollars, limit: window.limit_dollars, unit: "USD", resetsAt: window.resets_at })
    } else if (windowLabels[key] && !(key === "iguana_necktie" && fable)) {
      windows.push({ id: key, label: key, labelKey: `quota.${windowLabels[key]}`, usedPercent: window.utilization, resetsAt: window.resets_at, periodHours: key === "five_hour" ? 5 : 168 })
    }
  }
  if (fable) windows.push({ id: "fable", label: "", labelKey: "quota.fableWeekly", usedPercent: fable.percent, resetsAt: fable.resets_at, periodHours: 168 })
  const extra = Extra.safeParse(usage.extra_usage)
  const snapshot = emptySnapshot("claude")
  if (extra.success) {
    const data = extra.data
    snapshot.extras.push({ id: "extra-enabled", label: "", labelKey: "quota.extraUsage", value: data.is_enabled ?? null })
    if (data.disabled_reason) snapshot.extras.push({ id: "extra-disabled", label: "", labelKey: "quota.disabledReason", value: data.disabled_reason })
    if (data.user_disabled != null) snapshot.extras.push({ id: "extra-user-disabled", label: "", labelKey: "quota.userDisabled", value: data.user_disabled })
    if (data.spend_limit_reached != null) snapshot.extras.push({ id: "extra-limit", label: "", labelKey: "quota.spendLimitReached", value: data.spend_limit_reached })
    windows.push({ id: "extra-usage", label: "", labelKey: "quota.extraUsage", usedPercent: data.utilization, used: data.used_credits === null ? null : data.used_credits / 100, limit: data.monthly_limit === null ? null : data.monthly_limit / 100, unit: data.currency ?? "USD", resetsAt: null })
  }
  if (!windows.length && !credits.length && !extra.success && !usage.limits) throw new Error("quota.emptyData")
  const profile = await profilePromise
  const organization = profile?.organization
  const tier = organization?.rate_limit_tier ?? organization?.rateLimitTier ?? ""
  const max = profile?.account?.has_claude_max
  const pro = profile?.account?.has_claude_pro
  const enabled = [true, 1, "true", "1", "yes", "y", "on"]
  const disabled = [false, 0, "false", "0", "no", "n", "off"]
  const plan = organization?.organization_type === "claude_team" && organization.subscription_status === "active" ? "Team" : tier.endsWith("claude_max_20x") ? "Max 20x" : tier.endsWith("claude_max_5x") ? "Max 5x" : enabled.includes(max ?? "") ? "Max" : enabled.includes(pro ?? "") ? "Pro" : disabled.includes(max ?? "") && disabled.includes(pro ?? "") ? "Free" : null
  return { ...snapshot, plan, windows, credits }
}
