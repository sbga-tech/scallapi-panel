import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProviderIcon } from "@/components/provider-icon"
import { credentialState, stateTone, statusDetail } from "@/lib/credential-status"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { queryKeys } from "@/lib/queries"
import { useClient } from "@/lib/session"
import { CredentialList, type Credential } from "@/lib/schemas"
import { QuotaDetail } from "@/components/quota/quota-detail"
import { CredentialModelsDialog } from "@/pages/credentials/details/credential-models-dialog"

const Alias = z.object({
  name: z.string().optional().default(""),
  alias: z.string().optional().default(""),
  fork: z.boolean().optional(),
  "display-name": z.string().optional(),
  "force-mapping": z.boolean().optional(),
})
const Rule = z.object({
  status: z.number().optional(),
  match: z.array(z.string()).optional(),
  "match-regexr": z.array(z.string()).optional(),
  action: z.string().optional(),
})
type Alias = z.infer<typeof Alias>
type Rule = z.infer<typeof Rule>
type Editable = {
  requestRetry: string
  aliases: Alias[]
  errors: Rule[]
  prefix: string
  proxyUrl: string
  priority: string
  weight: string
  note: string
  headers: string
  websockets: boolean | undefined
  excludedModels: string
  cloakMode: string
  cloakStrict: boolean | undefined
  cloakSensitiveWords: string
  cloakCacheUserId: boolean | undefined
  timezone: string
  fingerprintProfile: string
  interactions: boolean | undefined
}
type FormErrors = Partial<Record<keyof Editable | "save", string>>
type RecordValue = Record<string, unknown>

const MAX_WEIGHT = 1_000_000

function recordOf(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {}
}

function readValue(record: RecordValue, key: string): unknown {
  if (key in record) return record[key]
  const metadata = recordOf(record.metadata)
  return key in metadata ? metadata[key] : undefined
}

function stringValue(value: unknown): string {
  return typeof value === "string"
    ? value
    : value === null || value === undefined
      ? ""
      : String(value)
}

function numberValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : ""
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function listValue(value: unknown): string {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .join("\n")
    : ""
}

function headersValue(value: unknown): string {
  const parsed = z.record(z.string(), z.string()).safeParse(value)
  return parsed.success && Object.keys(parsed.data).length > 0
    ? JSON.stringify(parsed.data, null, 2)
    : ""
}

function parseEditable(source: RecordValue): Editable {
  const aliases = z.array(Alias).safeParse(readValue(source, "model_aliases"))
  const errors = z
    .array(Rule)
    .safeParse(readValue(source, "request_scoped_errors"))
  return {
    requestRetry: numberValue(readValue(source, "request_retry")),
    aliases: aliases.success ? aliases.data : [],
    errors: errors.success ? errors.data : [],
    prefix: stringValue(readValue(source, "prefix")),
    proxyUrl: stringValue(readValue(source, "proxy_url")),
    priority: numberValue(readValue(source, "priority")),
    weight: numberValue(readValue(source, "weight")),
    note: stringValue(readValue(source, "note")),
    headers: headersValue(readValue(source, "headers")),
    websockets: booleanValue(readValue(source, "websockets")),
    excludedModels: listValue(readValue(source, "excluded_models")),
    cloakMode: stringValue(readValue(source, "cloak_mode")),
    cloakStrict: booleanValue(readValue(source, "cloak_strict_mode")),
    cloakSensitiveWords: listValue(readValue(source, "cloak_sensitive_words")),
    cloakCacheUserId: booleanValue(readValue(source, "cloak_cache_user_id")),
    timezone: stringValue(readValue(source, "timezone")),
    fingerprintProfile: stringValue(readValue(source, "fingerprint_profile")),
    interactions: booleanValue(readValue(source, "interactions")),
  }
}

function equalValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function integerField(
  value: string,
  allowEmpty = true
): number | null | undefined {
  if (!value.trim()) return allowEmpty ? null : undefined
  const number = Number(value)
  return Number.isInteger(number) ? number : undefined
}

function fieldPatch(
  key: string,
  value: unknown,
  original: unknown,
  empty: unknown = null
): RecordValue {
  if (equalValue(value, original)) return {}
  if (value === "" && (original === undefined || original === null)) return {}
  if (value === null && (original === undefined || original === null)) return {}
  if (
    Array.isArray(value) &&
    value.length === 0 &&
    (original === undefined || original === null)
  )
    return {}
  if (value === null && Array.isArray(original) && original.length === 0)
    return {}
  return { [key]: value === "" ? empty : value }
}

function buildPatch(
  source: RecordValue,
  draft: Editable,
  errors: FormErrors
): RecordValue {
  const patch: RecordValue = {}
  const original = (key: string) => readValue(source, key)
  const retry = integerField(draft.requestRetry)
  if (retry === undefined) errors.requestRetry = "details.invalidNumber"
  else
    Object.assign(
      patch,
      fieldPatch("request_retry", retry, original("request_retry"))
    )
  const priority = integerField(draft.priority)
  if (priority === undefined) errors.priority = "details.invalidNumber"
  else
    Object.assign(patch, fieldPatch("priority", priority, original("priority")))
  const weight = integerField(draft.weight)
  if (
    weight !== undefined &&
    weight !== null &&
    (weight < 1 || weight > MAX_WEIGHT)
  )
    errors.weight = "details.invalidWeight"
  else if (weight !== undefined)
    Object.assign(patch, fieldPatch("weight", weight, original("weight")))
  Object.assign(patch, fieldPatch("prefix", draft.prefix, original("prefix")))
  Object.assign(
    patch,
    fieldPatch("proxy_url", draft.proxyUrl, original("proxy_url"))
  )
  Object.assign(patch, fieldPatch("note", draft.note, original("note")))
  Object.assign(
    patch,
    fieldPatch("websockets", draft.websockets, original("websockets"))
  )
  Object.assign(
    patch,
    fieldPatch("interactions", draft.interactions, original("interactions"))
  )
  Object.assign(
    patch,
    fieldPatch("cloak_mode", draft.cloakMode, original("cloak_mode"))
  )
  Object.assign(
    patch,
    fieldPatch(
      "cloak_strict_mode",
      draft.cloakStrict,
      original("cloak_strict_mode")
    )
  )
  Object.assign(
    patch,
    fieldPatch(
      "cloak_cache_user_id",
      draft.cloakCacheUserId,
      original("cloak_cache_user_id")
    )
  )
  Object.assign(
    patch,
    fieldPatch("timezone", draft.timezone, original("timezone"))
  )
  Object.assign(
    patch,
    fieldPatch(
      "fingerprint_profile",
      draft.fingerprintProfile,
      original("fingerprint_profile")
    )
  )
  const words = draft.cloakSensitiveWords
    .split("\n")
    .map((word) => word.trim())
    .filter(Boolean)
  Object.assign(
    patch,
    fieldPatch(
      "cloak_sensitive_words",
      words.length > 0 ? words : null,
      original("cloak_sensitive_words")
    )
  )
  const excluded = draft.excludedModels
    .split("\n")
    .map((model) => model.trim())
    .filter(Boolean)
  Object.assign(
    patch,
    fieldPatch(
      "excluded_models",
      excluded.length > 0 ? excluded : null,
      original("excluded_models")
    )
  )
  const aliases = draft.aliases
    .map((alias) => ({
      ...alias,
      name: alias.name.trim(),
      alias: alias.alias.trim(),
    }))
    .filter((alias) => alias.name || alias.alias)
  Object.assign(
    patch,
    fieldPatch("model_aliases", aliases, original("model_aliases"))
  )
  const rules = draft.errors.map((rule) => ({
    ...rule,
    match: rule.match?.filter(Boolean),
    "match-regexr": rule["match-regexr"]?.filter(Boolean),
  }))
  Object.assign(
    patch,
    fieldPatch(
      "request_scoped_errors",
      rules,
      original("request_scoped_errors")
    )
  )
  let parsedHeaders: unknown = {}
  try {
    parsedHeaders = draft.headers.trim() ? JSON.parse(draft.headers) : {}
  } catch {
    errors.headers = "details.invalidJson"
  }
  const headers = z.record(z.string(), z.string()).safeParse(parsedHeaders)
  if (!headers.success) errors.headers = "details.invalidJson"
  else {
    const existing = recordOf(original("headers"))
    const changes: RecordValue = {}
    const keys = new Set([
      ...Object.keys(existing),
      ...Object.keys(headers.data),
    ])
    for (const key of keys) {
      const next = headers.data[key] ?? ""
      if (stringValue(existing[key]) !== next) changes[key] = next
    }
    if (Object.keys(changes).length > 0) patch.headers = changes
  }
  return patch
}

export function CredentialDetailsDialog({
  credential,
  open,
  onOpenChange,
}: {
  credential: Credential | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const client = useClient()
  const query = useQuery({
    queryKey: ["credentials", "detail", credential?.name, credential?.auth_index],
    enabled: open && credential !== null,
    queryFn: async () => {
      if (!credential) return null
      const params = new URLSearchParams({ name: credential.name })
      if (credential.auth_index) params.set("auth_index", credential.auth_index)
      const files = CredentialList.parse(await client.get(`/credentials?${params}`)).files
      return (
        files.find((item) => item.name === credential.name && (!credential.auth_index || item.auth_index === credential.auth_index)) ??
        files[0] ??
        null
      )
    },
  })
  const detail = query.data ?? credential
  const [tab, setTab] = useState("overview")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(52rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        {detail ? (
          <DetailsBody
            key={`${detail.name}:${query.dataUpdatedAt}`}
            detail={detail}
            loading={query.isPending}
            loadFailed={query.isError}
            tab={tab}
            onTabChange={setTab}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>{t("details.title")}</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailsBody({
  detail,
  loading,
  loadFailed,
  tab,
  onTabChange,
}: {
  detail: Credential
  loading: boolean
  loadFailed: boolean
  tab: string
  onTabChange: (tab: string) => void
}) {
  const { t, i18n } = useTranslation()
  const client = useClient()
  const queryClient = useQueryClient()
  const original = detail as RecordValue
  const [draft, setDraft] = useState<Editable>(() => parseEditable(original))
  const [errors, setErrors] = useState<FormErrors>({})
  const [modelsOpen, setModelsOpen] = useState(false)
  const save = useMutation({
    mutationFn: (patch: RecordValue) => client.patch("/credentials/fields", { name: detail.name, ...patch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.credentials }),
    onError: (error) => setErrors({ save: error.message }),
  })

  const readOnly = Boolean(detail.runtime_only || detail.source === "config" || detail.source === "config-file")
  const readOnlyReason = detail.runtime_only ? t("details.runtimeOnly") : t("details.configSource")
  const dirty = !equalValue(draft, parseEditable(original))

  const update = <K extends keyof Editable>(key: K, value: Editable[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined, save: undefined }))
  }

  function submit() {
    if (readOnly) return
    const nextErrors: FormErrors = {}
    const patch = buildPatch(original, draft, nextErrors)
    if (Object.keys(nextErrors).length > 0) return setErrors(nextErrors)
    if (Object.keys(patch).length > 0) save.mutate(patch)
  }

  const status = statusDetail(detail)
  const statusMessage = status ? ("key" in status ? t(`cards.detail.${status.key}`) : status.raw) : undefined
  const formatDate = (value: unknown) => {
    if (typeof value !== "string" || !value) return "—"
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(date)
  }

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4">
        <ProviderIcon provider={detail.provider} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DialogTitle className="truncate">{detail.email ?? detail.name}</DialogTitle>
          <DialogDescription className="truncate">
            {t(`provider.${detail.provider}`, { defaultValue: detail.provider })} · {detail.name}
          </DialogDescription>
        </div>
        <Button size="sm" variant="outline" className="mr-6" onClick={() => setModelsOpen(true)}>
          {t("details.modelsTitle")}
        </Button>
      </DialogHeader>
      {loadFailed && (
        <Alert variant="destructive" className="mx-5 mt-4">
          <AlertTitle>{t("details.loadFailed")}</AlertTitle>
        </Alert>
      )}
      {loading ? (
        <div className="p-5 text-xs text-muted-foreground">{t("details.loading")}</div>
      ) : (
        <Tabs value={tab} onValueChange={(value) => onTabChange(String(value))} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="overview">{t("details.overview")}</TabsTrigger>
            <TabsTrigger value="settings">{t("details.settings")}</TabsTrigger>
            <TabsTrigger value="quota">{t("details.quota")}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
            <div className="flex items-center gap-2 text-xs">
              <span className={cn("size-1.5 rounded-full", stateTone[credentialState(detail)])} aria-hidden />
              {t(`credentials.state.${credentialState(detail)}`)}
            </div>
            <InfoGrid
              items={[
                [t("details.identity"), detail.email ?? detail.account ?? detail.name],
                [t("details.provider"), t(`provider.${detail.provider}`, { defaultValue: detail.provider })],
                [t("details.plan"), detail.plan_type],
                [t("details.project"), detail.project_id],
                [t("details.authIndex"), detail.auth_index],
                [t("details.file"), detail.path ?? detail.name],
                [t("details.source"), detail.source],
                [t("details.created"), formatDate(original.created_at)],
                [t("details.modified"), formatDate(detail.modtime ?? original.updated_at)],
              ]}
            />
            {statusMessage && <Notice label={t("details.statusMessage")} value={statusMessage} />}
            {detail.recovery_hint && <Notice label={t("details.recoveryHint")} value={detail.recovery_hint} />}
            {detail.refresh_error && (
              <Notice
                label={t("details.refreshError")}
                value={`${detail.refresh_error.code ?? ""} ${detail.refresh_error.message ?? ""}`.trim()}
                destructive
              />
            )}
            <Cooldowns records={detail.cooldowns} />
          </TabsContent>
          <TabsContent value="settings" className="flex flex-col gap-4 pt-4">
            {readOnly && (
              <Alert>
                <AlertTitle>{t("details.readOnly", { reason: readOnlyReason })}</AlertTitle>
              </Alert>
            )}
            {errors.save && (
              <Alert variant="destructive">
                <AlertTitle>{t("details.saveFailed")}</AlertTitle>
                <AlertDescription>{errors.save}</AlertDescription>
              </Alert>
            )}
            <SettingsForm draft={draft} errors={errors} disabled={readOnly || save.isPending} update={update} provider={detail.provider} />
          </TabsContent>
          <TabsContent value="quota" className="pt-4">
            <QuotaDetail credential={detail} />
          </TabsContent>
        </Tabs>
      )}
      <DialogFooter className="m-0 border-t px-5 py-3">
        <Button
          variant="outline"
          disabled={save.isPending || !dirty}
          onClick={() => {
            setDraft(parseEditable(original))
            setErrors({})
          }}
        >
          {t("details.discard")}
        </Button>
        <Button disabled={readOnly || save.isPending || !dirty} onClick={submit}>
          {t("details.save")}
        </Button>
      </DialogFooter>
      <CredentialModelsDialog credential={detail} open={modelsOpen} onOpenChange={setModelsOpen} />
    </>
  )
}

function SettingsForm({
  draft,
  errors,
  disabled,
  update,
  provider,
}: {
  draft: Editable
  errors: FormErrors
  disabled: boolean
  update: <K extends keyof Editable>(key: K, value: Editable[K]) => void
  provider: string
}) {
  const { t } = useTranslation()
  const text = (
    key: keyof Editable,
    label: string,
    value: string,
    placeholder?: string
  ) => (
    <label className="flex flex-col gap-1 text-xs">
      <span>{t(label)}</span>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(errors[key])}
        onChange={(event) =>
          update(key, event.target.value as Editable[typeof key])
        }
      />
      {errors[key] && (
        <span className="text-destructive">{t(errors[key] as string)}</span>
      )}
    </label>
  )
  return (
    <div className="flex flex-col gap-4">
      {text(
        "requestRetry",
        "details.requestRetry",
        draft.requestRetry,
        t("details.requestRetryPlaceholder")
      )}
      <AliasEditor
        rows={draft.aliases}
        disabled={disabled}
        update={(rows) => update("aliases", rows)}
      />
      <RuleEditor
        rows={draft.errors}
        disabled={disabled}
        update={(rows) => update("errors", rows)}
      />
      {text("prefix", "details.prefix", draft.prefix)}
      {text("proxyUrl", "details.proxyUrl", draft.proxyUrl)}
      {text("priority", "details.priority", draft.priority)}
      {text("weight", "details.weight", draft.weight)}
      {text("note", "details.note", draft.note)}
      <label className="flex flex-col gap-1 text-xs">
        <span>{t("details.headers")}</span>
        <Textarea
          value={draft.headers}
          placeholder={t("details.headersPlaceholder")}
          disabled={disabled}
          aria-invalid={Boolean(errors.headers)}
          onChange={(event) => update("headers", event.target.value)}
        />
        {errors.headers && (
          <span className="text-destructive">{t(errors.headers)}</span>
        )}
      </label>
      <ToggleField
        label={t("details.websockets")}
        checked={draft.websockets === true}
        disabled={disabled}
        onChange={(value) => update("websockets", value)}
      />
      <label className="flex flex-col gap-1 text-xs">
        <span>{t("details.excludedModels")}</span>
        <Textarea
          value={draft.excludedModels}
          placeholder={t("details.excludedModelsPlaceholder")}
          disabled={disabled}
          onChange={(event) => update("excludedModels", event.target.value)}
        />
      </label>
      {provider === "claude" && (
        <>
          <label className="flex flex-col gap-1 text-xs">
            <span>{t("details.cloakMode")}</span>
            <Select
              value={draft.cloakMode || "auto"}
              disabled={disabled}
              onValueChange={(value) => {
                const next = value ?? "auto"
                update("cloakMode", next === "auto" ? "" : next)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("details.cloakAuto")}</SelectItem>
                <SelectItem value="always">
                  {t("details.cloakAlways")}
                </SelectItem>
                <SelectItem value="never">{t("details.cloakNever")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <ToggleField
            label={t("details.cloakStrict")}
            checked={draft.cloakStrict === true}
            disabled={disabled}
            onChange={(value) => update("cloakStrict", value)}
          />
          <label className="flex flex-col gap-1 text-xs">
            <span>{t("details.cloakSensitiveWords")}</span>
            <Textarea
              value={draft.cloakSensitiveWords}
              disabled={disabled}
              onChange={(event) =>
                update("cloakSensitiveWords", event.target.value)
              }
            />
          </label>
          <ToggleField
            label={t("details.cloakCacheUserId")}
            checked={draft.cloakCacheUserId === true}
            disabled={disabled}
            onChange={(value) => update("cloakCacheUserId", value)}
          />
          {text("timezone", "details.timezone", draft.timezone)}
          {text(
            "fingerprintProfile",
            "details.fingerprintProfile",
            draft.fingerprintProfile
          )}
        </>
      )}
      {provider === "vertex" && (
        <ToggleField
          label={t("details.interactions")}
          checked={draft.interactions === true}
          disabled={disabled}
          onChange={(value) => update("interactions", value)}
        />
      )}
    </div>
  )
}

function AliasEditor({
  rows,
  disabled,
  update,
}: {
  rows: Alias[]
  disabled: boolean
  update: (rows: Alias[]) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">{t("details.modelAliases")}</h3>
        <Button
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => update([...rows, { name: "", alias: "" }])}
        >
          {t("details.addAlias")}
        </Button>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-md border p-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={t("details.modelName")}
              value={row.name}
              disabled={disabled}
              onChange={(event) =>
                update(
                  rows.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, name: event.target.value }
                      : item
                  )
                )
              }
            />
            <Input
              placeholder={t("details.alias")}
              value={row.alias}
              disabled={disabled}
              onChange={(event) =>
                update(
                  rows.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, alias: event.target.value }
                      : item
                  )
                )
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={row.fork === true}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  update(
                    rows.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, fork: checked === true }
                        : item
                    )
                  )
                }
              />
              {t("details.fork")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={row["force-mapping"] === true}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  update(
                    rows.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, "force-mapping": checked === true }
                        : item
                    )
                  )
                }
              />
              {t("details.forceMapping")}
            </label>
          </div>
          <Input
            placeholder={t("details.displayName")}
            value={row["display-name"] ?? ""}
            disabled={disabled}
            onChange={(event) =>
              update(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, "display-name": event.target.value }
                    : item
                )
              )
            }
          />
          <Button
            size="xs"
            variant="ghost"
            className="self-start"
            disabled={disabled}
            onClick={() =>
              update(rows.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            {t("details.remove")}
          </Button>
        </div>
      ))}
    </section>
  )
}

function RuleEditor({
  rows,
  disabled,
  update,
}: {
  rows: Rule[]
  disabled: boolean
  update: (rows: Rule[]) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">{t("details.requestErrors")}</h3>
        <Button
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => update([...rows, {}])}
        >
          {t("details.addError")}
        </Button>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-md border p-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder={t("details.errorStatus")}
              value={row.status === undefined ? "" : String(row.status)}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value.trim()
                update(
                  rows.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, status: value ? Number(value) : undefined }
                      : item
                  )
                )
              }}
            />
            <Input
              placeholder={t("details.action")}
              value={row.action ?? ""}
              disabled={disabled}
              onChange={(event) =>
                update(
                  rows.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, action: event.target.value }
                      : item
                  )
                )
              }
            />
          </div>
          <Input
            placeholder={t("details.match")}
            value={row.match?.join(", ") ?? ""}
            disabled={disabled}
            onChange={(event) =>
              update(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        match: event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      }
                    : item
                )
              )
            }
          />
          <Input
            placeholder={t("details.matchRegex")}
            value={row["match-regexr"]?.join(", ") ?? ""}
            disabled={disabled}
            onChange={(event) =>
              update(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        "match-regexr": event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      }
                    : item
                )
              )
            }
          />
          <Button
            size="xs"
            variant="ghost"
            className="self-start"
            disabled={disabled}
            onClick={() =>
              update(rows.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            {t("details.remove")}
          </Button>
        </div>
      ))}
    </section>
  )
}

function ToggleField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  )
}

function InfoGrid({ items }: { items: Array<[string, unknown]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 truncate" title={stringValue(value)}>
            {stringValue(value) || "—"}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Notice({
  label,
  value,
  destructive = false,
}: {
  label: string
  value: string
  destructive?: boolean
}) {
  return (
    <Alert variant={destructive ? "destructive" : "default"}>
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription className="break-words">{value}</AlertDescription>
    </Alert>
  )
}

function Cooldowns({ records }: { records: Credential["cooldowns"] }) {
  const { t } = useTranslation()
  if (!records || records.length === 0)
    return (
      <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
        <div className="mb-1 text-foreground">{t("details.cooldowns")}</div>
        {t("details.noCooldowns")}
      </div>
    )
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium">{t("details.cooldowns")}</h3>
      <div className="flex flex-col gap-2">
        {records.map((record, index) => (
          <div
            key={`${record.scope}-${record.model_key ?? ""}-${index}`}
            className="rounded-md bg-muted/60 p-2 text-xs"
          >
            <div className="flex justify-between gap-2">
              <span>
                {record.scope === "credential"
                  ? t("details.credential")
                  : (record.model_key ?? t("details.model"))}
              </span>
              <span className="text-muted-foreground">
                {record.remaining_seconds}s
              </span>
            </div>
            <div className="text-muted-foreground">
              {t("details.cooldownReason", { reason: record.reason })}
            </div>
            <div className="text-muted-foreground">
              {t("details.cooldownRetry", { time: record.retry_at })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
