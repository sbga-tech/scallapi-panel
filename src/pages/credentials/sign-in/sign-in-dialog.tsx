import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { queryKeys } from "@/lib/queries"
import { useClient } from "@/lib/session"

const Session = z.object({
  url: z.url(),
  state: z.string().min(1),
  user_code: z.string().optional(),
  expires_in: z.number().optional(),
})
const Status = z.object({
  status: z.enum(["ok", "wait", "error", "expired"]),
  error: z.string().optional(),
})
type LoginSession = z.infer<typeof Session>
export type SignInCredential = { name: string; authIndex?: string }

export function SignInDialog({
  open,
  onOpenChange,
  provider,
  credential,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: string
  credential?: SignInCredential
}) {
  return (
    <LoginDialog
      open={open}
      onOpenChange={onOpenChange}
      provider={provider === "anthropic" ? "claude" : provider}
      credential={credential}
    />
  )
}

export function LoginDialog({
  open,
  onOpenChange,
  provider,
  credential,
  bind = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: string
  credential?: SignInCredential
  bind?: boolean
}) {
  const { t } = useTranslation()
  const client = useClient()
  const queryClient = useQueryClient()
  const [session, setSession] = useState<LoginSession | null>(null)
  const [phase, setPhase] = useState<
    "idle" | "starting" | "wait" | "ok" | "error"
  >("idle")
  const [error, setError] = useState("")
  const [callback, setCallback] = useState("")
  const [verify, setVerify] = useState(false)
  const [proxy, setProxy] = useState("")
  const storageKey = `scallapi.oauth.${client.root}.${provider}.${credential?.name ?? ""}.${bind}`
  const [run, setRun] = useState(() =>
    sessionStorage.getItem(storageKey) ? 1 : 0
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !run) return
    let active = true
    let current: LoginSession | null = null
    let timer: number | undefined
    let attempts = 0
    let completed = false
    let unloading = false
    const preserveDevice = () => {
      unloading = Boolean(current?.user_code)
    }
    window.addEventListener("pagehide", preserveDevice)
    async function poll() {
      if (!active || !current) return
      try {
        const result = Status.parse(
          await client.get(
            `${bind ? "/oauth/siwc/status" : "/oauth/status"}?state=${encodeURIComponent(current.state)}`
          )
        )
        if (!active) return
        if (result.status === "ok") {
          completed = true
          sessionStorage.removeItem(storageKey)
          setPhase("ok")
          await queryClient.invalidateQueries({
            queryKey: queryKeys.credentials,
          })
        } else if (result.status !== "wait" || ++attempts >= 300) {
          sessionStorage.removeItem(storageKey)
          setPhase("error")
          setError(result.error ?? t("signin.expired"))
        } else timer = window.setTimeout(() => void poll(), 3000)
      } catch (failure) {
        if (active) {
          setPhase("error")
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }
    }
    async function start() {
      setPhase("starting")
      setError("")
      setSession(null)
      try {
        const saved = sessionStorage.getItem(storageKey)
        const params = new URLSearchParams({ provider })
        if (
          ["codex", "claude", "antigravity", "xai", "devin"].includes(provider)
        )
          params.set("is_webui", "true")
        if (credential) {
          params.set("name", credential.name)
          if (credential.authIndex)
            params.set("auth_index", credential.authIndex)
          if (verify) params.set("verify", "true")
        }
        const response = saved
          ? (JSON.parse(saved) as unknown)
          : bind
            ? await client.post("/oauth/siwc/bind", { name: credential?.name })
            : proxy.trim()
              ? await client.post("/oauth/auth-url", {
                  ...Object.fromEntries(params),
                  proxy_url: proxy.trim(),
                })
              : await client.get(`/oauth/auth-url?${params}`)
        current = Session.parse(response)
        if (!active) {
          z.looseObject({}).parse(
            await client.del(
              `/oauth/session?state=${encodeURIComponent(current.state)}`
            )
          )
          return
        }
        setSession(current)
        setPhase("wait")
        sessionStorage.setItem(storageKey, JSON.stringify(current))
        void poll()
      } catch (failure) {
        if (active) {
          sessionStorage.removeItem(storageKey)
          setPhase("error")
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }
    }
    void start()
    return () => {
      window.removeEventListener("pagehide", preserveDevice)
      if (unloading) return
      active = false
      window.clearTimeout(timer)
      sessionStorage.removeItem(storageKey)
      if (current && !completed)
        void client
          .del(`/oauth/session?state=${encodeURIComponent(current.state)}`)
          .catch(() => undefined)
    }
  }, [
    open,
    run,
    client,
    provider,
    credential,
    bind,
    storageKey,
    queryClient,
    t,
    verify,
    proxy,
  ])

  async function submitCallback() {
    setSubmitting(true)
    setError("")
    try {
      let redirect = callback.trim()
      if (!redirect) throw new Error(t("signin.callbackRequired"))
      if (provider === "xai" && !/^https?:\/\//i.test(redirect)) {
        const params = new URLSearchParams(redirect.replace(/^[?#]/, ""))
        const target = new URL("http://127.0.0.1:56121/callback")
        target.searchParams.set(
          "state",
          params.get("state") ?? session?.state ?? ""
        )
        for (const key of ["code", "error", "error_description"]) {
          const value = params.get(key)
          if (value) target.searchParams.set(key, value)
        }
        if (
          !target.searchParams.has("code") &&
          !target.searchParams.has("error")
        )
          target.searchParams.set(
            "code",
            redirect.match(/\bcode\s*[:=]\s*([^\s&]+)/i)?.[1] ?? redirect
          )
        redirect = target.toString()
      }
      const url = new URL(redirect)
      if (url.searchParams.get("state") !== session?.state)
        throw new Error(t("signin.callbackState"))
      if (
        bind &&
        (redirect.split("?")[0] !== "http://127.0.0.1:1455/auth/callback" ||
          url.hash ||
          ["state", "code", "client_id", "error"].some(
            (key) => url.searchParams.getAll(key).length > 1
          ) ||
          !(
            url.searchParams.get("error") ||
            (url.searchParams.get("code") && url.searchParams.get("client_id"))
          ))
      )
        throw new Error(t("signin.callbackState"))
      z.object({ status: z.literal("ok") }).parse(
        await client.post("/oauth/callback", {
          provider: bind ? "codex" : provider,
          redirect_url: redirect,
        })
      )
      setCallback("")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {bind
              ? t("signin.bind")
              : t("signin.signIn", {
                  provider: t(`signin.providers.${provider}`, {
                    defaultValue: provider,
                  }),
                })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-xs">
          {phase === "idle" && (
            <>
              {!bind && (
                <Field>
                  <FieldLabel htmlFor="signin-proxy">{t("signin.proxy")}</FieldLabel>
                  <Input id="signin-proxy" value={proxy} onChange={(event) => setProxy(event.target.value)} />
                </Field>
              )}
              {credential && !bind && (
                <Field orientation="horizontal">
                  <Checkbox id="signin-verify" checked={verify} onCheckedChange={(value) => setVerify(value === true)} />
                  <FieldLabel htmlFor="signin-verify" className="font-normal">
                    {t("signin.verify")}
                  </FieldLabel>
                </Field>
              )}
              <Button onClick={() => setRun((value) => value + 1)}>
                {t("signin.start")}
              </Button>
            </>
          )}
          {phase === "starting" && <p role="status">{t("signin.starting")}</p>}
          {phase === "wait" && session && (
            <>
              {session.user_code && (
                <div className="flex items-center gap-2">
                  <output className="font-mono text-lg">
                    {session.user_code}
                  </output>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        session.user_code ?? ""
                      )
                    }
                  >
                    {t("signin.copyCode")}
                  </Button>
                </div>
              )}
              <a
                className="break-all underline"
                href={session.url}
                target="_blank"
                rel="noreferrer"
              >
                {session.url}
              </a>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    window.open(session.url, "_blank", "noopener,noreferrer")
                  }
                >
                  {t("signin.open")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(session.url)
                  }
                >
                  {t("signin.copyLink")}
                </Button>
              </div>
              {!session.user_code && (
                <div className="space-y-2">
                  <label>
                    {t("signin.callback")}
                    <Input
                      value={callback}
                      onChange={(event) => setCallback(event.target.value)}
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={submitting || !callback.trim()}
                    onClick={() => void submitCallback()}
                  >
                    {t("signin.submitCallback")}
                  </Button>
                </div>
              )}
              <p role="status">{t("signin.waiting")}</p>
            </>
          )}
          {phase === "ok" && <p role="status">{t("signin.success")}</p>}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {phase === "error" && (
            <Button onClick={() => setRun((value) => value + 1)}>
              {t("signin.retry")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t(phase === "ok" ? "signin.close" : "signin.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
