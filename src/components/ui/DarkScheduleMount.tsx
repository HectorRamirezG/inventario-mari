import { useEffect } from "react"
import { useUserPrefs, isWithinTimeRange } from "../../lib/userPrefs"
import { useBusinessRules } from "../../features/settings/businessRulesService"

/**
 * Aplica el modo oscuro automáticamente cuando `prefs.darkSchedule` está ON
 * y la hora actual cae dentro del rango `prefs.darkStart → prefs.darkEnd`.
 * Soporta wrap-around (22:00 → 07:00 cruza medianoche).
 *
 * Reglas de precedencia:
 *  1. Si la tienda forzó modo (rules.force_dark_mode / force_light_mode),
 *     ese gana y este mount no toca nada.
 *  2. Si darkSchedule está OFF, este mount no toca nada (la preferencia
 *     manual del usuario gana).
 *  3. Si darkSchedule está ON, sobrescribe `mari-theme` en localStorage
 *     y refresca cada 60s para detectar transiciones.
 *
 * Side effect: modifica `localStorage.mari-theme` y dispara un evento
 * storage para que `useTheme` lo lea. El cambio es transparente.
 */
export default function DarkScheduleMount() {
  const { prefs } = useUserPrefs()
  const rules = useBusinessRules()

  useEffect(() => {
    if (!prefs.darkSchedule) return
    if (rules.force_dark_mode || rules.force_light_mode) return

    const apply = () => {
      const dark = isWithinTimeRange(new Date(), prefs.darkStart, prefs.darkEnd)
      const target = dark ? "dark" : "light"
      // Solo escribimos si cambia, para no re-disparar useTheme en loop.
      const current = localStorage.getItem("mari-theme")
      if (current !== target) {
        localStorage.setItem("mari-theme", target)
        // Aplica directo al DOM sin esperar al hook (más responsive).
        document.documentElement.dataset.theme = target
        document.documentElement.style.colorScheme = target
        if (target === "dark") document.documentElement.classList.add("dark")
        else document.documentElement.classList.remove("dark")
        // Dispara evento custom para que componentes que escuchen reaccionen.
        window.dispatchEvent(new Event("storage"))
      }
    }

    apply()
    // Revisar cada 60s — sufficient para captar el cambio de hora.
    const id = window.setInterval(apply, 60_000)
    return () => window.clearInterval(id)
  }, [
    prefs.darkSchedule,
    prefs.darkStart,
    prefs.darkEnd,
    rules.force_dark_mode,
    rules.force_light_mode,
  ])

  return null
}
