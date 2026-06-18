import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"
import {
  notifyAdmins,
  notifyClient,
} from "../notifications/notificationsService"
import { formatMoney } from "../../lib/format"

export type ProofStatus = "pending" | "pending_verification" | "approved" | "rejected"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function assertSaleId(saleId: unknown): asserts saleId is string {
  if (typeof saleId !== "string" || !UUID_RE.test(saleId)) {
    throw new Error("Venta no identificada (sale_id inválido)")
  }
}

export interface PaymentProof {
  id: string
  sale_id: string
  customer_email: string | null
  image_url: string | null
  amount: number | null
  method: string | null
  reference: string | null
  note: string | null
  status: ProofStatus
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

/**
 * Sube la imagen al bucket `product-images/proofs/` y crea la fila
 * en `payment_proofs`. El trigger en DB notifica a los admins.
 *
 * Cuando `file` es null (caso EFECTIVO), crea el proof sin imagen.
 */
export async function uploadPaymentProof(input: {
  saleId: string
  file: File | null
  amount?: number | null
  method?: string | null
  customerEmail?: string | null
  note?: string | null
}): Promise<PaymentProof> {
  assertSaleId(input.saleId)
  let publicUrl: string | null = null

  if (input.file) {
    if (!input.file.type.startsWith("image/")) {
      throw new Error("Sólo imágenes")
    }
    if (input.file.size > 5 * 1024 * 1024) {
      throw new Error("La foto pesa más de 5MB")
    }

    const ext = input.file.name.split(".").pop()?.toLowerCase() || "jpg"
    const path = `proofs/${input.saleId}/${crypto.randomUUID()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, input.file, { cacheControl: "31536000", upsert: false })
    if (upErr) throw upErr

    const {
      data: { publicUrl: u },
    } = supabase.storage.from("product-images").getPublicUrl(path)
    publicUrl = u
  }

  // En efectivo NO hay imagen; el status va 'pending_verification' para
  // que el admin sepa que debe validar fisicamente el dinero. La columna
  // image_url debe ser NULLABLE en la BD (fix_payments_and_notifications.sql).
  const isCash = !input.file
  const payload: Record<string, any> = {
    sale_id: input.saleId,
    image_url: publicUrl,
    amount: input.amount ?? null,
    method: input.method ?? (isCash ? "efectivo" : "transferencia"),
    customer_email: input.customerEmail ?? null,
    note: input.note ?? null,
    status: isCash ? "pending_verification" : "pending",
  }

  let { data, error } = await supabase
    .from("payment_proofs")
    .insert(payload)
    .select()
    .single()

  // Fallback: si la BD aún no permite 'pending_verification' (constraint
  // viejo), reintentamos con 'pending' para no romper el flujo del cliente.
  if (
    error &&
    /violates check constraint|invalid input value for enum|status_check/i.test(
      error.message
    )
  ) {
    payload.status = "pending"
    const retry = await supabase
      .from("payment_proofs")
      .insert(payload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  // Fallback duro: si image_url sigue NOT NULL pegamos un placeholder para
  // que el flujo no truene. El admin sabrá que es efectivo por el method.
  if (
    error &&
    isCash &&
    /null value in column "image_url"|not-null constraint/i.test(error.message)
  ) {
    payload.image_url = "cash://no-image"
    const retry = await supabase
      .from("payment_proofs")
      .insert(payload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) throw error
  const proof = data as PaymentProof

  // Notifica a admins. Esto se hace DESDE el cliente con su sesión anon;
  // si la RLS no permite el INSERT, sólo dejamos un warning.
  // Recuperamos el nombre del cliente desde la venta para que la notif
  // sea legible para Mari.
  try {
    const { data: sale } = await supabase
      .from("sales")
      .select("customer_name,customer_email")
      .eq("id", input.saleId)
      .maybeSingle()
    const who = (sale as any)?.customer_name ?? input.customerEmail ?? "Cliente"
    const amountTxt = input.amount ? ` por ${formatMoney(input.amount)}` : ""
    const methodTxt = isCash ? "EFECTIVO (verificar físicamente)" : (input.method ?? "transferencia")
    await notifyAdmins({
      type: "payment_proof",
      title: `${who} envió un comprobante${amountTxt}`,
      body: `Método: ${methodTxt}. Revisa y aprueba en Apartados.`,
      link: "/admin",
      metadata: {
        proof_id: proof.id,
        sale_id: input.saleId,
        amount: input.amount,
        method: input.method,
        is_cash: isCash,
        customer_email: input.customerEmail,
      },
    })
  } catch (e: any) {
    debug.warn("[proofs] notify admins falló:", e?.message)
  }

  return proof
}

export async function getProofById(id: string): Promise<PaymentProof | null> {
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    debug.warn("[proofs] get error:", error.message)
    return null
  }
  return (data as PaymentProof) ?? null
}

export async function listProofsForSale(saleId: string): Promise<PaymentProof[]> {
  if (typeof saleId !== "string" || !UUID_RE.test(saleId)) return []
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("*")
    .eq("sale_id", saleId)
    .order("created_at", { ascending: false })
  if (error) {
    debug.warn("[proofs] list error:", error.message)
    return []
  }
  return (data as PaymentProof[]) ?? []
}

export async function approveProof(
  proofId: string,
  amount: number,
  method: string = "transferencia"
): Promise<void> {
  // Leemos el proof primero para tener el email del cliente y el sale_id
  // antes de que la RPC lo modifique.
  const prev = await getProofById(proofId)

  const { error } = await supabase.rpc("approve_payment_proof", {
    p_proof_id: proofId,
    p_amount: amount,
    p_method: method,
  })
  if (error) throw error

  if (prev?.customer_email) {
    // Recuperamos el token público para deep-link al ticket.
    let publicToken: string | null = null
    try {
      const { data: s } = await supabase
        .from("sales")
        .select("public_token")
        .eq("id", prev.sale_id)
        .maybeSingle()
      publicToken = (s as any)?.public_token ?? null
    } catch {
      /* silencio */
    }
    await notifyClient(prev.customer_email, {
      type: "payment_approved",
      title: `Pago de ${formatMoney(amount)} aprobado`,
      body: "Tu comprobante quedó validado. ¡Gracias por tu pago!",
      link: publicToken ? `/ticket/${publicToken}` : null,
      metadata: { proof_id: proofId, sale_id: prev.sale_id, amount, method },
    })
  }
}

export async function rejectProof(proofId: string, reason?: string): Promise<void> {
  const prev = await getProofById(proofId)

  const { error } = await supabase.rpc("reject_payment_proof", {
    p_proof_id: proofId,
    p_reason: reason ?? null,
  })
  if (error) throw error

  if (prev?.customer_email) {
    let publicToken: string | null = null
    try {
      const { data: s } = await supabase
        .from("sales")
        .select("public_token")
        .eq("id", prev.sale_id)
        .maybeSingle()
      publicToken = (s as any)?.public_token ?? null
    } catch {
      /* silencio */
    }
    await notifyClient(prev.customer_email, {
      type: "payment_rejected",
      title: "Comprobante rechazado",
      body: reason
        ? `Motivo: ${reason}. Por favor envía uno nuevo.`
        : "Revisa los datos y envía un nuevo comprobante.",
      link: publicToken ? `/ticket/${publicToken}` : null,
      metadata: { proof_id: proofId, sale_id: prev.sale_id, reason: reason ?? null },
    })
  }
}
