import { supabase } from "../../lib/supabase"
import { notifyAdmins } from "../notifications/notificationsService"

/**
 * Cliente solicita extender el plazo del apartado. No modifica fechas
 * en la BD (no existe apartado_due_date); en su lugar crea una
 * notificación accionable para con metadata para que ella
 * decida aceptar/rechazar manualmente.
 */
export async function requestLayawayExtension(opts: {
  saleId: string
  customerName: string | null
  customerEmail: string | null
  daysRequested: number
  reason?: string | null
}): Promise<void> {
  const title = `Solicitud de ${opts.daysRequested} días extra`
  const body = [
    `Cliente: ${opts.customerName ?? "Sin nombre"}`,
    opts.customerEmail ? `Email: ${opts.customerEmail}` : "",
    opts.reason ? `Motivo: ${opts.reason}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  await notifyAdmins({
    type: "layaway_extension",
    title,
    body,
    link: `/admin?sale=${opts.saleId}`,
    metadata: {
      sale_id: opts.saleId,
      type: "layaway_extension_request",
      days_requested: opts.daysRequested,
      reason: opts.reason ?? null,
    },
  })

  // El parámetro `supabase` queda importado por si se requiere ampliar
  // el endpoint a una RPC más adelante (audit log, etc.). Por ahora la
  // notificación centralizada es suficiente.
  void supabase
}
