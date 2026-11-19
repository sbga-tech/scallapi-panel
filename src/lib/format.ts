export function formatBytes(bytes: number | undefined) {
  if (bytes === undefined) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${rest}s`
  return `${rest}s`
}

export function formatRelative(iso: string | undefined, language: string, now = Date.now()) {
  if (!iso) return "—"
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return "—"
  const diff = (time - now) / 1000
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ]
  for (const [unit, size] of steps) if (Math.abs(diff) >= size) return format.format(Math.round(diff / size), unit)
  return format.format(Math.round(diff), "second")
}
