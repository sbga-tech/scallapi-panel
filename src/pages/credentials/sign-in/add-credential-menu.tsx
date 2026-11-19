import { Fragment, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { queryKeys } from "@/lib/queries"
import { useClient } from "@/lib/session"
import { SignInDialog } from "@/pages/credentials/sign-in/sign-in-dialog"
import { SiwcBindDialog } from "@/pages/credentials/sign-in/siwc-dialog"

const providers = [
  "codex",
  "claude",
  "antigravity",
  "xai",
  "devin",
  "kimi",
  "kimi-ai",
  "meta",
]

export function AddCredentialMenu() {
  const { t } = useTranslation()
  const client = useClient()
  const plugins = useQuery({
    queryKey: ["plugins", "sign-in"],
    queryFn: async () =>
      z
        .object({
          plugins: z.array(
            z.looseObject({
              id: z.string(),
              name: z.string().optional(),
              metadata: z
                .looseObject({ name: z.string().optional() })
                .optional(),
              supports_oauth: z.boolean().optional(),
              effective_enabled: z.boolean().optional(),
              oauth_provider: z.string().optional(),
              oauth_providers: z.array(z.string()).optional(),
              oauth_provider_entries: z
                .array(
                  z.object({
                    identifier: z.string(),
                    name: z.string().optional(),
                  })
                )
                .optional(),
            })
          ),
        })
        .parse(await client.get("/plugins")).plugins,
    retry: false,
  })
  const pluginProviders =
    plugins.data
      ?.filter((plugin) => plugin.supports_oauth && plugin.effective_enabled)
      .flatMap((plugin) =>
        (plugin.oauth_providers?.length
          ? plugin.oauth_providers
          : plugin.oauth_provider
            ? [plugin.oauth_provider]
            : []
        ).map((id) => ({
          id,
          name:
            plugin.oauth_provider_entries?.find(
              (entry) => entry.identifier === id
            )?.name ??
            plugin.metadata?.name ??
            plugin.name ??
            plugin.id,
        }))
      )
      .filter(
        (entry, index, entries) =>
          !providers.includes(entry.id) &&
          entries.findIndex((candidate) => candidate.id === entry.id) === index
      ) ?? []
  const [provider, setProvider] = useState<string | null>(null)
  const [siwc, setSiwc] = useState(false)
  const [upload, setUpload] = useState(false)
  const [vertex, setVertex] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>
          {t("signin.addCredential")}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {providers.map((item, index) => (
            <Fragment key={item}>
              {index === 5 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={() => setProvider(item)}>
                {t(`signin.providers.${item}`)}
              </DropdownMenuItem>
            </Fragment>
          ))}
          {pluginProviders.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => setProvider(item.id)}
            >
              {item.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSiwc(true)}>
            {t("signin.signInWithWebCredentials")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setVertex(true)}>
            {t("signin.importVertex")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUpload(true)}>
            {t("signin.uploadAuthFiles")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {provider && (
        <SignInDialog
          open
          onOpenChange={(open) => !open && setProvider(null)}
          provider={provider}
        />
      )}
      <SiwcBindDialog open={siwc} onOpenChange={setSiwc} />
      <FileDialog open={upload} onOpenChange={setUpload} kind="files" />
      <FileDialog open={vertex} onOpenChange={setVertex} kind="vertex" />
    </>
  )
}

function FileDialog({
  open,
  onOpenChange,
  kind,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: "files" | "vertex"
}) {
  const { t } = useTranslation()
  const client = useClient()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem(
      "files"
    ) as HTMLInputElement
    const files = Array.from(input.files ?? [])
    const failures: string[] = []
    setBusy(true)
    for (const file of files) {
      if (
        !file.name.toLowerCase().endsWith(".json") ||
        file.size > 10 * 1024 * 1024
      ) {
        failures.push(`${file.name}: ${t("signin.invalidFile")}`)
        continue
      }
      try {
        const form = new FormData()
        form.append("file", file)
        const result = z
          .object({
            status: z.string().optional(),
            failed: z
              .array(z.object({ name: z.string(), error: z.string() }))
              .optional(),
          })
          .parse(
            await client.post(
              kind === "vertex"
                ? "/oauth/import?provider=vertex"
                : "/credentials",
              form
            )
          )
        for (const failure of result.failed ?? [])
          failures.push(`${failure.name}: ${failure.error}`)
      } catch (error) {
        failures.push(
          `${file.name}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.credentials })
    setErrors(failures)
    setBusy(false)
    if (files.length && !failures.length) onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === "vertex"
              ? t("signin.importVertex")
              : t("signin.uploadAuthFiles")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input name="files" type="file" accept=".json,application/json" multiple={kind === "files"} required />
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="flex flex-col gap-1">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button disabled={busy} type="submit">
              {t("signin.upload")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
