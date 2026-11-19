import { Check, KeyRound, Plus, Trash2, UserRound } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router"

import { PageHeader } from "@/components/page-header"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"
import { useApiKeyFamilies, useCredentials, useRoutes, useSaveRoutes } from "@/lib/queries"
import { candidateState, routeCandidates, type RouteCandidate } from "@/lib/route-candidates"
import type { RouteConfig } from "@/lib/schemas"
import { cn } from "@/lib/utils"

const newRouteKey = "~new"
const emptyRoute: RouteConfig = { name: "", path: "", "rewrite-to": "", providers: [], credentials: [] }
const prefixPattern = /^\/.*[^/]$/

export function RoutesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const routes = useRoutes()
  const credentials = useCredentials()
  const families = useApiKeyFamilies()
  const list = routes.data?.data ?? []
  const selectedName = params.name ?? list[0]?.name ?? newRouteKey
  const candidates = useMemo(() => routeCandidates(credentials.data ?? [], families.data?.data ?? {}), [credentials.data, families.data])

  return (
    <>
      <PageHeader
        title={t("nav.routes")}
        actions={
          <Button onClick={() => navigate(`/routes/${newRouteKey}`)}>
            <Plus />
            {t("routes.add")}
          </Button>
        }
      />
      <div className="grid flex-1 items-start gap-6 p-4 md:p-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label={t("nav.routes")} className="flex flex-col gap-0.5">
          {routes.isPending && <Skeleton className="h-20 w-full" />}
          {list.map((route) => (
            <button
              key={route.name}
              type="button"
              onClick={() => navigate(`/routes/${route.name}`)}
              aria-current={route.name === selectedName ? "page" : undefined}
              className={cn(
                "flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                route.name === selectedName && "bg-muted"
              )}
            >
              <span className="font-medium">{route.name}</span>
              <span className="font-mono text-muted-foreground">{route.path}</span>
            </button>
          ))}
          <div className="mt-2 flex flex-col gap-0.5 rounded-md border border-dashed px-2.5 py-2 text-xs">
            <span className="font-medium">{t("routes.default")}</span>
            <span className="text-muted-foreground">{t("routes.defaultDescription")}</span>
          </div>
        </nav>

        {routes.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("routes.loadFailed")}</AlertTitle>
            <AlertDescription>{routes.error.message}</AlertDescription>
          </Alert>
        ) : routes.data ? (
          <RouteEditor
            key={selectedName}
            routes={list}
            etag={routes.data.etag}
            original={list.find((route) => route.name === selectedName)}
            candidates={candidates}
          />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </div>
    </>
  )
}

function RouteEditor({
  routes,
  etag,
  original,
  candidates,
}: {
  routes: RouteConfig[]
  etag: string | null
  original: RouteConfig | undefined
  candidates: RouteCandidate[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const save = useSaveRoutes()
  const [draft, setDraftState] = useState<RouteConfig>(original ?? emptyRoute)
  const [error, setError] = useState<string | null>(null)
  const isNew = !original
  const dirty = JSON.stringify(draft) !== JSON.stringify(original ?? emptyRoute)
  const providerOptions = [...new Set(candidates.map((candidate) => candidate.provider))].sort()
  const serving = candidates.filter((candidate) => candidateState(draft, candidate) === "serving")

  function setDraft(next: RouteConfig) {
    setDraftState(next)
    setError(null)
  }

  function toggleCredential(selector: string, checked: boolean) {
    setDraft({
      ...draft,
      credentials: checked ? [...draft.credentials, selector] : draft.credentials.filter((name) => name !== selector),
    })
  }

  function validate() {
    if (!draft.name.trim()) return t("routes.errors.name")
    if (routes.some((route) => route.name === draft.name && route !== original)) return t("routes.errors.nameTaken")
    if (!prefixPattern.test(draft.path)) return t("routes.errors.path")
    if (routes.some((route) => route.path === draft.path && route !== original)) return t("routes.errors.pathTaken")
    if (draft["rewrite-to"] && !prefixPattern.test(draft["rewrite-to"])) return t("routes.errors.rewrite")
    return null
  }

  function persist(next: RouteConfig[], onSaved: () => void) {
    save.mutate(
      { routes: next, etag },
      {
        onSuccess: onSaved,
        onError: (caught) =>
          setError(caught instanceof ApiError && (caught.status === 409 || caught.status === 412) ? t("routes.errors.conflict") : caught.message),
      }
    )
  }

  function submit() {
    const problem = validate()
    if (problem) return setError(problem)
    persist(isNew ? [...routes, draft] : routes.map((route) => (route === original ? draft : route)), () => {
      toast.add({ title: t("routes.saved", { name: draft.name }), type: "success" })
      navigate(`/routes/${draft.name}`, { replace: true })
    })
  }

  function remove() {
    persist(
      routes.filter((route) => route !== original),
      () => {
        toast.add({ title: t("routes.deleted", { name: original?.name }), type: "success" })
        navigate("/routes", { replace: true })
      }
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{isNew ? t("routes.newTitle") : original?.name}</h2>
        <p className="text-xs text-muted-foreground">{t("routes.servedBy", { count: serving.length })}</p>
      </div>

      <FieldGroup className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="route-name">{t("routes.name")}</FieldLabel>
          <Input id="route-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="route-path">{t("routes.path")}</FieldLabel>
          <Input id="route-path" className="font-mono" placeholder="/v1/cyber" value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="route-rewrite">{t("routes.rewrite")}</FieldLabel>
          <Input
            id="route-rewrite"
            className="font-mono"
            placeholder="/v1"
            value={draft["rewrite-to"]}
            onChange={(event) => setDraft({ ...draft, "rewrite-to": event.target.value })}
          />
        </Field>
        {draft.path && (
          <FieldDescription className="font-mono sm:col-span-3">
            {draft.path}/chat/completions → {draft["rewrite-to"]}/chat/completions
          </FieldDescription>
        )}
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">{t("routes.providers")}</FieldLegend>
        <FieldDescription>{draft.providers.length === 0 ? t("routes.allProviders") : t("routes.someProviders")}</FieldDescription>
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          value={draft.providers}
          onValueChange={(value) => setDraft({ ...draft, providers: value as string[] })}
          className="flex-wrap justify-start"
        >
          {providerOptions.map((provider) => (
            <ToggleGroupItem key={provider} value={provider} className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
              {draft.providers.includes(provider) && <Check />}
              {provider}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">{t("routes.credentials")}</FieldLegend>
        <FieldDescription>
          {draft.credentials.length === 0 ? t("routes.allCredentials") : t("routes.someCredentials", { count: draft.credentials.length })}
        </FieldDescription>
        <div className="divide-y rounded-md border">
          {candidates.map((candidate) => {
            const state = candidateState(draft, candidate)
            const selectable = candidate.selector !== null && state !== "providerExcluded"
            const Icon = candidate.kind === "oauth" ? UserRound : KeyRound
            return (
              <label
                key={candidate.id}
                className={cn("flex items-center gap-3 px-3 py-2 text-xs", selectable ? "cursor-pointer hover:bg-muted/50" : "text-muted-foreground")}
              >
                <Checkbox
                  checked={candidate.selector !== null && draft.credentials.includes(candidate.selector)}
                  disabled={!selectable}
                  onCheckedChange={(value) => candidate.selector && toggleCredential(candidate.selector, value === true)}
                />
                <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("truncate", selectable && "text-foreground")}>{candidate.title}</span>
                  <span className="truncate text-muted-foreground">
                    {candidate.kind === "oauth"
                      ? t("routes.oauthDetail", { provider: candidate.provider, file: candidate.detail })
                      : t("routes.apiKeyDetail", { family: t(`family.${candidate.detail}`, { defaultValue: candidate.detail }), count: candidate.keyCount })}
                  </span>
                </div>
                {state === "serving" ? <Badge variant="secondary">{t("routes.state.serving")}</Badge> : <span>{t(`routes.state.${state}`)}</span>}
              </label>
            )
          })}
        </div>
      </FieldSet>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("routes.saveFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        {isNew ? (
          <span />
        ) : (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" className="text-destructive" />}>
              <Trash2 />
              {t("routes.delete")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("routes.deleteTitle", { name: original?.name })}</AlertDialogTitle>
                <AlertDialogDescription>{t("routes.deleteDescription", { path: original?.path })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={remove}>
                  {t("routes.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <div className="flex gap-2">
          <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => setDraft(original ?? emptyRoute)}>
            {t("common.discard")}
          </Button>
          <Button disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending && <Spinner />}
            {t("routes.save")}
          </Button>
        </div>
      </div>
    </div>
  )
}
