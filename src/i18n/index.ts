import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "@/i18n/en.json"
import zh from "@/i18n/zh.json"

export const languages = [
  { code: "zh", label: "简体中文" },
  { code: "en", label: "English" },
] as const

const languageKey = "scallapi-panel.language"
const stored = localStorage.getItem(languageKey)
const initial = stored ?? (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en")

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
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
