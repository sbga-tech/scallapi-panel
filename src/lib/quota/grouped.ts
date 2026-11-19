import { z } from "zod"

import type { Client } from "@/lib/api"
import type { Credential } from "@/lib/schemas"
import { antigravityHeaders, authIndex, decodeJson, downloadCredential, emptySnapshot, numeric, object, proxy, successful, text, timestamp } from "./transport"
import type { QuotaSnapshot, QuotaWindow } from "./types"

const fraction = z.union([numeric, z.string().trim().regex(/^-?\d+(?:\.\d+)?%$/).transform((value) => Number(value.slice(0, -1)) / 100)])
const Payload = z.preprocess((value) => {
  const envelope = object.safeParse(value)
  if (!envelope.success || Object.hasOwn(envelope.data, "models")) return value
  const nested = object.safeParse(decodeJson(envelope.data.body))
  return nested.success ? nested.data : value
}, object)
const Bucket = z.object({ bucketId: text, bucket_id: text, displayName: text, display_name: text, description: text, window: text, remainingFraction: fraction, remaining_fraction: fraction, resetTime: timestamp, reset_time: timestamp })
const Group = z.object({ displayName: text, display_name: text, description: text, buckets: z.array(Bucket).optional().default([]) })
const Tier = z.object({ id: text, name: text })
const Summary = z.object({ key: z.string(), label: z.string(), value: z.number().finite(), unit: text, format: text, currency: text })
const GroupPayload = Payload.pipe(z.object({
  groups: z.array(Group).optional().default([]),
  subscription: z.object({ plan: text, tierName: text, tierId: text }).nullish(),
  summary: z.array(Summary).optional().default([]),
  credits: z.array(z.object({ id: text, label: text, balance: numeric, limit: numeric, used: numeric, resetTime: timestamp, unit: text })).optional().default([]),
}))
const Plugin = z.object({ id: z.string(), registered: z.boolean().optional(), supports_quota: z.boolean().optional(), supportsQuota: z.boolean().optional(), quota_provider: text, quotaProvider: text, oauth_provider: text, oauthProvider: text, oauth_providers: z.array(z.string()).optional(), oauthProviders: z.array(z.string()).optional() })

function groupedWindows(payload: z.infer<typeof GroupPayload>): QuotaWindow[] {
  return payload.groups.flatMap((group, groupIndex) => group.buckets.flatMap((bucket, index) => {
    const remaining = bucket.remainingFraction ?? bucket.remaining_fraction
    if (remaining === null) return []
    const period = bucket.window?.toLowerCase()
    return [{ id: bucket.bucketId ?? bucket.bucket_id ?? `${groupIndex}-${index}`, label: bucket.displayName ?? bucket.display_name ?? bucket.description ?? bucket.window ?? `${index + 1}`, group: group.displayName ?? group.display_name ?? undefined, usedPercent: (1 - Math.max(0, Math.min(1, remaining))) * 100, resetsAt: bucket.resetTime ?? bucket.reset_time, periodHours: ["5h", "five-hour", "five_hour"].includes(period ?? "") ? 5 : ["weekly", "week"].includes(period ?? "") ? 168 : null }]
  })).sort((a, b) => (a.periodHours ?? Infinity) - (b.periodHours ?? Infinity) || a.label.localeCompare(b.label))
}

export async function resolvePluginId(client: Client, credential: Credential): Promise<string> {
  const explicit = text.parse(credential.quota_plugin_id ?? credential.quotaPluginId)
  if (explicit) return explicit
  const provider = text.parse(credential.quota_provider ?? credential.quotaProvider)?.toLowerCase()
  if (!provider) throw new Error("quota.pluginUnsupported")
  const plugins = z.object({ plugins: z.array(Plugin) }).parse(await client.get("/plugins")).plugins.filter((plugin) => plugin.registered && (plugin.supports_quota || plugin.supportsQuota))
  const match = plugins.find((plugin) => (plugin.quota_provider ?? plugin.quotaProvider)?.toLowerCase() === provider) ?? plugins.find((plugin) => plugin.id.toLowerCase() === provider) ?? plugins.find((plugin) => (plugin.oauth_provider ?? plugin.oauthProvider)?.toLowerCase() === provider || (plugin.oauth_providers ?? plugin.oauthProviders ?? []).some((id) => id.toLowerCase() === provider)) ?? (plugins.length === 1 ? plugins[0] : undefined)
  if (!match) throw new Error("quota.pluginMissing")
  return match.id
}

export async function fetchPluginQuota(client: Client, credential: Credential, method: "GET" | "POST" = "POST"): Promise<QuotaSnapshot> {
  const index = authIndex(credential)
  const pluginId = await resolvePluginId(client, credential)
  const path = `/plugins/${encodeURIComponent(pluginId)}/quota`
  const payload = GroupPayload.parse(method === "GET" ? await client.get(`${path}?auth_index=${encodeURIComponent(index)}`) : await client.post(path, { auth_index: index }))
  return { ...emptySnapshot("plugin"), pluginId, plan: payload.subscription?.tierName ?? payload.subscription?.plan ?? payload.subscription?.tierId ?? null, windows: groupedWindows(payload), extras: payload.summary.map((metric) => ({ id: metric.key, label: metric.label, value: metric.value, unit: metric.format === "currency" ? metric.currency ?? "USD" : metric.unit ?? undefined })), credits: payload.credits.map((credit, index) => ({ id: credit.id ?? String(index), label: credit.label ?? "", balance: credit.balance, used: credit.used, limit: credit.limit, unit: credit.unit ?? undefined, resetsAt: credit.resetTime })) }
}

export async function fetchAntigravityQuota(client: Client, credential: Credential): Promise<QuotaSnapshot> {
  const index = authIndex(credential)
  const metadata = object.catch({}).parse(credential.metadata)
  const attributes = object.catch({}).parse(credential.attributes)
  let project = text.parse(credential.project_id ?? credential.projectId ?? metadata.project_id ?? metadata.projectId ?? attributes.project_id ?? attributes.projectId ?? attributes.gemini_virtual_project)
  if (!project) {
    const downloaded = await downloadCredential(client, credential)
    const installed = object.catch({}).parse(downloaded.installed)
    const web = object.catch({}).parse(downloaded.web)
    project = text.parse(downloaded.project_id ?? downloaded.projectId ?? installed.project_id ?? installed.projectId ?? web.project_id ?? web.projectId)
  }
  if (!project) throw new Error("quota.missingProject")
  const subscription = proxy(client, index, { method: "POST", url: "https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", header: antigravityHeaders, data: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }) }).then(successful).then((raw) => z.object({ currentTier: Tier.nullish(), current_tier: Tier.nullish(), paidTier: Tier.nullish(), paid_tier: Tier.nullish() }).parse(raw)).then((value) => value.paidTier ?? value.paid_tier ?? value.currentTier ?? value.current_tier).catch(() => null)
  const snapshot = emptySnapshot("antigravity")
  let error: unknown = new Error("quota.emptyData")
  let observed = false
  for (const host of ["daily-cloudcode-pa.googleapis.com", "daily-cloudcode-pa.sandbox.googleapis.com", "cloudcode-pa.googleapis.com"]) {
    try {
      const response = await proxy(client, index, { method: "POST", url: `https://${host}/v1internal:retrieveUserQuotaSummary`, header: antigravityHeaders, data: JSON.stringify({ project }) })
      const payload = GroupPayload.parse(successful(response))
      observed = true
      const windows = groupedWindows(payload)
      const known = new Set(snapshot.windows.map((window) => window.id))
      snapshot.windows.push(...windows.filter((window) => !known.has(window.id)))
      snapshot.credits.push(...payload.credits.map((credit, index) => ({ id: credit.id ?? `${host}-${index}`, label: credit.label ?? "", balance: credit.balance, used: credit.used, limit: credit.limit, unit: credit.unit ?? undefined, resetsAt: credit.resetTime })))
      if (snapshot.serverTimeOffsetMs === undefined) {
        const date = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "date")?.[1]?.[0]
        if (date && Number.isFinite(Date.parse(date))) snapshot.serverTimeOffsetMs = Date.parse(date) - Date.now()
      }
      if (snapshot.windows.some((window) => window.id.toLowerCase().startsWith("gemini-"))) break
    } catch (caught: unknown) { error = caught }
  }
  if (!observed) throw error
  const tier = await subscription
  snapshot.plan = tier?.name ?? tier?.id ?? null
  return snapshot
}
