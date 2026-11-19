import type { UseQueryResult } from "@tanstack/react-query"
import { Download, EllipsisVertical, RefreshCw, Search, Trash2, Upload } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { credentialState, stateTone, type CredentialState } from "@/lib/credential-status"
import { queryKeys, useRefreshCredential, useSetCredentialDisabled } from "@/lib/queries"
import type { Credential } from "@/lib/schemas"
import { useClient } from "@/lib/session"

const statusFilters = ["all", "enabled", "disabled", "problem"] as const
type StatusFilter = (typeof statusFilters)[number]

function wildcardMatcher(query: string) {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return () => true
  const pattern = new RegExp(trimmed.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*"))
  return (credential: Credential) =>
    [credential.name, credential.provider, credential.email, credential.project_id, credential.auth_index]
      .filter(Boolean)
      .some((value) => pattern.test(String(value).toLowerCase()))
}

export function OAuthTab({ query }: { query: UseQueryResult<Credential[]> }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [provider, setProvider] = useState("all")
  const [status, setStatus] = useState<StatusFilter>("all")

  const providers = useMemo(
    () => [...new Set((query.data ?? []).map((credential) => credential.provider))].sort(),
    [query.data]
  )

  const rows = useMemo(() => {
    const matches = wildcardMatcher(search)
    return (query.data ?? []).filter((credential) => {
      const state = credentialState(credential)
      if (provider !== "all" && credential.provider !== provider) return false
      if (status === "enabled" && credential.disabled) return false
      if (status === "disabled" && !credential.disabled) return false
      if (status === "problem" && (state === "active" || state === "disabled")) return false
      return matches(credential)
    })
  }, [query.data, search, provider, status])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t("credentials.search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("credentials.search")}
          />
        </InputGroup>
        <Select
          value={provider}
          onValueChange={(value) => setProvider(value ?? "all")}
          items={[{ value: "all", label: t("credentials.allProviders") }, ...providers.map((value) => ({ value, label: value }))]}
        >
          <SelectTrigger className="w-40" aria-label={t("credentials.provider")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("credentials.allProviders")}</SelectItem>
            {providers.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => setStatus((value as StatusFilter | null) ?? "all")}
          items={statusFilters.map((value) => ({ value, label: t(`credentials.statusFilter.${value}`) }))}
        >
          <SelectTrigger className="w-36" aria-label={t("credentials.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`credentials.statusFilter.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <UploadButton />
        </div>
      </div>

      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>{t("credentials.loadFailed")}</AlertTitle>
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="pl-4">{t("credentials.account")}</TableHead>
              <TableHead>{t("credentials.provider")}</TableHead>
              <TableHead>{t("credentials.status")}</TableHead>
              <TableHead className="text-right">{t("credentials.priority")}</TableHead>
              <TableHead className="w-28 pr-4 text-right">{t("credentials.enabled")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isPending &&
              Array.from({ length: 3 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={5} className="px-4">
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {rows.map((credential) => (
              <CredentialRow key={`${credential.name}:${credential.auth_index ?? ""}`} credential={credential} />
            ))}
          </TableBody>
        </Table>
        {query.isSuccess && rows.length === 0 && (
          <Empty className="border-t">
            <EmptyHeader>
              <EmptyTitle>{query.data.length === 0 ? t("credentials.emptyTitle") : t("credentials.noMatchTitle")}</EmptyTitle>
              <EmptyDescription>
                {query.data.length === 0 ? t("credentials.emptyDescription") : t("credentials.noMatchDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )
}

function CredentialRow({ credential }: { credential: Credential }) {
  const { t } = useTranslation()
  const client = useClient()
  const queryClient = useQueryClient()
  const setDisabled = useSetCredentialDisabled()
  const refresh = useRefreshCredential()
  const state: CredentialState = credentialState(credential)
  const detail = credential.refresh_error?.message ?? (credential.status_message !== credential.status ? credential.status_message : undefined)
  const identity = credential.email ?? credential.label ?? credential.account ?? credential.name

  async function download() {
    const blob = await client.download(`/credentials/download?name=${encodeURIComponent(credential.name)}`)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = credential.name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function remove() {
    await client.del("/credentials", { name: credential.name, auth_index: credential.auth_index })
    await queryClient.invalidateQueries({ queryKey: queryKeys.credentials })
    toast.add({ title: t("credentials.deleted", { name: credential.name }), type: "success" })
  }

  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex flex-col">
          <span className="font-medium">{identity}</span>
          <span className="text-xs text-muted-foreground">{credential.name}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{t(`provider.${credential.provider}`, { defaultValue: credential.provider })}</span>
          {credential.plan_type && <span className="text-xs text-muted-foreground">{credential.plan_type}</span>}
        </div>
      </TableCell>
      <TableCell className="max-w-72">
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${stateTone[state]}`} aria-hidden />
          <div className="flex min-w-0 flex-col">
            <span>{t(`credentials.state.${state}`)}</span>
            {detail && state !== "active" && (
              <span className="truncate text-xs text-muted-foreground" title={detail}>
                {detail}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{credential.priority ?? 0}</TableCell>
      <TableCell className="pr-4">
        <div className="flex items-center justify-end gap-1">
          <Switch
            checked={!credential.disabled}
            disabled={credential.runtime_only || setDisabled.isPending}
            aria-label={t("credentials.enabled")}
            onCheckedChange={(checked) =>
              setDisabled.mutate(
                { name: credential.name, authIndex: credential.auth_index, disabled: !checked },
                { onError: (error) => toast.add({ title: t("credentials.statusFailed"), description: error.message, type: "error" }) }
              )
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("common.more")} />}>
              <EllipsisVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  refresh.mutate(
                    { name: credential.name, authIndex: credential.auth_index },
                    {
                      onSuccess: () => toast.add({ title: t("credentials.refreshed", { name: identity }), type: "success" }),
                      onError: (error) => toast.add({ title: t("credentials.refreshFailed"), description: error.message, type: "error" }),
                    }
                  )
                }
              >
                <RefreshCw />
                {t("credentials.refresh")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={credential.runtime_only} onClick={() => void download()}>
                <Download />
                {t("credentials.download")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={credential.runtime_only} onClick={() => void remove()}>
                <Trash2 />
                {t("credentials.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

function UploadButton() {
  const { t } = useTranslation()
  const client = useClient()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)

  async function upload(files: FileList) {
    const form = new FormData()
    for (const file of files) form.append("file", file)
    try {
      await client.post("/credentials", form)
      toast.add({ title: t("credentials.uploaded", { count: files.length }), type: "success" })
    } catch (error) {
      toast.add({ title: t("credentials.uploadFailed"), description: (error as Error).message, type: "error" })
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.credentials })
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) void upload(event.target.files)
          event.target.value = ""
        }}
      />
      <Button onClick={() => input.current?.click()}>
        <Upload />
        {t("credentials.upload")}
      </Button>
    </>
  )
}
