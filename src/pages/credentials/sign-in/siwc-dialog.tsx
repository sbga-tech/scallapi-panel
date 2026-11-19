import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useCredentials } from "@/lib/queries"
import { LoginDialog, type SignInCredential } from "@/pages/credentials/sign-in/sign-in-dialog"

export function SiwcBindDialog({
  open,
  onOpenChange,
  credential,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  credential?: SignInCredential
}) {
  const { t } = useTranslation()
  const query = useCredentials()
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<SignInCredential | undefined>()
  if (credential || selected)
    return (
      <LoginDialog
        open={open}
        onOpenChange={(value) => {
          if (!value) setSelected(undefined)
          onOpenChange(value)
        }}
        provider="codex"
        credential={credential ?? selected}
        bind
      />
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("signin.bind")}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="siwc-credential">{t("signin.credential")}</FieldLabel>
          <NativeSelect id="siwc-credential" value={name} onChange={(event) => setName(event.target.value)}>
            <NativeSelectOption value="">{t("signin.chooseCredential")}</NativeSelectOption>
            {query.data
              ?.filter((item) => item.provider === "codex" && item.siwc_bind_supported && !item.runtime_only)
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
              .map((item) => (
                <NativeSelectOption key={item.name} value={item.name}>
                  {item.email ?? item.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        {query.error && (
          <Alert variant="destructive">
            <AlertDescription>{query.error.message}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button disabled={!name} onClick={() => setSelected({ name })}>
            {t("signin.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
