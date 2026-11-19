import antigravity from "@/assets/providers/antigravity.svg"
import claude from "@/assets/providers/claude.svg"
import codex from "@/assets/providers/codex.svg"
import deepseek from "@/assets/providers/deepseek.svg"
import devinDark from "@/assets/providers/devin-dark.svg"
import devin from "@/assets/providers/devin.svg"
import gemini from "@/assets/providers/gemini.svg"
import glm from "@/assets/providers/glm.svg"
import grokDark from "@/assets/providers/grok-dark.svg"
import grok from "@/assets/providers/grok.svg"
import iflow from "@/assets/providers/iflow.svg"
import kimiDark from "@/assets/providers/kimi-dark.svg"
import kimiLight from "@/assets/providers/kimi-light.svg"
import meta from "@/assets/providers/meta.svg"
import minimax from "@/assets/providers/minimax.svg"
import openaiDark from "@/assets/providers/openai-dark.svg"
import openaiLight from "@/assets/providers/openai-light.svg"
import qwen from "@/assets/providers/qwen.svg"
import vertex from "@/assets/providers/vertex.svg"
import { cn } from "@/lib/utils"

type Logo = string | { light: string; dark: string }

const logos: Record<string, Logo> = {
  antigravity,
  aistudio: gemini,
  claude,
  codex,
  deepseek,
  devin: { light: devin, dark: devinDark },
  gemini,
  "gemini-interactions": gemini,
  interactions: gemini,
  glm,
  iflow,
  kimi: { light: kimiDark, dark: kimiLight },
  meta,
  minimax,
  "openai-compatibility": { light: openaiLight, dark: openaiDark },
  openai: { light: openaiLight, dark: openaiDark },
  qwen,
  vertex,
  xai: { light: grok, dark: grokDark },
}

export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const logo = logos[provider.toLowerCase()]
  const box = cn("flex size-8 shrink-0 items-center justify-center rounded-md border bg-background", className)
  if (!logo)
    return (
      <span className={cn(box, "text-xs font-medium text-muted-foreground uppercase")} aria-hidden>
        {provider.slice(0, 1)}
      </span>
    )
  if (typeof logo === "string")
    return (
      <span className={box} aria-hidden>
        <img src={logo} alt="" className="size-4.5" />
      </span>
    )
  return (
    <span className={box} aria-hidden>
      <img src={logo.light} alt="" className="size-4.5 dark:hidden" />
      <img src={logo.dark} alt="" className="hidden size-4.5 dark:block" />
    </span>
  )
}
