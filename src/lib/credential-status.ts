import type { Credential } from "@/lib/schemas"

export type CredentialState = "active" | "disabled" | "signIn" | "refreshFailed" | "cooling" | "unavailable"

export const stateTone: Record<CredentialState, string> = {
  active: "bg-emerald-500",
  disabled: "bg-muted-foreground/40",
  signIn: "bg-destructive",
  refreshFailed: "bg-destructive",
  cooling: "bg-amber-500",
  unavailable: "bg-amber-500",
}

export function credentialProblem(credential: Credential): CredentialState | null {
  if (credential.next_action === "sign_in") return "signIn"
  if (credential.refresh_error) return "refreshFailed"
  if (credential.cooldowns.length > 0) return "cooling"
  return null
}

export function credentialState(credential: Credential): CredentialState {
  if (credential.disabled) return "disabled"
  return credentialProblem(credential) ?? (credential.unavailable ? "unavailable" : "active")
}
