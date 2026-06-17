import { supabase } from "../../lib/supabase"

/**
 * Reset operativo para producción: borra TODO lo transaccional y de catálogo
 * sin tocar usuarios ni configuración general.
 *
 * QUÉ SE BORRA
 *   • products, variants, movements
 *   • sales, sale_items, payments, payment_proofs
 *   • support_tickets, notifications
 *   • pricing_operations (historial de la calculadora)
 *   • wishes (sugerencias / wishlist server-side)
 *   • inventory_cycles, capital_injections, operating_expenses
 *   • Todos los archivos del bucket `product-images` EXCEPTO la carpeta
 *     `avatars/` (fotos de perfil)
 *
 * QUÉ SE PRESERVA
 *   • auth.users
 *   • user_profiles
 *   • app_settings, business_rules, bank_accounts, pricing_config
 *   • storage avatars/
 *
 * IMPORTANTE: requiere que la sesión activa sea de un admin. Las RLS
 * `*_write_staff` impedirán a usuarios normales correrlo. Aun así
 * cuenta filas afectadas y devuelve un reporte por tabla para que la
 * UI pueda mostrar "10 productos borrados, 47 archivos eliminados…".
 */
export interface ResetReport {
  tables: Record<string, number>
  storage_deleted: number
  errors: { where: string; message: string }[]
}

const TABLES_IN_ORDER = [
  // Hijas primero (FKs hacia variants/sales)
  "movements",
  "notifications",
  "payment_proofs",
  "payments",
  "support_tickets",
  "sale_items",
  "sales",
  // Operacionales
  "pricing_operations", // historial de la calculadora
  "wishes",             // sugerencias / wishlist server-side
  // Catálogo
  "variants",
  "products",
  // Ciclos
  "capital_injections",
  "operating_expenses",
  "inventory_cycles",
] as const

async function deleteAllRows(
  table: string,
  report: ResetReport
): Promise<void> {
  // Truco: `not.is.null` en la PK matchea TODAS las filas y nos devuelve
  // count via head request. Las RLS bloquean automáticamente lo que no
  // se pueda borrar (en cuyo caso reportamos 0 y seguimos).
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .not("id", "is", null)

  if (error) {
    // Si la tabla no existe (404), no es fatal — la marcamos como 0.
    if (/relation .* does not exist/i.test(error.message) || error.code === "42P01") {
      report.tables[table] = 0
      return
    }
    report.errors.push({ where: `table:${table}`, message: error.message })
    report.tables[table] = 0
    return
  }
  report.tables[table] = count ?? 0
}

/**
 * Recorre el bucket `product-images` listando carpetas en la raíz, y
 * borra recursivamente todo excepto `avatars/`. Supabase storage no
 * tiene un "DELETE WHERE name LIKE ..." nativo, así que listamos y
 * pasamos los paths a `remove()`.
 */
async function purgeStorage(report: ResetReport): Promise<void> {
  const BUCKET = "product-images"

  try {
    // Lista carpetas raíz del bucket
    const { data: rootFolders, error: rootErr } = await supabase.storage
      .from(BUCKET)
      .list("", { limit: 1000, sortBy: { column: "name", order: "asc" } })

    if (rootErr) {
      report.errors.push({ where: "storage:list-root", message: rootErr.message })
      return
    }

    const foldersToWipe = (rootFolders ?? [])
      .filter((f: any) => f && f.name && f.name !== "avatars")
      .map((f: any) => f.name as string)

    let totalDeleted = 0

    for (const folder of foldersToWipe) {
      const paths = await listAllFiles(BUCKET, folder)
      if (paths.length === 0) continue

      // Borra en chunks de 1000 (límite de la API)
      for (let i = 0; i < paths.length; i += 1000) {
        const chunk = paths.slice(i, i + 1000)
        const { error: remErr, data: removed } = await supabase.storage
          .from(BUCKET)
          .remove(chunk)
        if (remErr) {
          report.errors.push({
            where: `storage:remove:${folder}`,
            message: remErr.message,
          })
        } else {
          totalDeleted += (removed ?? []).length
        }
      }
    }

    report.storage_deleted = totalDeleted
  } catch (e: any) {
    report.errors.push({ where: "storage:purge", message: e?.message ?? "unknown" })
  }
}

/** Lista recursivamente todos los paths bajo `prefix` en el bucket dado. */
async function listAllFiles(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [prefix]

  while (stack.length > 0) {
    const current = stack.pop()!
    let offset = 0
    // Loop para paginar (la API lista max 100 por defecto, max 1000)
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(current, { limit: 1000, offset })
      if (error || !data) break
      for (const entry of data) {
        // Entradas sin metadata = carpetas
        const path = `${current}/${entry.name}`
        if (!entry.metadata) {
          stack.push(path)
        } else {
          out.push(path)
        }
      }
      if (data.length < 1000) break
      offset += 1000
    }
  }
  return out
}

/**
 * Resetea `pricing_config` (fila id=1) a defaults razonables sin
 * eliminarla — otras vistas asumen que existe.
 */
async function resetPricingConfig(report: ResetReport): Promise<void> {
  const { error } = await supabase
    .from("pricing_config")
    .update({
      margen_menudeo: 35,
      margen_medio: 25,
      margen_mayoreo: 15,
      umbral_medio: 6,
      umbral_mayoreo: 12,
      costo_extra: 0,
    })
    .eq("id", 1)
  if (error) {
    report.errors.push({ where: "pricing_config:reset", message: error.message })
  }
}

/** Acción principal. */
export async function resetAppData(): Promise<ResetReport> {
  const report: ResetReport = {
    tables: {},
    storage_deleted: 0,
    errors: [],
  }

  // 1) Borra tablas en orden FK-safe
  for (const t of TABLES_IN_ORDER) {
    await deleteAllRows(t, report)
  }

  // 2) Resetea pricing_config (UPDATE, no DELETE)
  await resetPricingConfig(report)

  // 3) Limpia el bucket de imágenes (excepto avatars/)
  await purgeStorage(report)

  return report
}
