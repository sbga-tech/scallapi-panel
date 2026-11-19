import { Boxes, Download, EllipsisVertical, KeyRound, RefreshCw, RotateCcw, Settings2, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-now"
import { credentialIdentity, credentialState, stateTone } from "@/lib/credential-status"
import { formatBytes, formatDuration, formatRelative } from "@/lib/format"
import type { Credential } from "@/lib/schemas"
import { QuotaSummary } from "@/components/quota/quota-summary"
import { cn } from "@/lib/utils"

export type Density = "regular" | "compact"

export type CardActions = {
  onToggle: (credential: Credential, enabled: boolean) => void
  onRefresh: (credential: Credential) => void
  onDownload: (credential: Credential) => void
  onDelete: (credential: Credential) => void
  onResetCooldown: (credential: Credential) => void
  onOpenDetails: (credential: Credential) => void
  onOpenModels: (credential: Credential) => void
  onSignIn: (credential: Credential) => void
  onBindSiwc: (credential: Credential) => void
}

const manualRefreshProviders: Record<string, true> = { meta: true, antigravity: true, claude: true, codex: true, kimi: true, xai: true }

export function CredentialCard({
  credential,
  density,
  selected,
  onSelect,
  busy,
  actions,
}: {
  credential: Credential
  density: Density
  selected: boolean
  onSelect: (selected: boolean) => void
  busy: boolean
  actions: CardActions
}) {
  const { t, i18n } = useTranslation()
  const state = credentialState(credential)
  const cooldowns = credential.cooldowns ?? []
  const now = useNow(cooldowns.length > 0)
  const receivedAt = useReceivedAt(credential)
  const message = credential.refresh_error?.message ?? (credential.status_message !== credential.status ? credential.status_message : undefined)
  const compact = density === "compact"
  const totalRequests = credential.success + credential.failed

  return (
    <Card className={cn("gap-0 p-0", selected && "ring-2 ring-ring/40")}>
      <div className="flex items-start gap-2.5 px-4 pt-3.5">
        <Checkbox
          className="mt-0.5"
          checked={selected}
          disabled={credential.runtime_only}
          onCheckedChange={(value) => onSelect(value === true)}
          aria-label={t("cards.select", { name: credential.name })}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{credentialIdentity(credential)}</span>
            {credential.runtime_only && <Badge variant="outline">{t("cards.runtimeOnly")}</Badge>}
          </div>
          <span className="truncate text-xs text-muted-foreground" title={credential.name}>
            {t(`provider.${credential.provider}`, { defaultValue: credential.provider })}
            {credential.plan_type ? ` ${credential.plan_type}` : ""} · {credential.name}
          </span>
        </div>
        <Switch
          checked={!credential.disabled}
          disabled={credential.runtime_only || busy}
          onCheckedChange={(checked) => actions.onToggle(credential, checked)}
          aria-label={t("cards.toggle", { name: credential.name })}
        />
      </div>

      {credential.note && !compact && (
        <p className="truncate px-4 pt-1.5 text-xs text-muted-foreground" title={credential.note}>
          {credential.note}
        </p>
      )}

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-start gap-2 text-xs">
          <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", stateTone[state])} aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span>{t(`credentials.state.${state}`)}</span>
            {message && state !== "active" && (
              <Tooltip>
                <TooltipTrigger render={<span className="line-clamp-2 break-all text-muted-foreground" />}>{message}</TooltipTrigger>
                <TooltipContent className="max-w-sm break-all">{message}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {credential.next_action === "sign_in" && (
            <Button size="sm" variant="outline" onClick={() => actions.onSignIn(credential)}>
              <KeyRound />
              {t("cards.signInAgain")}
            </Button>
          )}
        </div>

        {cooldowns.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span>{t("cards.cooldowns", { count: cooldowns.length })}</span>
              {credential.auth_index && (
                <Button size="xs" variant="ghost" onClick={() => actions.onResetCooldown(credential)}>
                  <RotateCcw />
                  {t("cards.resetCooldown")}
                </Button>
              )}
            </div>
            {cooldowns.map((record, index) => (
              <div key={`${record.scope}:${record.model_key ?? ""}:${index}`} className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="truncate">
                  {record.scope === "credential" ? t("cards.wholeCredential") : record.model_key}
                  {" · "}
                  {t(`cards.reason.${record.reason}`, { defaultValue: t("cards.reason.unknown") })}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatDuration(record.remaining_seconds - Math.max(0, now - receivedAt) / 1000)}
                </span>
              </div>
            ))}
          </div>
        )}

        {!compact && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("cards.requests")}</span>
              <span className="tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">{credential.success}</span>
                {" / "}
                <span className={credential.failed > 0 ? "text-destructive" : undefined}>{credential.failed}</span>
              </span>
            </div>
            <RequestStrip credential={credential} empty={totalRequests === 0} />
          </div>
        )}

        {!compact && (
          <dl className="grid grid-cols-4 gap-2 text-xs">
            <Meta label={t("cards.size")} value={formatBytes(credential.size)} />
            <Meta label={t("cards.modified")} value={formatRelative(credential.modtime, i18n.language)} />
            <Meta label={t("cards.priority")} value={String(credential.priority ?? 0)} />
            <Meta label={t("cards.weight")} value={String(credential.weight ?? 1)} />
          </dl>
        )}

        {credential.siwc_bind_supported && (
          <div className="flex items-center gap-2 text-xs">
            <Badge
              variant={credential.use_siwc && credential.siwc_bound ? "secondary" : "outline"}
              render={<button type="button" onClick={() => actions.onBindSiwc(credential)} />}
            >
              {t(`cards.siwc.${credential.use_siwc && credential.siwc_bound ? "active" : credential.siwc_bound ? "bound" : "unbound"}`)}
            </Badge>
            {credential.siwc_expires_at && (
              <span className="text-muted-foreground">{t("cards.siwcExpires", { when: formatRelative(credential.siwc_expires_at, i18n.language) })}</span>
            )}
          </div>
        )}

        <QuotaSummary credential={credential} density={density} />
      </div>

      <div className="mt-auto flex items-center gap-1 border-t px-2.5 py-1.5">
        <Button size="sm" variant="ghost" onClick={() => actions.onOpenModels(credential)}>
          <Boxes />
          {t("cards.models")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => actions.onOpenDetails(credential)}>
          <Settings2 />
          {t("cards.settings")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={t("common.more")} />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {manualRefreshProviders[credential.provider] && (
              <DropdownMenuItem disabled={busy} onClick={() => actions.onRefresh(credential)}>
                <RefreshCw />
                {t("credentials.refresh")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => actions.onSignIn(credential)}>
              <KeyRound />
              {t("cards.signInAgain")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={credential.runtime_only} onClick={() => actions.onDownload(credential)}>
              <Download />
              {t("credentials.download")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={credential.runtime_only} onClick={() => actions.onDelete(credential)}>
              <Trash2 />
              {t("credentials.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate tabular-nums">{value}</dd>
    </div>
  )
}

function RequestStrip({ credential, empty }: { credential: Credential; empty: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-4 items-end gap-px" role="img" aria-label={t("cards.requestStrip")}>
      {credential.recent_requests.map((bucket) => {
        const total = bucket.success + bucket.failed
        const tone = total === 0 ? "bg-muted" : bucket.failed === 0 ? "bg-emerald-500/70" : bucket.success === 0 ? "bg-destructive/80" : "bg-amber-500/80"
        return (
          <Tooltip key={bucket.time}>
            <TooltipTrigger render={<span className={cn("h-full flex-1 rounded-[2px]", empty ? "bg-muted" : tone)} />} />
            <TooltipContent>
              {bucket.time}: {bucket.success} / {bucket.failed}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

const receivedAtCache = new WeakMap<Credential, number>()

function useReceivedAt(credential: Credential) {
  let receivedAt = receivedAtCache.get(credential)
  if (receivedAt === undefined) {
    receivedAt = Date.now()
    receivedAtCache.set(credential, receivedAt)
  }
  return receivedAt
}
