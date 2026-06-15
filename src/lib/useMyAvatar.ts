import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../lib/useAuth"

/**
 * Devuelve la URL del avatar del usuario logueado. Se mantiene en cache
 * local y se actualiza cuando el evento `mari:profile-updated` se dispara
 * (desde UserProfileDrawer al guardar).
 */
export function useMyAvatar(): string | null {
  const { user } = useAuth()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) {
      setUrl(null)
      return
    }
    let alive = true
    const load = async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle()
      if (!alive) return
      setUrl((data as any)?.avatar_url ?? null)
    }
    load()

    const onUpdated = () => load()
    window.addEventListener("mari:profile-updated", onUpdated)
    return () => {
      alive = false
      window.removeEventListener("mari:profile-updated", onUpdated)
    }
  }, [user?.id])

  return url
}
