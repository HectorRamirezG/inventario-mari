import { supabase } from "../../lib/supabase"

/**
 * Cliente solicita extender el plazo del apartado. No modifica fechas
 * en la BD (no existe apartado_due_date); en su lugar crea una
 * notificación accionable para Mari con metadata para que ella
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

  const link = `/admin?sale=${opts.saleId}`
  const metadata = {
    sale_id: opts.saleId,
    type: "layaway_extension_request",
    days_requested: opts.daysRequested,
    reason: opts.reason ?? null,
  }

  const payload = {
    recipient_role: "admin" as const,
    type: "layaway_extension",
    title,
    body,
    link,
    metadata,
  }

  const { error } = await supabase.from("notifications").insert(payload)
  if (error) throw new Error(error.message)
}
