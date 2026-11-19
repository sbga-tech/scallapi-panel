import { useEffect, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { grantBlocker, grantRetryWindowMs, useClaudeResetGrants, useCodexOverage, useQuota, useQuotaReset } from "@/lib/quota"
import type { Credential } from "@/lib/schemas"
import { QuotaResetTime, QuotaSummary } from "./quota-summary"

function ClaudeResetGrants({ credential }: { credential: Credential }) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [selection, setSelection] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [open])
  const { query, mutation, busy, operation } = useClaudeResetGrants(credential, open)
  const pending = operation && !operation.result ? operation : undefined
  const grants = pending ? [pending.grant] : query.data?.grants ?? []
  const selected = pending?.grant.id ?? selection
  const chosen = grants.find((grant) => grant.id === selected)
  const blocker = chosen && query.data ? grantBlocker(query.data, chosen, now) : "unavailable"
  const canConfirm = Boolean(chosen && (pending ? now - pending.createdAt < grantRetryWindowMs : !blocker)) && !busy && !query.isFetching
  const error = mutation.error ?? query.error
  return <AlertDialog open={open} onOpenChange={(value) => { if (!busy) { setNow(Date.now()); setOpen(value) } }}>
    <AlertDialogTrigger render={<Button variant="outline" disabled={credential.disabled || credential.runtime_only} />}>{t("quota.resetGrants")}</AlertDialogTrigger>
    <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
      <AlertDialogHeader><AlertDialogTitle>{t("quota.resetGrants")}</AlertDialogTitle><AlertDialogDescription>{t("quota.grantConfirm", { name: credential.email ?? credential.name })}</AlertDialogDescription></AlertDialogHeader>
      {query.isFetching && <div className="min-h-24 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>}
      {error && <Alert variant="destructive"><AlertDescription>{error instanceof Error && error.message.startsWith("quota.") ? t(error.message) : t("quota.grantReadFailed")}</AlertDescription></Alert>}
      {pending && <Alert><AlertDescription>{t("quota.grantPending")}</AlertDescription></Alert>}
      {mutation.data && <Alert><AlertDescription>{t(`quota.grantResult.${mutation.data.result}`)}{mutation.data.unresolved ? ` ${t("quota.grantPending")}` : ""}</AlertDescription></Alert>}
      {!query.isFetching && !grants.length && query.data && <span className="text-sm text-muted-foreground">{t(query.data.eligible ? "quota.noGrants" : "quota.grantBlocked.ineligible")}</span>}
      {query.data?.weekly_resets_at != null && <div className="flex justify-between gap-3 text-xs"><span>{t("quota.weekly")}</span><QuotaResetTime at={query.data.weekly_resets_at} /></div>}
      {query.data?.cooldown_until != null && query.data.cooldown_until > now && <div className="flex justify-between gap-3 text-xs"><span>{t("quota.cooldown")}</span><QuotaResetTime at={query.data.cooldown_until} /></div>}
      <RadioGroup value={selected ?? ""} onValueChange={(value) => setSelection(String(value))} aria-label={t("quota.chooseGrant")}>
        {grants.map((grant) => {
          const reason = pending ? null : query.data ? grantBlocker(query.data, grant, now) : "unavailable"
          const label = grant.label || t(`quota.grantKind.${grant.gives_back_weekly ? "fable" : grant.type ?? "unknown"}`)
          return <div className="rounded-md border p-3 text-xs" key={grant.id}>
            <div className="flex items-center gap-2"><RadioGroupItem id={`${id}-${grant.id}`} value={grant.id} disabled={busy || Boolean(reason)} /><label className="flex-1" htmlFor={`${id}-${grant.id}`}>{label}</label><span className="tabular-nums">{grant.resets_left} / {grant.resets_total}</span></div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground"><dt>{t("quota.clears")}</dt><dd>{grant.clears.map((window) => t(`quota.grantWindow.${window}`)).join(", ") || "—"}</dd>{Object.entries(grant.percent_used).map(([window, percent]) => <div className="contents" key={window}><dt>{t(`quota.grantWindow.${window}`, { defaultValue: window })}</dt><dd>{t("quota.usedPercent", { percent })}</dd></div>)}{grant.ends_at !== null && <><dt>{t("quota.expires")}</dt><dd><QuotaResetTime at={grant.ends_at} /></dd></>}{reason && <><dt>{t("quota.status")}</dt><dd>{t(`quota.grantBlocked.${reason}`)}</dd></>}</dl>
          </div>
        })}
      </RadioGroup>
      <AlertDialogFooter><Button variant="ghost" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>{t("quota.refresh")}</Button><AlertDialogCancel disabled={busy}>{t("quota.close")}</AlertDialogCancel><AlertDialogAction disabled={!canConfirm} onClick={() => { if (selected) mutation.mutate(selected) }}>{t(pending ? "quota.retrySameClaim" : "quota.redeemGrant")}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}

function CodexOverage({ credential }: { credential: Credential }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<boolean | null>(null)
  const { state, mutation, busy, available } = useCodexOverage(credential)
  const status = state?.status === "known" ? state.value ? "allowed" : "blocked" : state?.status === "unconfirmed" ? "unconfirmed" : "unknown"
  const disabled = credential.disabled || credential.runtime_only || !available || busy
  return <div className="space-y-2 text-xs">
    <div className="flex items-center justify-between gap-3"><span>{t("quota.creditOverage")}</span><span className="text-muted-foreground">{t(`quota.overageStatus.${status}`)}</span></div>
    {state?.status === "known" && <div className="text-muted-foreground">{new Date(state.confirmedAt).toLocaleString(i18n.language)}</div>}
    {state?.status === "unconfirmed" && <Alert><AlertDescription>{t("quota.overageUnconfirmed")}</AlertDescription></Alert>}
    {mutation.error && <Alert variant="destructive"><AlertDescription>{mutation.error.message.startsWith("quota.") ? t(mutation.error.message) : mutation.error.message}</AlertDescription></Alert>}
    <AlertDialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value) }}>
      <div className="flex flex-wrap gap-2">{[true, false].map((value) => <Button key={String(value)} size="sm" variant="outline" disabled={disabled || (state?.status === "unconfirmed" && state.target !== value)} onClick={() => { setTarget(value); setOpen(true) }}>{t(value ? "quota.allowOverage" : "quota.blockOverage")}</Button>)}</div>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(target ? "quota.allowOverage" : "quota.blockOverage")}</AlertDialogTitle><AlertDialogDescription>{t(target ? "quota.allowOverageConfirm" : "quota.blockOverageConfirm", { name: credential.email ?? credential.name })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("quota.cancel")}</AlertDialogCancel><AlertDialogAction disabled={disabled || target === null} onClick={() => { if (target !== null) mutation.mutate(target, { onSuccess: () => setOpen(false) }) }}>{t("quota.save")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>
}

function QuotaDetailContent({ credential }: { credential: Credential }) {
  const { t, i18n } = useTranslation()
  const quota = useQuota(credential)
  const reset = useQuotaReset(credential)
  const [confirmReset, setConfirmReset] = useState(false)
  const snapshot = quota.data
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 4 })
  return <div className="space-y-4">
    <QuotaSummary credential={credential} density="regular" />
    {snapshot && <>
      {snapshot.credits.map((credit) => <div className="space-y-1 text-xs" key={credit.id}><div className="flex items-baseline justify-between gap-3"><span>{credit.labelKey ? t(credit.labelKey) : credit.label || t("quota.credits")}</span><span className="tabular-nums">{credit.unlimited ? t("quota.unlimited") : credit.balance === null ? t("quota.unknown") : typeof credit.balance === "number" ? number.format(credit.balance) : credit.balance}{credit.unit ? ` ${credit.unit}` : ""}</span></div>{(credit.used != null || credit.limit != null) && <div className="text-muted-foreground">{credit.used == null ? "—" : number.format(credit.used)} / {credit.limit == null ? "—" : number.format(credit.limit)}{credit.unit ? ` ${credit.unit}` : ""}</div>}{credit.resetsAt != null && <QuotaResetTime at={credit.resetsAt} offset={snapshot.serverTimeOffsetMs} />}</div>)}
      {snapshot.extras.length > 0 && <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-xs">{snapshot.extras.map((metric) => <div className="contents" key={metric.id}><dt className="text-muted-foreground">{metric.labelKey ? t(metric.labelKey) : metric.label}</dt><dd className="max-w-64 break-words text-right tabular-nums">{metric.value === null ? t("quota.unknown") : typeof metric.value === "boolean" ? t(metric.value ? "quota.enabled" : "quota.disabledValue") : typeof metric.value === "number" ? number.format(metric.value) : metric.value}{metric.unit ? ` ${metric.unit}` : ""}</dd></div>)}</dl>}
      {snapshot.codex && <div className="space-y-2 border-t pt-3 text-xs"><div className="flex justify-between gap-3"><span>{t("quota.resetCredits")}</span><span className="tabular-nums">{snapshot.codex.availableResets ?? t("quota.unknown")}</span></div><div className="flex justify-between gap-3 text-muted-foreground"><span>{t("quota.applicableResets")}</span><span>{snapshot.codex.applicableResets ?? t("quota.unknown")}</span></div>{snapshot.codex.resetError && <Alert variant="destructive"><AlertDescription>{t("quota.resetCreditsFailed")}{" "}{snapshot.codex.resetError}</AlertDescription></Alert>}{snapshot.codex.resetCredits.map((credit, index) => <div className="flex flex-wrap justify-between gap-2 text-muted-foreground" key={credit.id || String(index)}><span>{t("quota.resetCredit", { index: index + 1 })}</span>{credit.expiresAt !== null && <QuotaResetTime at={credit.expiresAt} />}</div>)}{snapshot.codex.subscriptionEndsAt !== null && <div className="flex flex-wrap justify-between gap-2"><span>{t("quota.subscriptionRenews")}</span><QuotaResetTime at={snapshot.codex.subscriptionEndsAt} /></div>}<CodexOverage credential={credential} /></div>}
      {(snapshot.provider === "plugin" || (snapshot.codex?.availableResets ?? 0) > 0) && <AlertDialog open={confirmReset} onOpenChange={(value) => { if (!reset.isPending) setConfirmReset(value) }}><AlertDialogTrigger render={<Button variant="outline" disabled={!quota.canLoad || reset.isPending || quota.isFetching} />}>{t(snapshot.provider === "codex" ? "quota.useResetCredit" : "quota.resetQuota")}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(snapshot.provider === "codex" ? "quota.useResetCredit" : "quota.resetQuota")}</AlertDialogTitle><AlertDialogDescription>{t(snapshot.provider === "codex" ? "quota.resetCreditConfirm" : "quota.pluginResetConfirm", { name: credential.email ?? credential.name })}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={reset.isPending}>{t("quota.cancel")}</AlertDialogCancel><AlertDialogAction disabled={reset.isPending} onClick={() => reset.mutate(undefined, { onSuccess: () => setConfirmReset(false) })}>{t("quota.confirmReset")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
      {reset.error && <Alert variant="destructive"><AlertDescription>{reset.error.message.startsWith("quota.") ? t(reset.error.message) : reset.error.message}</AlertDescription></Alert>}
      <div className="text-[0.625rem] text-muted-foreground">{t("quota.updatedAt", { time: new Date(snapshot.fetchedAt).toLocaleString(i18n.language) })}</div>
    </>}
    {quota.provider === "claude" && <ClaudeResetGrants credential={credential} />}
  </div>
}

export function QuotaDetail({ credential }: { credential: Credential }) {
  return <QuotaDetailContent key={`${credential.auth_index}:${credential.name}:${credential.email ?? ""}`} credential={credential} />
}
