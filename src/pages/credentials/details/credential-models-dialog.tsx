import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Search, Copy } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useClient } from "@/lib/session"
import type { Credential } from "@/lib/schemas"

const ModelsResponse = z.object({
  models: z
    .array(
      z.looseObject({ id: z.string().optional(), name: z.string().optional() })
    )
    .nullish()
    .transform((value) => value ?? []),
})

export function CredentialModelsDialog({
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
  const [search, setSearch] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ["credentials", "models", credential?.name],
    enabled: open && credential !== null,
    queryFn: async () =>
      credential
        ? ModelsResponse.parse(
            await client.get(
              `/credentials/models?name=${encodeURIComponent(credential.name)}`
            )
          ).models
        : [],
  })
  const models = useMemo(() => query.data ?? [], [query.data])
  const loading = query.isPending && open
  const error = query.isError

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return models
    return models.filter((model) =>
      `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase().includes(query)
    )
  }, [models, search])

  const copyModel = (id: string) => {
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(id)
      window.setTimeout(
        () => setCopied((current) => (current === id ? null : current)),
        1200
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(75vh,38rem)] w-[min(42rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("details.modelsTitle")}</DialogTitle>
          <DialogDescription>{credential?.name ?? ""}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex flex-col gap-2 py-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        ) : error ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("details.modelsLoadFailed")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : models.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("details.modelsEmpty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1.5 left-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("details.modelsSearch")}
                className="pl-8"
              />
            </div>
            {filtered.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle>
                    {t("details.noModelsMatch", {
                      defaultValue: "No models match",
                    })}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="min-h-0 overflow-y-auto rounded-md border">
                {filtered.map((model) => {
                  const id = model.id ?? model.name ?? ""
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 border-b px-3 py-2 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs">{id}</div>
                        {model.name && model.name !== id && (
                          <div className="truncate text-[0.6875rem] text-muted-foreground">
                            {model.name}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={t("details.modelsCopy")}
                        onClick={() => copyModel(id)}
                      >
                        {copied === id ? (
                          <span className="text-[0.625rem]">
                            {t("details.modelsCopied")}
                          </span>
                        ) : (
                          <Copy />
                        )}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
