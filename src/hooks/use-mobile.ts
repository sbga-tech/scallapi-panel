import { useSyncExternalStore } from "react"

const mobileQuery = window.matchMedia("(max-width: 767px)")

function subscribe(onChange: () => void) {
  mobileQuery.addEventListener("change", onChange)
  return () => mobileQuery.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => mobileQuery.matches)
}
