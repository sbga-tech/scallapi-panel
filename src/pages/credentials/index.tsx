import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { queryKeys, useApiKeyFamilies, useCredentials } from "@/lib/queries"
import type { Credential } from "@/lib/schemas"
import { CredentialDetailsDialog } from "@/pages/credentials/details/credential-details-dialog"
import { CredentialModelsDialog } from "@/pages/credentials/details/credential-models-dialog"
import { OAuthTab, type OpenHandlers } from "@/pages/credentials/oauth-tab"
import { ProvidersTab } from "@/pages/credentials/providers-tab"
import { AddCredentialMenu } from "@/pages/credentials/sign-in/add-credential-menu"
import { SignInDialog } from "@/pages/credentials/sign-in/sign-in-dialog"
import { SiwcBindDialog } from "@/pages/credentials/sign-in/siwc-dialog"

const tabs = ["oauth", "providers"] as const
type Tab = (typeof tabs)[number]

export function CredentialsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams()
  const tab: Tab = tabs.find((candidate) => candidate === params.tab) ?? "oauth"
  const credentials = useCredentials()
  const families = useApiKeyFamilies()
  const groupCount = Object.values(families.data?.data ?? {}).reduce((sum, groups) => sum + groups.length, 0)
  const [details, setDetails] = useState<Credential | null>(null)
  const [models, setModels] = useState<Credential | null>(null)
  const [signIn, setSignIn] = useState<Credential | null>(null)
  const [siwc, setSiwc] = useState<Credential | null>(null)

  const open: OpenHandlers = { onOpenDetails: setDetails, onOpenModels: setModels, onSignIn: setSignIn, onBindSiwc: setSiwc }

  return (
    <>
      <PageHeader
        title={t("nav.credentials")}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("common.reload")}
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.credentials })
                void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys })
              }}
            >
              <RefreshCw className={credentials.isFetching || families.isFetching ? "animate-spin" : undefined} />
            </Button>
            <AddCredentialMenu />
          </>
        }
      />
      <Tabs value={tab} onValueChange={(value) => navigate(`/upstreams/${value}`)} className="flex flex-1 flex-col gap-0">
        <div className="border-b px-4 md:px-6">
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="oauth">
              {t("credentials.tabs.oauth")}
              <span className="text-muted-foreground tabular-nums">{credentials.data?.length ?? ""}</span>
            </TabsTrigger>
            <TabsTrigger value="providers">
              {t("credentials.tabs.providers")}
              <span className="text-muted-foreground tabular-nums">{families.data ? groupCount : ""}</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="oauth" className="p-4 md:p-6">
          <OAuthTab query={credentials} open={open} />
        </TabsContent>
        <TabsContent value="providers" className="p-4 md:p-6">
          <ProvidersTab query={families} />
        </TabsContent>
      </Tabs>
      <CredentialDetailsDialog credential={details} open={details !== null} onOpenChange={(value) => !value && setDetails(null)} />
      <CredentialModelsDialog credential={models} open={models !== null} onOpenChange={(value) => !value && setModels(null)} />
      {signIn && (
        <SignInDialog
          open
          onOpenChange={(value) => !value && setSignIn(null)}
          provider={signIn.provider}
          credential={{ name: signIn.name, authIndex: signIn.auth_index }}
        />
      )}
      {siwc && (
        <SiwcBindDialog
          open
          onOpenChange={(value) => !value && setSiwc(null)}
          credential={{ name: siwc.name, authIndex: siwc.auth_index }}
        />
      )}
    </>
  )
}
