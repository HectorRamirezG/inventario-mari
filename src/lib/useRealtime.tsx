import { useEffect } from "react"
import toast from "react-hot-toast"
import { supabase } from "./supabase"
import { sound } from "./sound"
import { isStaffOrAdmin, useAuth } from "./useAuth"

/**
 * Suscripción global a eventos de Supabase realtime. Solo admin/staff
 * recibe notificaciones (un cliente no necesita saber de otros).
 *
 * Eventos cubiertos:
 *  - INSERT en `sales` con `is_layaway=true`  → nuevo apartado
 *  - UPDATE en `sales` con `status=paid`      → pago completado
 *
 * Reproduce un sonido suave + toast con CTA para abrir el item.
 *
 * Para que esto funcione la tabla `sales` debe estar en la publicación
 * realtime (`alter publication supabase_realtime add table sales`),
 * ya incluido en la migración 0008.
 */
export function useRealtimeNotifications() {
  const { role, session } = useAuth()
  const enabled = !!session && isStaffOrAdmin(role)

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel("mari-sales-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sales" },
        (payload) => {
          const row: any = payload.new
          if (!row) return

          // Toast distinto si fue apartado vs venta normal
          const isLayaway = row.is_layaway === true
          const customer = row.customer_name ?? "Cliente nuevo"
          const total = Number(row.total) || 0
          const fmt = total.toLocaleString("es-MX", {
            style: "currency",
            currency: "MXN",
          })

          if (isLayaway) {
            sound.play("notify")
            window.dispatchEvent(new CustomEvent("mari:apartado-new"))
            toast(
              (t) => (
                <div className="flex items-center gap-3">
                  <span className="text-lg">🛍️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-600">
                      Nuevo apartado
                    </p>
                    <p className="text-sm font-bold truncate">{customer}</p>
                    <p className="text-[10px] text-slate-500">{fmt}</p>
                  </div>
                  <button
                    onClick={() => {
                      toast.dismiss(t.id)
                      window.dispatchEvent(
                        new CustomEvent("app:navigate", {
                          detail: { tab: "apartados" },
                        })
                      )
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-primary px-3 py-1.5 bg-primary/10 rounded-full"
                  >
                    Ver
                  </button>
                </div>
              ),
              { duration: 7000 }
            )
          } else {
            sound.play("success")
            toast.success(`Venta nueva · ${customer} · ${fmt}`, {
              duration: 4000,
            })
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sales" },
        (payload) => {
          const before: any = payload.old
          const after: any = payload.new
          if (!before || !after) return
          // Solo notifica si el status PASÓ a paid (no si ya estaba)
          if (before.status !== "paid" && after.status === "paid") {
            sound.play("success")
            toast.success(
              `✅ Apartado pagado · ${after.customer_name ?? "Cliente"}`,
              { duration: 4500 }
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled])
}

/**
 * Pequeño hook auxiliar para que cualquier componente reciba el evento
 * `mari:apartado-new` y mantenga un contador local. El badge en sí lo
 * dibuja el shell.
 */
export function useApartadoBadge() {
  // Implementación intencionalmente delegada: el shell maneja su propio
  // estado local escuchando el evento dispatched por `useRealtimeNotifications`.
  return null
}

