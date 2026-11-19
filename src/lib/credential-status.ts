import type { Credential } from "@/lib/schemas"

export type CredentialState = "active" | "disabled" | "signIn" | "refreshFailed" | "cooling" | "unknown" | "unavailable"

export const stateTone: Record<CredentialState, string> = {
  active: "bg-emerald-500",
  disabled: "bg-muted-foreground/40",
  signIn: "bg-destructive",
  refreshFailed: "bg-destructive",
  cooling: "bg-amber-500",
  unknown: "bg-amber-500",
  unavailable: "bg-amber-500",
}

export function credentialProblem(credential: Credential): CredentialState | null {
  if (credential.next_action === "sign_in") return "signIn"
  if (credential.refresh_error) return "refreshFailed"
  if (credential.cooldowns === null) return "unknown"
  if (credential.cooldowns.length > 0) return "cooling"
  return null
}

export function credentialState(credential: Credential): CredentialState {
  if (credential.disabled) return "disabled"
  return credentialProblem(credential) ?? (credential.unavailable ? "unavailable" : "active")
}

export function credentialIdentity(credential: Credential) {
  return credential.email ?? credential.label ?? credential.account ?? credential.name
}

export type StatusDetail = { key: string } | { raw: string }

const detailPatterns: [RegExp, string][] = [
  [/^disabled( via management api)?$/, ""],
  [/invalid_grant|refresh token (invalid|not found)|unauthorized|token_expired|token expired|sign_in/, "signInExpired"],
  [/credential_quota|quota|exhausted/, "quota"],
  [/rate[ _]?limit/, "rateLimited"],
  [/cloudflare/, "cloudflare"],
  [/tos_violation|terms/, "suspended"],
  [/payment_required|payment required/, "payment"],
  [/forbidden/, "forbidden"],
  [/transient|upstream 5\d\d|cooling_5\d\d|stream disconnected/, "transient"],
  [/model disabled|model_not_supported/, "model"],
]

export function statusDetail(credential: Credential): StatusDetail | null {
  const sources = [credential.refresh_error?.code, credential.refresh_error?.message, credential.status_message, credential.status]
  for (const source of sources) {
    const text = source?.trim().toLowerCase()
    if (!text) continue
    const match = detailPatterns.find(([pattern]) => pattern.test(text))
    if (match) return match[1] ? { key: match[1] } : null
  }
  const raw = credential.refresh_error?.message ?? credential.status_message
  return raw && raw !== credential.status ? { raw } : null
}
