import { useState } from "react"
import type { z } from "zod"

export function useStoredState<T>(key: string, schema: z.ZodType<T>, fallback: T) {
  const storageKey = `scallapi-panel.${key}`
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return fallback
    try {
      const parsed = schema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : fallback
    } catch {
      return fallback
    }
  })
  function update(next: T) {
    localStorage.setItem(storageKey, JSON.stringify(next))
    setValue(next)
  }
  return [value, update] as const
}
