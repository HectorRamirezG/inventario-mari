import { useCallback, useEffect, useState } from "react"

export type Role = "admin" | "cajera"

const STORAGE_KEY = "mari-role"
const PIN_KEY = "mari-pin-hash"

// PIN default si nadie lo ha configurado todavía. Lo puedes cambiar
// desde Configuración → PIN. NO es seguridad real, sólo un freno
// para que no cualquiera vea costos/márgenes. El proyecto está
// pensado para uso interno con RLS abierto en Supabase.
const DEFAULT_ADMIN_PIN = "1234"
const DEFAULT_CAJERA_PIN = "0000"

/**
 * Hash simple — NO criptográfico. Suficiente para que el PIN no se vea
 * en claro en localStorage. No proteges contra ataques reales: si alguien
 * tiene acceso al device, tiene acceso a la app.
 */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(16)
}

interface StoredPins {
  admin?: string
  cajera?: string
}

function loadPins(): Required<StoredPins> {
  if (typeof window === "undefined")
    return { admin: hash(DEFAULT_ADMIN_PIN), cajera: hash(DEFAULT_CAJERA_PIN) }
  try {
    const raw = localStorage.getItem(PIN_KEY)
    const parsed: StoredPins = raw ? JSON.parse(raw) : {}
    return {
      admin: parsed.admin ?? hash(DEFAULT_ADMIN_PIN),
      cajera: parsed.cajera ?? hash(DEFAULT_CAJERA_PIN),
    }
  } catch {
    return { admin: hash(DEFAULT_ADMIN_PIN), cajera: hash(DEFAULT_CAJERA_PIN) }
  }
}

function savePins(pins: Required<StoredPins>) {
  localStorage.setItem(PIN_KEY, JSON.stringify(pins))
}

export function useRole() {
  const [role, setRoleState] = useState<Role | null>(() => {
    if (typeof window === "undefined") return null
    return (sessionStorage.getItem(STORAGE_KEY) as Role) ?? null
  })

  // Persistimos en sessionStorage (no localStorage) — al cerrar el navegador
  // se pierde la sesión, hay que volver a teclear el PIN.
  useEffect(() => {
    if (role) sessionStorage.setItem(STORAGE_KEY, role)
    else sessionStorage.removeItem(STORAGE_KEY)
  }, [role])

  const login = useCallback((pin: string): Role | null => {
    const pins = loadPins()
    const h = hash(pin)
    if (h === pins.admin) {
      setRoleState("admin")
      return "admin"
    }
    if (h === pins.cajera) {
      setRoleState("cajera")
      return "cajera"
    }
    return null
  }, [])

  const logout = useCallback(() => setRoleState(null), [])

  const changePin = useCallback(
    (which: Role, newPin: string) => {
      if (role !== "admin") throw new Error("Sólo admin puede cambiar PINs")
      if (!/^\d{4,8}$/.test(newPin))
        throw new Error("El PIN debe tener 4 a 8 dígitos")
      const pins = loadPins()
      pins[which] = hash(newPin)
      savePins(pins)
    },
    [role]
  )

  const isAdmin = role === "admin"
  const isCajera = role === "cajera"
  const isAuthenticated = role !== null

  return { role, isAdmin, isCajera, isAuthenticated, login, logout, changePin }
}
