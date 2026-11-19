import type { UseQueryResult } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, Columns3, LayoutGrid, RefreshCw, Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useStoredState } from "@/hooks/use-stored-state"
import {
  useDeleteCredentials,
  useDownloadCredentials,
  useRefreshAll,
  useRefreshOne,
  useResetCooldown,
  useSetDisabled,
  type BatchFailure,
  type RefreshResult,
} from "@/lib/credential-actions"
import { credentialIdentity, credentialState } from "@/lib/credential-status"
import type { Credential } from "@/lib/schemas"
import { cn } from "@/lib/utils"
import { CredentialCard, type CardActions, type Density } from "@/pages/credentials/credential-card"

const statusFilters = ["all", "enabled", "disabled", "problem"] as const
type StatusFilter = (typeof statusFilters)[number]
const sortModes = ["default", "az", "priority"] as const
type SortMode = (typeof sortModes)[number]
const minPageSize = 3
const maxPageSize = 30

export type OpenHandlers = Pick<CardActions, "onOpenDetails" | "onOpenModels" | "onSignIn" | "onBindSiwc">

type DeleteTarget = { kind: "one"; credential: Credential } | { kind: "selected" } | { kind: "filtered" } | { kind: "all" }

function searchMatcher(query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return () => true
  const pattern = needle.includes("*")
    ? new RegExp(needle.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*"))
    : null
  return (credential: Credential) =>
    [credential.name, credential.provider, credential.email, credential.project_id, credential.auth_index, credential.status_message]
      .filter((value): value is string => Boolean(value))
      .some((value) => (pattern ? pattern.test(value.toLowerCase()) : value.toLowerCase().includes(needle)))
}

function sortCredentials(credentials: Credential[], mode: SortMode) {
  const copy = [...credentials]
  if (mode === "default") copy.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))
  if (mode === "az") copy.sort((a, b) => credentialIdentity(a).localeCompare(credentialIdentity(b)) || a.name.localeCompare(b.name))
  if (mode === "priority") copy.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return copy
}

export function OAuthTab({ query, open }: { query: UseQueryResult<Credential[]>; open: OpenHandlers }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [provider, setProvider] = useStoredState("credentials.provider", z.string(), "all")
  const [status, setStatus] = useStoredState<StatusFilter>("credentials.status", z.enum(statusFilters), "all")
  const [sort, setSort] = useStoredState<SortMode>("credentials.sort", z.enum(sortModes), "default")
  const [density, setDensity] = useStoredState<Density>("credentials.density", z.enum(["regular", "compact"]), "regular")
  const [layout, setLayout] = useStoredState("credentials.layout", z.enum(["grid", "stacked"]), "grid")
  const [pageSize, setPageSize] = useStoredState("credentials.pageSize", z.number().int().min(minPageSize).max(maxPageSize), 12)
  const [pageSizeDraft, setPageSizeDraft] = useState(String(pageSize))
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Record<string, true>>({})
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [refreshResults, setRefreshResults] = useState<RefreshResult[] | null>(null)

  const setDisabled = useSetDisabled()
  const refreshOne = useRefreshOne()
  const refreshAll = useRefreshAll()
  const deleteCredentials = useDeleteCredentials()
  const resetCooldown = useResetCooldown()
  const download = useDownloadCredentials()

  const all = useMemo(() => query.data ?? [], [query.data])
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const credential of all) counts[credential.provider] = (counts[credential.provider] ?? 0) + 1
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  }, [all])
  const activeProvider = provider === "all" || providerCounts.some(([key]) => key === provider) ? provider : "all"

  const filtered = useMemo(() => {
    const matches = searchMatcher(search)
    return sortCredentials(
      all.filter((credential) => {
        const state = credentialState(credential)
        if (activeProvider !== "all" && credential.provider !== activeProvider) return false
        if (status === "enabled" && credential.disabled) return false
        if (status === "disabled" && !credential.disabled) return false
        if (status === "problem" && (state === "active" || state === "disabled")) return false
        return matches(credential)
      }),
      sort
    )
  }, [all, search, activeProvider, status, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedCredentials = all.filter((credential) => selected[credential.name])
  const problemCount = all.filter((credential) => !["active", "disabled"].includes(credentialState(credential))).length
  const filterActive = activeProvider !== "all" || status !== "all" || search.trim() !== ""

  function select(credential: Credential, value: boolean) {
    const next = { ...selected }
    if (value) next[credential.name] = true
    else delete next[credential.name]
    setSelected(next)
  }

  function selectVisible(mode: "all" | "invert") {
    const next = { ...selected }
    for (const credential of visible) {
      if (credential.runtime_only) continue
      if (mode === "all" || !next[credential.name]) next[credential.name] = true
      else delete next[credential.name]
    }
    setSelected(next)
  }

  function reportFailures(failures: BatchFailure[], successTitle: string) {
    if (failures.length === 0) toast.add({ title: successTitle, type: "success" })
    else
      toast.add({
        title: t("cards.partialFailure", { count: failures.length }),
        description: failures.map((failure) => `${failure.name}: ${failure.error ?? ""}`).join("\n"),
        type: "warning",
      })
  }

  function setEnabled(credentials: Credential[], enabled: boolean) {
    setDisabled.mutate(
      { credentials, disabled: !enabled },
      { onSuccess: (failures) => reportFailures(failures, t(enabled ? "cards.enabledDone" : "cards.disabledDone", { count: credentials.length })) }
    )
  }

  const actions: CardActions = {
    ...open,
    onToggle: (credential, enabled) => setEnabled([credential], enabled),
    onRefresh: (credential) =>
      refreshOne.mutate(credential, {
        onSuccess: () => toast.add({ title: t("credentials.refreshed", { name: credentialIdentity(credential) }), type: "success" }),
        onError: (error) => toast.add({ title: t("credentials.refreshFailed"), description: error.message, type: "error" }),
      }),
    onDownload: (credential) =>
      download.mutate([credential], { onError: (error) => toast.add({ title: t("cards.downloadFailed"), description: error.message, type: "error" }) }),
    onDelete: (credential) => setDeleteTarget({ kind: "one", credential }),
    onResetCooldown: (credential) =>
      credential.auth_index &&
      resetCooldown.mutate(credential.auth_index, {
        onSuccess: () => toast.add({ title: t("cards.cooldownReset", { name: credentialIdentity(credential) }), type: "success" }),
        onError: (error) => toast.add({ title: t("cards.cooldownResetFailed"), description: error.message, type: "error" }),
      }),
  }

  function confirmDelete() {
    if (!deleteTarget) return
    const target =
      deleteTarget.kind === "all"
        ? ({ all: true } as const)
        : {
            names: (deleteTarget.kind === "one" ? [deleteTarget.credential] : deleteTarget.kind === "selected" ? selectedCredentials : filtered)
              .filter((credential) => !credential.runtime_only)
              .map((credential) => credential.name),
          }
    deleteCredentials.mutate(target, {
      onSuccess: (failures) => {
        reportFailures(failures, t("cards.deletedDone"))
        setSelected({})
      },
      onError: (error) => toast.add({ title: t("cards.deleteFailed"), description: error.message, type: "error" }),
    })
    setDeleteTarget(null)
  }

  const deleteScopeLabel =
    status === "problem" && activeProvider === "all" && !search.trim()
      ? t("cards.deleteProblem")
      : activeProvider !== "all" && status === "all" && !search.trim()
        ? t("cards.deleteProvider", { provider: t(`provider.${activeProvider}`, { defaultValue: activeProvider }) })
        : filterActive
          ? t("cards.deleteFiltered")
          : t("cards.deleteAll")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Tabs value={activeProvider} onValueChange={(value) => { setProvider(String(value)); setPage(1) }}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="all">
              {t("credentials.allProviders")}
              <span className="text-muted-foreground tabular-nums">{all.length}</span>
            </TabsTrigger>
            {providerCounts.map(([key, count]) => (
              <TabsTrigger key={key} value={key}>
                {t(`provider.${key}`, { defaultValue: key })}
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:w-60">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={t("credentials.search")}
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              aria-label={t("credentials.search")}
            />
          </InputGroup>
          <Select
            value={status}
            onValueChange={(value) => { setStatus(z.enum(statusFilters).catch("all").parse(value)); setPage(1) }}
            items={statusFilters.map((value) => ({ value, label: value === "problem" ? `${t(`credentials.statusFilter.${value}`)} ${problemCount}` : t(`credentials.statusFilter.${value}`) }))}
          >
            <SelectTrigger className="w-36" aria-label={t("credentials.status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusFilters.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`credentials.statusFilter.${value}`)}
                  {value === "problem" && <span className="ml-auto text-muted-foreground tabular-nums">{problemCount}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value) => setSort(z.enum(sortModes).catch("default").parse(value))}
            items={sortModes.map((value) => ({ value, label: t(`cards.sort.${value}`) }))}
          >
            <SelectTrigger className="w-32" aria-label={t("cards.sortLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortModes.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`cards.sort.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            variant="outline"
            size="default"
            value={[density]}
            onValueChange={(value) => value[0] && setDensity(z.enum(["regular", "compact"]).parse(value[0]))}
            aria-label={t("cards.density")}
          >
            <ToggleGroupItem value="regular">{t("cards.regular")}</ToggleGroupItem>
            <ToggleGroupItem value="compact">{t("cards.compact")}</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            variant="outline"
            size="default"
            value={[layout]}
            onValueChange={(value) => value[0] && setLayout(z.enum(["grid", "stacked"]).parse(value[0]))}
            aria-label={t("cards.layout")}
          >
            <ToggleGroupItem value="grid" aria-label={t("cards.grid")}>
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="stacked" aria-label={t("cards.stacked")}>
              <Columns3 />
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              disabled={refreshAll.isPending || all.length === 0}
              onClick={() =>
                refreshAll.mutate(undefined, {
                  onSuccess: setRefreshResults,
                  onError: (error) => toast.add({ title: t("cards.refreshAllFailed"), description: error.message, type: "error" }),
                })
              }
            >
              <RefreshCw className={refreshAll.isPending ? "animate-spin" : undefined} />
              {t("cards.refreshAll")}
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              disabled={filtered.length === 0}
              onClick={() => setDeleteTarget(filterActive ? { kind: "filtered" } : { kind: "all" })}
            >
              <Trash2 />
              {deleteScopeLabel}
            </Button>
          </div>
        </div>
      </div>

      {selectedCredentials.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          <span className="tabular-nums">{t("cards.selected", { count: selectedCredentials.length })}</span>
          <Button size="sm" variant="ghost" onClick={() => selectVisible("all")}>
            {t("cards.selectPage")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => selectVisible("invert")}>
            {t("cards.invert")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected({})}>
            {t("cards.clear")}
          </Button>
          <div className="ml-auto flex flex-wrap gap-1">
            <Button size="sm" variant="outline" disabled={setDisabled.isPending} onClick={() => setEnabled(selectedCredentials, true)}>
              {t("cards.enable")}
            </Button>
            <Button size="sm" variant="outline" disabled={setDisabled.isPending} onClick={() => setEnabled(selectedCredentials, false)}>
              {t("cards.disable")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => download.mutate(selectedCredentials)}>
              {t("credentials.download")}
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget({ kind: "selected" })}>
              {t("credentials.delete")}
            </Button>
          </div>
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>{t("credentials.loadFailed")}</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      )}

      {query.isPending && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </div>
      )}

      {query.isSuccess && filtered.length === 0 && (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyTitle>{all.length === 0 ? t("credentials.emptyTitle") : t("credentials.noMatchTitle")}</EmptyTitle>
            <EmptyDescription>{all.length === 0 ? t("credentials.emptyDescription") : t("credentials.noMatchDescription")}</EmptyDescription>
          </EmptyHeader>
          {all.length > 0 && (
            <EmptyContent>
              <Button variant="outline" onClick={() => { setSearch(""); setProvider("all"); setStatus("all") }}>
                {t("cards.clearFilters")}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      <div className={cn(layout === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "gap-3 sm:columns-2 xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid")}>
        {visible.map((credential) => (
          <CredentialCard
            key={`${credential.name}:${credential.auth_index ?? ""}`}
            credential={credential}
            density={density}
            selected={Boolean(selected[credential.name])}
            onSelect={(value) => select(credential, value)}
            busy={setDisabled.isPending}
            actions={actions}
          />
        ))}
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            {t("cards.pageSize")}
            <Input
              className="w-14"
              inputMode="numeric"
              value={pageSizeDraft}
              onChange={(event) => setPageSizeDraft(event.target.value)}
              onBlur={() => {
                const value = Number(pageSizeDraft)
                if (Number.isInteger(value) && value >= minPageSize && value <= maxPageSize) {
                  setPageSize(value)
                  setPage(1)
                } else setPageSizeDraft(String(pageSize))
              }}
            />
          </label>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label={t("cards.previous")}>
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">{t("cards.pageOf", { page: currentPage, pages: pageCount, total: filtered.length })}</span>
            <Button size="icon-sm" variant="ghost" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label={t("cards.next")}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(value) => !value && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "one"
                ? t("cards.deleteOneTitle", { name: credentialIdentity(deleteTarget.credential) })
                : deleteTarget?.kind === "selected"
                  ? t("cards.deleteManyTitle", { count: selectedCredentials.length })
                  : deleteTarget?.kind === "filtered"
                    ? t("cards.deleteManyTitle", { count: filtered.length })
                    : t("cards.deleteAllTitle", { count: all.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("cards.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              {t("credentials.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={refreshResults !== null} onOpenChange={(value) => !value && setRefreshResults(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("cards.refreshResults", {
                ok: refreshResults?.filter((result) => result.success).length ?? 0,
                failed: refreshResults?.filter((result) => !result.success).length ?? 0,
              })}
            </DialogTitle>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col divide-y overflow-auto text-xs">
            {refreshResults?.map((result) => (
              <li key={result.id} className="flex flex-col gap-0.5 py-2">
                <span className={result.success ? undefined : "text-destructive"}>{result.id}</span>
                {result.error && <span className="break-all text-muted-foreground">{result.error}</span>}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
