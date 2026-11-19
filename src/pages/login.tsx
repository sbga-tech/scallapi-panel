import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Navigate, useLocation, useNavigate } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, normalizeBase } from "@/lib/api"
import { useSession } from "@/lib/session"

export function LoginPage() {
  const { t } = useTranslation()
  const { connection, signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [base, setBase] = useState(() => normalizeBase(window.location.origin))
  const [key, setKey] = useState("")
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (connection) return <Navigate to="/upstreams" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await signIn({ base, key }, remember)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== "/login" ? from : "/upstreams", { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) setError(t("login.badKey"))
      else if (caught instanceof ApiError && caught.status === 404) setError(t("login.notScallapi"))
      else setError(t("login.unreachable", { base }))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="base">{t("login.server")}</FieldLabel>
                <Input id="base" value={base} onChange={(event) => setBase(event.target.value)} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="key">{t("login.key")}</FieldLabel>
                <Input
                  id="key"
                  type="password"
                  autoComplete="current-password"
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="remember" checked={remember} onCheckedChange={(value) => setRemember(value === true)} />
                <FieldLabel htmlFor="remember" className="font-normal">
                  {t("login.remember")}
                </FieldLabel>
              </Field>
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>{t("login.failed")}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={pending} className="w-full">
                {pending && <Spinner />}
                {t("login.submit")}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
