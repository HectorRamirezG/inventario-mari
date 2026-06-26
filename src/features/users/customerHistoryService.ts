/**
 * Historial mínimo del cliente para auto-llenar formularios admin.
 *
 * Problema: cuando Mari crea una comanda nueva, captura una venta o
 * edita datos del cliente, mucha info ya existe en sales previas o
 * en user_profiles, pero los formularios la pedían en blanco. Resultado:
 * datos duplicados, errores de tipeo, dirección distinta en cada venta.
 *
 * Esta función trae el último address/phone/email del cliente buscando
 * primero en user_profiles (canónico) y luego en sales recientes (fallback).
 *
 * Tolerante: si user_profiles no tiene columnas address/phone, cae a
 * sales sin romper.
 */

import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

export interface CustomerHistory {
  email: string
  name: string | null
  phone: string | null
  address: string | null
  locationUrl: string | null
  /** Cuándo fue el último pedido (para mostrar "Datos de hace X días"). */
  lastSeenIso: string | null
  /** Cantidad de pedidos previos — útil para "Cliente con N compras" UI. */
  ordersCount: number
}

/**
 * Busca el historial por email. Retorna null si no hay datos.
 * Estrategia:
 *   1. user_profiles (datos canónicos si los hay).
 *   2. sales más reciente del mismo email.
 *
 * Los campos de sales sobrescriben solo si user_profiles no los tiene.
 */
export async function fetchCustomerHistory(
  email: string | null | undefined,
): Promise<CustomerHistory | null> {
  if (!email) return null
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes("@")) return null

  let name: string | null = null
  let phone: string | null = null
  let address: string | null = null
  let locationUrl: string | null = null

  // 1. user_profiles (campos opcionales). Si tabla/columnas no existen,
  //    la query falla silenciosamente.
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("full_name,phone,address,location_url")
      .eq("email", clean)
      .maybeSingle()
    const p = (data ?? null) as any
    if (p) {
      name = p.full_name ?? null
      phone = p.phone ?? null
      address = p.address ?? null
      locationUrl = p.location_url ?? null
    }
  } catch (e: any) {
    debug.warn("[customer-history] user_profiles:", e?.message)
  }

  // 2. sales fallback — la más reciente con datos no-nulos.
  try {
    const { data } = await supabase
      .from("sales")
      .select(
        "customer_name,customer_phone,customer_address,customer_location,created_at",
      )
      .eq("customer_email", clean)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5)
    const rows = (data ?? []) as any[]
    let lastSeenIso: string | null = null
    for (const r of rows) {
      if (!lastSeenIso) lastSeenIso = r.created_at ?? null
      if (!name && r.customer_name) name = r.customer_name
      if (!phone && r.customer_phone) phone = r.customer_phone
      if (!address && r.customer_address) address = r.customer_address
      if (!locationUrl && r.customer_location) locationUrl = r.customer_location
    }
    return {
      email: clean,
      name,
      phone,
      address,
      locationUrl,
      lastSeenIso,
      ordersCount: rows.length,
    }
  } catch (e: any) {
    debug.warn("[customer-history] sales:", e?.message)
    // Si las queries fallan pero tenemos algo de user_profiles, devolvemos eso
    if (name || phone || address) {
      return {
        email: clean,
        name,
        phone,
        address,
        locationUrl,
        lastSeenIso: null,
        ordersCount: 0,
      }
    }
    return null
  }
}
