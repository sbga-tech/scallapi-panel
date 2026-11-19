import { Check, Plus, Trash2 } from "lucide-react"
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ApiError } from "@/lib/api"
import { useApiKeyFamilies, useCredentials, useRoutes, useSaveRoutes } from "@/lib/queries"
import type { ApiKeyFamilies, Credential, RouteConfig } from "@/lib/schemas"
import { cn } from "@/lib/utils"

const newRouteKey = "~new"

type KeyGroup = { provider: string; label: string }

function keyGroups(families: ApiKeyFamilies): KeyGroup[] {
  return Object.entries(families).flatMap(([family, groups]) =>
    groups.map((group, index) => ({
      provider: family === "openai-compatibility" ? group.name.toLowerCase() : family,
      label: group.name || `${family} ${index + 1}`,
    }))
  )
}

export function RoutesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const routes = useRoutes()
  const credentials = useCredentials()
  const families = useApiKeyFamilies()
  const list = routes.data?.data ?? []
  const selectedName = params.name ?? list[0]?.name ?? newRouteKey

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
      <div className="grid flex-1 gap-6 p-4 md:p-6 lg:grid-cols-[18rem_1fr]">
        <nav aria-label={t("nav.routes")} className="flex flex-col gap-1">
          {routes.isPending && <Skeleton className="h-24 w-full" />}
          {list.map((route) => (
            <RouteLink key={route.name} route={route} active={route.name === selectedName} onSelect={() => navigate(`/routes/${route.name}`)} />
          ))}
          <div className="mt-2 rounded-lg border border-dashed px-3 py-2.5">
            <div className="text-sm font-medium">{t("routes.default")}</div>
            <div className="text-xs text-muted-foreground">{t("routes.defaultDescription")}</div>
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
            credentials={credentials.data ?? []}
            groups={keyGroups(families.data?.data ?? {})}
          />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </div>
    </>
  )
}

function RouteLink({ route, active, onSelect }: { route: RouteConfig; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active && "bg-muted"
      )}
    >
      <span className="text-sm font-medium">{route.name}</span>
      <span className="font-mono text-xs text-muted-foreground">{route.path}</span>
    </button>
  )
}

const emptyRoute: RouteConfig = { name: "", path: "", "rewrite-to": "", providers: [], "auth-files": [] }

function RouteEditor({
  routes,
  etag,
  original,
  credentials,
  groups,
}: {
  routes: RouteConfig[]
  etag: string | null
  original: RouteConfig | undefined
  credentials: Credential[]
  groups: KeyGroup[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const save = useSaveRoutes()
  const [draft, setDraftState] = useState<RouteConfig>(original ?? emptyRoute)
  const [error, setError] = useState<string | null>(null)
  function setDraft(next: RouteConfig) {
    setDraftState(next)
    setError(null)
  }

  const providerOptions = useMemo(
    () => [...new Set([...credentials.map((credential) => credential.provider), ...groups.map((group) => group.provider)])].sort(),
    [credentials, groups]
  )
  const providerAllowed = (provider: string) => draft.providers.length === 0 || draft.providers.includes(provider.toLowerCase())
  const fileSelected = (name: string) => draft["auth-files"].length === 0 || draft["auth-files"].includes(name)
  const matchedFiles = credentials.filter((credential) => providerAllowed(credential.provider) && fileSelected(credential.name))
  const matchedGroups = draft["auth-files"].length === 0 ? groups.filter((group) => providerAllowed(group.provider)) : []
  const dirty = JSON.stringify(draft) !== JSON.stringify(original ?? emptyRoute)
  const isNew = !original

  function validate(): string | null {
    if (!draft.name.trim()) return t("routes.errors.name")
    if (routes.some((route) => route.name === draft.name && route !== original)) return t("routes.errors.nameTaken")
    if (!/^\/.*[^/]$/.test(draft.path)) return t("routes.errors.path")
    if (routes.some((route) => route.path === draft.path && route !== original)) return t("routes.errors.pathTaken")
    if (draft["rewrite-to"] && !/^\/.*[^/]$/.test(draft["rewrite-to"])) return t("routes.errors.rewrite")
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
    const next = isNew ? [...routes, draft] : routes.map((route) => (route === original ? draft : route))
    persist(next, () => {
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

  const samplePath = draft.path ? `${draft.path}/chat/completions` : "/v1/cyber/chat/completions"
  const rewritten = draft.path ? `${draft["rewrite-to"]}/chat/completions` : ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? t("routes.newTitle") : draft.name || original?.name}</CardTitle>
        <CardDescription>
          {t("routes.matches", {
            files: t("routes.matchesFiles", { count: matchedFiles.length }),
            groups: t("routes.matchesGroups", { count: matchedGroups.length }),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="route-name">{t("routes.name")}</FieldLabel>
            <Input id="route-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="route-path">{t("routes.path")}</FieldLabel>
            <Input
              id="route-path"
              className="font-mono"
              placeholder="/v1/cyber"
              value={draft.path}
              onChange={(event) => setDraft({ ...draft, path: event.target.value })}
            />
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
          <FieldDescription className="font-mono text-xs md:col-span-3">
            {samplePath} → {rewritten || "/chat/completions"}
          </FieldDescription>
        </FieldGroup>

        <FieldSet>
          <FieldLegend variant="label">{t("routes.providers")}</FieldLegend>
          <FieldDescription>{draft.providers.length === 0 ? t("routes.allProviders") : t("routes.someProviders")}</FieldDescription>
          <ToggleGroup
            multiple
            variant="outline"
            value={draft.providers}
            onValueChange={(value) => setDraft({ ...draft, providers: value as string[] })}
            className="flex-wrap justify-start"
          >
            {providerOptions.map((provider) => (
              <ToggleGroupItem
                key={provider}
                value={provider.toLowerCase()}
                size="sm"
                className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {draft.providers.includes(provider.toLowerCase()) && <Check />}
                {provider}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">{t("routes.credentials")}</FieldLegend>
          <FieldDescription>{draft["auth-files"].length === 0 ? t("routes.allFiles") : t("routes.someFiles", { count: draft["auth-files"].length })}</FieldDescription>
          <div className="divide-y rounded-lg border">
            {credentials.map((credential) => {
              const excluded = !providerAllowed(credential.provider)
              const checked = draft["auth-files"].includes(credential.name)
              return (
                <label
                  key={credential.name}
                  className={cn("flex items-center gap-3 px-3 py-2.5", excluded ? "text-muted-foreground" : "cursor-pointer hover:bg-muted/50")}
                >
                  <Checkbox
                    checked={checked}
                    disabled={excluded}
                    onCheckedChange={(value) =>
                      setDraft({
                        ...draft,
                        "auth-files": value
                          ? [...draft["auth-files"], credential.name]
                          : draft["auth-files"].filter((name) => name !== credential.name),
                      })
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{credential.email ?? credential.label ?? credential.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {credential.provider} · {credential.name}
                    </span>
                  </div>
                  {excluded ? (
                    <span className="text-xs">{t("routes.excludedByProvider")}</span>
                  ) : fileSelected(credential.name) ? (
                    <Badge variant="secondary">{t("routes.matched")}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("routes.notSelected")}</span>
                  )}
                </label>
              )
            })}
            {groups.map((group) => {
              const matched = matchedGroups.includes(group)
              return (
                <div key={`${group.provider}:${group.label}`} className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground">
                  <Checkbox checked={false} disabled aria-label={group.label} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">{group.label}</span>
                    <span className="truncate text-xs">{t("routes.apiKeyGroup", { provider: group.provider })}</span>
                  </div>
                  {matched ? <Badge variant="secondary">{t("routes.matched")}</Badge> : <span className="text-xs">{t("routes.keysByProviderOnly")}</span>}
                </div>
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
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t">
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
      </CardFooter>
    </Card>
  )
}
