import { useEffect, useState, useCallback } from "react"

export type Theme = "light" | "dark" | "system"

const STORAGE_KEY = "mari-theme"

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function applyTheme(theme: Theme) {
  const effective = theme === "system" ? getSystemTheme() : theme
  document.documentElement.dataset.theme = effective
  document.documentElement.style.colorScheme = effective
  // Refresca <meta name="theme-color"> para barra del navegador móvil
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute(
      "content",
      effective === "dark" ? "#0f172a" : "#e6007e"
    )
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system"
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? "system"
  })

  // Aplica el tema al cargar
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Si está en 'system', escucha cambios del SO
  useEffect(() => {
    if (theme !== "system") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  const effective: "light" | "dark" =
    theme === "system" ? getSystemTheme() : theme

  return { theme, effective, setTheme, toggle }
}
