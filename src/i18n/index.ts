import i18n from "i18next"
import { initReactI18next } from "react-i18next"

export const languages = [
  { code: "zh", label: "简体中文" },
  { code: "en", label: "English" },
] as const

const files = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*/*.json", { eager: true })

const resources: Record<string, { translation: Record<string, unknown> }> = {}
for (const [path, module] of Object.entries(files)) {
  const [, language, section] = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/) ?? []
  resources[language] ??= { translation: {} }
  resources[language].translation[section] = module.default
}

const languageKey = "scallapi-panel.language"
const initial = localStorage.getItem(languageKey) ?? (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en")

void i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

i18n.on("languageChanged", (code) => {
  localStorage.setItem(languageKey, code)
  document.documentElement.lang = code === "zh" ? "zh-CN" : "en"
})
document.documentElement.lang = initial === "zh" ? "zh-CN" : "en"

export default i18n
