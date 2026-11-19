import { RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router"
import { useQueryClient } from "@tanstack/react-query"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { queryKeys, useApiKeyFamilies, useCredentials } from "@/lib/queries"
import { OAuthTab } from "@/pages/credentials/oauth-tab"
import { ProvidersTab } from "@/pages/credentials/providers-tab"

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

  return (
    <>
      <PageHeader
        title={t("nav.credentials")}
        actions={
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
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => navigate(`/credentials/${value}`)}
        className="flex flex-1 flex-col gap-4 p-4 md:p-6"
      >
        <TabsList>
          <TabsTrigger value="oauth">
            {t("credentials.tabs.oauth")}
            <span className="text-muted-foreground tabular-nums">{credentials.data?.length ?? ""}</span>
          </TabsTrigger>
          <TabsTrigger value="providers">
            {t("credentials.tabs.providers")}
            <span className="text-muted-foreground tabular-nums">{families.data ? groupCount : ""}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="oauth">
          <OAuthTab query={credentials} />
        </TabsContent>
        <TabsContent value="providers">
          <ProvidersTab query={families} />
        </TabsContent>
      </Tabs>
    </>
  )
}
