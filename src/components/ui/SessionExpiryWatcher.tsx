import { useEffect, useRef } from "react"
import toast from "react-hot-toast"
import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

/**
 * Detecta cuando la sesión del usuario expira silenciosamente (el
 * refresh token caducó) y muestra un toast amable + redirige al login.
 *
 * Cómo funciona: Supabase intenta refrescar el token automáticamente
 * cada vez que está cerca de expirar. Si el refresh falla (porque el
 * refresh_token también caducó o fue revocado), dispara `SIGNED_OUT`.
 * Aquí escuchamos ese evento — si el usuario TENÍA sesión activa,
 * asumimos que fue una expiración y se lo decimos.
 *
 * También cubrimos el caso de error 401/403 cuando se hace una query
 * con un JWT vencido — disparamos un evento custom que cualquier
 * service puede emitir, y este watcher lo captura.
 */
export default function SessionExpiryWatcher() {
  // Track si había sesión antes para distinguir "sign out manual" vs
  // "sesión expirada".
  const hadSessionRef = useRef(false)
  const notifiedRef = useRef(false)

  useEffect(() => {
    // Hidrata estado inicial.
    supabase.auth.getSession().then(({ data }) => {
      hadSessionRef.current = !!data.session
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && hadSessionRef.current && !notifiedRef.current) {
        // Fue una expiración (no sign-out voluntario). Avisamos.
        // Sign-out voluntario también dispara SIGNED_OUT — para no
        // confundir, exponemos `window.__mariSigningOutVoluntary` que
        // el código que llama `signOut()` puede prender antes de
        // ejecutar el sign-out.
        const isVoluntary =
          (window as any).__mariSigningOutVoluntary === true
        if (!isVoluntary) {
          notifiedRef.current = true
          toast(
            "Tu sesión expiró. Vuelve a iniciar sesión.",
            { icon: "⏰", duration: 4500 },
          )
          // Mover a login después de mostrar el toast (no inmediato
          // para que el cliente alcance a leerlo).
          window.setTimeout(() => {
            try {
              window.location.assign("/login")
            } catch {
              /* noop */
            }
          }, 800)
        }
      }
      if (event === "SIGNED_IN") {
        hadSessionRef.current = true
        notifiedRef.current = false
      }
      if (event === "TOKEN_REFRESHED") {
        // OK — el refresh funcionó. Mantenemos hadSession=true.
        hadSessionRef.current = !!session
      }
      if (event === "SIGNED_OUT") {
        hadSessionRef.current = false
      }
    })

    // Escucha evento custom que cualquier service puede disparar al
    // ver un error 401 en una llamada (ejemplo: catch en un .rpc()).
    // Útil cuando supabase no logra detectar la expiración por sí mismo.
    const onForcedExpire = () => {
      if (notifiedRef.current) return
      notifiedRef.current = true
      toast("Tu sesión expiró. Vuelve a iniciar sesión.", {
        icon: "⏰",
        duration: 4500,
      })
      ;(async () => {
        try {
          ;(window as any).__mariSigningOutVoluntary = true
          await supabase.auth.signOut()
        } catch (e: any) {
          debug.warn("[session-expiry] signOut failed:", e?.message)
        } finally {
          window.setTimeout(() => {
            ;(window as any).__mariSigningOutVoluntary = false
            window.location.assign("/login")
          }, 800)
        }
      })()
    }
    window.addEventListener("mari:session-expired", onForcedExpire)
    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener("mari:session-expired", onForcedExpire)
    }
  }, [])

  return null
}
