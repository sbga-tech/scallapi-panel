import { z } from "zod"

const nullableString = z.string().nullish().transform((value) => value ?? undefined)
const nullableNumber = z.number().nullish().transform((value) => value ?? undefined)

const CooldownRecord = z.object({
  scope: z.enum(["model", "credential"]),
  model_key: z.string().optional(),
  reason: z.string().optional().default("unknown"),
  retry_at: z.string(),
  remaining_seconds: z.number().int().positive(),
  http_status: z.number().int().optional(),
})
export type CooldownRecord = z.infer<typeof CooldownRecord>

const Cooldowns = z.unknown().transform((value): CooldownRecord[] | null => {
  if (value === undefined || value === null) return []
  const parsed = z.array(CooldownRecord).safeParse(value)
  return parsed.success ? parsed.data : null
})

const RequestBucket = z.object({ time: z.string(), success: z.number(), failed: z.number() })
export const Credential = z.looseObject({
  name: z.string(),
  id: z.string().optional(),
  provider: z.string(),
  email: nullableString,
  label: nullableString,
  account: nullableString,
  account_type: nullableString,
  auth_index: nullableString,
  disabled: z.boolean().optional().default(false),
  unavailable: z.boolean().optional().default(false),
  runtime_only: z.boolean().optional().default(false),
  status: nullableString,
  status_message: nullableString,
  recovery_stage: nullableString,
  next_action: nullableString,
  recovery_hint: nullableString,
  refresh_error: z
    .object({ code: nullableString, message: nullableString })
    .nullish()
    .transform((value) => value ?? undefined),
  cooldowns: Cooldowns,
  recent_requests: z.array(RequestBucket).nullish().transform((value) => value ?? []),
  success: z.number().optional().default(0),
  failed: z.number().optional().default(0),
  size: nullableNumber,
  siwc_bind_supported: z.boolean().optional().default(false),
  siwc_bound: z.boolean().optional().default(false),
  use_siwc: z.boolean().optional().default(false),
  siwc_expires_at: nullableString,
  priority: nullableNumber,
  weight: nullableNumber,
  plan_type: nullableString,
  project_id: nullableString,
  prefix: nullableString,
  proxy_url: nullableString,
  note: nullableString,
  modtime: nullableString,
  source: nullableString,
})
export type Credential = z.infer<typeof Credential>

export const CredentialList = z.object({ files: z.array(Credential).nullish().transform((value) => value ?? []) })

export const RouteConfig = z.object({
  name: z.string(),
  path: z.string(),
  "rewrite-to": z.string().optional().default(""),
  providers: z.array(z.string()).optional().default([]),
  credentials: z.array(z.string()).optional().default([]),
})
export type RouteConfig = z.infer<typeof RouteConfig>

export const RouteList = z.array(RouteConfig).nullish().transform((value) => value ?? [])

export const ApiKeyEntry = z.looseObject({
  "api-key": z.string().optional(),
  auth_index: nullableString,
  weight: nullableNumber,
  priority: nullableNumber,
  prefix: nullableString,
  "proxy-url": nullableString,
  disabled: z.boolean().optional(),
})
export type ApiKeyEntry = z.infer<typeof ApiKeyEntry>

export const ApiKeyGroup = z.looseObject({
  name: z.string().optional().default(""),
  "base-url": nullableString,
  priority: nullableNumber,
  prefix: nullableString,
  "proxy-url": nullableString,
  disabled: z.boolean().optional(),
  keys: z.array(ApiKeyEntry).optional().default([]),
  models: z.array(z.looseObject({ name: z.string(), alias: nullableString })).optional().default([]),
  "excluded-models": z.array(z.string()).optional().default([]),
})
export type ApiKeyGroup = z.infer<typeof ApiKeyGroup>

export const ApiKeyFamilies = z.record(z.string(), z.array(ApiKeyGroup)).nullish().transform((value) => value ?? {})
export type ApiKeyFamilies = z.infer<typeof ApiKeyFamilies>

export const CredentialModels = z.object({
  models: z
    .array(z.looseObject({ id: z.string().optional(), name: z.string().optional() }))
    .nullish()
    .transform((value) => value ?? []),
})
