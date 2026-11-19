import type { ApiKeyFamilies, Credential, RouteConfig } from "@/lib/schemas"

export type RouteCandidate = {
  id: string
  selector: string | null
  kind: "oauth" | "apiKey"
  provider: string
  title: string
  detail: string
  keyCount: number
}

export type CandidateState = "serving" | "providerExcluded" | "notSelected" | "unnamed"

export function routeCandidates(credentials: Credential[], families: ApiKeyFamilies): RouteCandidate[] {
  const oauth = credentials.map<RouteCandidate>((credential) => ({
    id: `oauth:${credential.name}`,
    selector: credential.name,
    kind: "oauth",
    provider: credential.provider.toLowerCase(),
    title: credential.email ?? credential.label ?? credential.name,
    detail: credential.name,
    keyCount: 1,
  }))
  const keys = Object.entries(families).flatMap(([family, groups]) =>
    groups.map<RouteCandidate>((group, index) => ({
      id: `key:${family}:${index}`,
      selector: group.name || null,
      kind: "apiKey",
      provider: family === "openai-compatibility" ? group.name.toLowerCase() : family,
      title: group.name || `${family} #${index + 1}`,
      detail: family,
      keyCount: group.keys.length,
    }))
  )
  return [...oauth, ...keys]
}

export function candidateState(route: Pick<RouteConfig, "providers" | "credentials">, candidate: RouteCandidate): CandidateState {
  if (route.providers.length > 0 && !route.providers.includes(candidate.provider)) return "providerExcluded"
  if (route.credentials.length === 0) return "serving"
  if (candidate.selector === null) return "unnamed"
  return route.credentials.includes(candidate.selector) ? "serving" : "notSelected"
}
