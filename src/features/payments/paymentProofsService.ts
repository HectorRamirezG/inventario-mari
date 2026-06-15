import { supabase } from "../../lib/supabase"

export type ProofStatus = "pending" | "approved" | "rejected"

export interface PaymentProof {
  id: string
  sale_id: string
  customer_email: string | null
  image_url: string
  amount: number | null
  method: string | null
  reference: string | null
  note: string | null
  status: ProofStatus
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

/**
 * Sube la imagen al bucket `product-images/proofs/` y crea la fila
 * en `payment_proofs`. El trigger en DB notifica a los admins.
 */
export async function uploadPaymentProof(input: {
  saleId: string
  file: File
  amount?: number | null
  method?: string | null
  customerEmail?: string | null
  note?: string | null
}): Promise<PaymentProof> {
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
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path)

  const { data, error } = await supabase
    .from("payment_proofs")
    .insert({
      sale_id: input.saleId,
      image_url: publicUrl,
      amount: input.amount ?? null,
      method: input.method ?? "transferencia",
      customer_email: input.customerEmail ?? null,
      note: input.note ?? null,
      status: "pending",
    })
    .select()
    .single()

  if (error) throw error
  return data as PaymentProof
}

export async function getProofById(id: string): Promise<PaymentProof | null> {
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.warn("[proofs] get error:", error.message)
    return null
  }
  return (data as PaymentProof) ?? null
}

export async function listProofsForSale(saleId: string): Promise<PaymentProof[]> {
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("*")
    .eq("sale_id", saleId)
    .order("created_at", { ascending: false })
  if (error) {
    console.warn("[proofs] list error:", error.message)
    return []
  }
  return (data as PaymentProof[]) ?? []
}

export async function approveProof(
  proofId: string,
  amount: number,
  method: string = "transferencia"
): Promise<void> {
  const { error } = await supabase.rpc("approve_payment_proof", {
    p_proof_id: proofId,
    p_amount: amount,
    p_method: method,
  })
  if (error) throw error
}

export async function rejectProof(proofId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("reject_payment_proof", {
    p_proof_id: proofId,
    p_reason: reason ?? null,
  })
  if (error) throw error
}
