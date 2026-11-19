export type QuotaProvider = "codex" | "claude" | "antigravity" | "kimi" | "xai" | "meta" | "devin" | "plugin"

export type QuotaWindow = {
  id: string
  label: string
  labelKey?: string
  group?: string
  usedPercent: number | null
  used?: number | null
  limit?: number | null
  unit?: string
  resetsAt: number | null
  periodHours?: number | null
}

export type QuotaCredit = {
  id: string
  label: string
  labelKey?: string
  balance: number | string | null
  unlimited?: boolean
  used?: number | null
  limit?: number | null
  unit?: string
  resetsAt?: number | null
}

export type QuotaMetric = {
  id: string
  label: string
  labelKey?: string
  value: string | number | boolean | null
  unit?: string
}

export type CodexResetCredit = { id: string; expiresAt: number | null; grantedAt: number | null }

export type QuotaSnapshot = {
  provider: QuotaProvider
  windows: QuotaWindow[]
  plan: string | null
  credits: QuotaCredit[]
  extras: QuotaMetric[]
  fetchedAt: number
  serverTimeOffsetMs?: number
  codex?: {
    accountId: string | null
    availableResets: number | null
    applicableResets: number | null
    resetCredits: CodexResetCredit[]
    resetError: string | null
    subscriptionEndsAt: number | null
  }
  pluginId?: string
}

export type OverageState = { status: "known"; value: boolean; confirmedAt: number } | { status: "unconfirmed"; target: boolean }
