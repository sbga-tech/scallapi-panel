import type { UseQueryResult } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Versioned } from "@/lib/api"
import type { ApiKeyFamilies, ApiKeyGroup } from "@/lib/schemas"

export function ProvidersTab({ query }: { query: UseQueryResult<Versioned<ApiKeyFamilies>> }) {
  const { t } = useTranslation()
  const families = Object.entries(query.data?.data ?? {}).filter(([, groups]) => groups.length > 0)

  if (query.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("providers.loadFailed")}</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
      </Alert>
    )

  if (query.isPending) return <Skeleton className="h-40 w-full" />

  if (families.length === 0)
    return (
      <Empty className="rounded-lg border">
        <EmptyHeader>
          <EmptyTitle>{t("providers.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("providers.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <div className="flex flex-col gap-6">
      {families.map(([family, groups]) => (
        <section key={family} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {t(`family.${family}`, { defaultValue: family })}
            <span className="ml-2 text-muted-foreground tabular-nums">{groups.length}</span>
          </h2>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">{t("providers.name")}</TableHead>
                  <TableHead>{t("providers.baseUrl")}</TableHead>
                  <TableHead className="text-right">{t("providers.keys")}</TableHead>
                  <TableHead className="text-right">{t("providers.models")}</TableHead>
                  <TableHead className="text-right">{t("credentials.priority")}</TableHead>
                  <TableHead className="pr-4">{t("credentials.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group, index) => (
                  <GroupRow key={`${group.name}:${index}`} group={group} />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  )
}

function GroupRow({ group }: { group: ApiKeyGroup }) {
  const { t } = useTranslation()
  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex flex-col">
          <span className="font-medium">{group.name || t("providers.unnamed")}</span>
          {group.prefix && <span className="text-xs text-muted-foreground">{t("providers.prefix", { prefix: group.prefix })}</span>}
        </div>
      </TableCell>
      <TableCell className="max-w-80 truncate font-mono text-xs text-muted-foreground">
        {group["base-url"] ?? t("providers.defaultEndpoint")}
      </TableCell>
      <TableCell className="text-right tabular-nums">{group.keys.length}</TableCell>
      <TableCell className="text-right tabular-nums">{group.models.length || "—"}</TableCell>
      <TableCell className="text-right tabular-nums">{group.priority ?? 0}</TableCell>
      <TableCell className="pr-4">
        {group.disabled ? <Badge variant="secondary">{t("credentials.state.disabled")}</Badge> : <Badge variant="outline">{t("credentials.state.active")}</Badge>}
      </TableCell>
    </TableRow>
  )
}
