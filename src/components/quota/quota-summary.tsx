import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useQuota, type QuotaWindow } from "@/lib/quota"
import type { Credential } from "@/lib/schemas"

export function QuotaResetTime({ at, offset = 0 }: { at: number; offset?: number }) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const minutes = Math.max(0, Math.ceil((at - now - offset) / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const absolute = new Date(at).toLocaleString(i18n.language)
  const duration = days > 0 ? t("quota.daysHours", { days, hours }) : hours > 0 ? t("quota.hoursMinutes", { hours, minutes: minutes % 60 }) : t("quota.minutes", { minutes })
  return <Tooltip><TooltipTrigger render={<span className="text-muted-foreground tabular-nums" />}>{minutes > 0 ? t("quota.resetsIn", { duration }) : t("quota.resetDue")}</TooltipTrigger><TooltipContent>{absolute}</TooltipContent></Tooltip>
}

export function QuotaWindowRow({ window, offset = 0 }: { window: QuotaWindow; offset?: number }) {
  const { t, i18n } = useTranslation()
  const label = window.labelKey ? t(window.labelKey) : window.label
  const percent = window.usedPercent
  const amount = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 })
  return <div className="space-y-1.5 text-xs">
    <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate">{window.group ? `${window.group} · ` : ""}{label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{percent === null ? t("quota.unknown") : t("quota.usedPercent", { percent: amount.format(percent) })}</span></div>
    <Progress aria-label={window.group ? `${window.group}: ${label}` : label} value={percent === null ? null : Math.max(0, Math.min(100, percent))} className={percent !== null && percent >= 90 ? "[&_[data-slot=progress-indicator]]:bg-destructive" : ""} />
    {(window.used != null || window.limit != null || window.resetsAt !== null) && <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[0.625rem] text-muted-foreground">{(window.used != null || window.limit != null) && <span className="tabular-nums">{window.used == null ? "—" : amount.format(window.used)} / {window.limit == null ? "—" : amount.format(window.limit)}{window.unit ? ` ${window.unit}` : ""}</span>}{window.resetsAt !== null && <QuotaResetTime at={window.resetsAt} offset={offset} />}</div>}
  </div>
}

export function QuotaSummary({ credential, density }: { credential: Credential; density: "regular" | "compact" }) {
  const { t } = useTranslation()
  const quota = useQuota(credential)
  const height = density === "compact" ? "min-h-16" : "min-h-32"
  const windows = density === "compact" ? quota.data?.windows.slice(0, 1) : quota.data?.windows
  const error = quota.error instanceof Error ? quota.error.message : "quota.loadFailed"
  if (!quota.provider) return <div className={`${height} flex items-center text-xs text-muted-foreground`}>{t("quota.unsupported")}</div>
  return <div className={`${height} space-y-3`} aria-busy={quota.isFetching}>
    {quota.isFetching && !quota.data ? <div className="space-y-3" role="status" aria-label={t("quota.loading")}>
      {Array.from({ length: density === "compact" ? 1 : 2 }, (_, index) => <div className="space-y-2" key={index}><Skeleton className="h-3 w-2/3" /><Skeleton className="h-1 w-full" /><Skeleton className="h-2.5 w-1/3" /></div>)}
    </div> : !quota.data && !quota.isError ? <Button variant="link" className="h-auto px-0 py-1 text-muted-foreground" disabled={!quota.canLoad} onClick={() => void quota.refetch()}>{t(credential.disabled ? "quota.disabled" : credential.runtime_only ? "quota.notDownloadable" : !credential.auth_index ? "quota.missingIdentity" : "quota.load")}</Button> : null}
    {quota.isError && <Alert variant="destructive"><AlertDescription className="break-words">{t("quota.loadFailed")}{" "}{error.startsWith("quota.") ? t(error) : error}</AlertDescription><Button variant="ghost" size="xs" className="mt-1 w-fit" disabled={!quota.canLoad || quota.isFetching} onClick={() => void quota.refetch()}>{t("quota.retry")}</Button></Alert>}
    {quota.data && <>
      <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-muted-foreground">{quota.data.plan ?? t("quota.quota")}</span><Tooltip><TooltipTrigger render={<Button size="icon-xs" variant="ghost" aria-label={t("quota.refresh")} disabled={!quota.canLoad || quota.isFetching} onClick={() => void quota.refetch()} />}><RefreshCw className={quota.isFetching ? "animate-spin" : ""} /></TooltipTrigger><TooltipContent>{t("quota.refresh")}</TooltipContent></Tooltip></div>
      {windows?.map((window) => <QuotaWindowRow key={window.id} window={window} offset={quota.data?.serverTimeOffsetMs} />)}
      {!windows?.length && <span className="text-xs text-muted-foreground">{t(quota.data.extras.some((metric) => metric.id === "health") ? "quota.apiAvailable" : "quota.noWindows")}</span>}
    </>}
  </div>
}
