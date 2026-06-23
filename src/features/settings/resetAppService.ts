import { supabase } from "../../lib/supabase"

/**
 * Reset operativo SELECTIVO para producción: borra SOLO las categorías
 * que el admin elija. Permite por ejemplo limpiar ventas y soporte sin
 * tocar el catálogo o los clientes.
 *
 * Categorías disponibles:
 *   - `ventas`      → sales, sale_items, payments, payment_proofs,
 *                     movements, delivery_notes (todo el flujo monetario
 *                     y de inventario que generó la venta).
 *   - `soporte`     → support_tickets
 *   - `notifs`      → notifications (buzón de Mari y de clientes)
 *   - `deseos`      → wishes (sugerencias del cliente)
 *   - `stories`     → stories
 *   - `resenias`    → reviews
 *   - `pricing_ops` → pricing_operations (historial calculadora)
 *   - `ciclos`      → inventory_cycles, capital_injections, operating_expenses
 *   - `catalogo`    → products, variants, movements (incluye imágenes del
 *                     bucket EXCEPTO avatars/). Borra todo el catálogo.
 *
 * QUÉ NO SE TOCA NUNCA:
 *   - auth.users, user_profiles (cuentas y avatars)
 *   - app_settings, business_rules, bank_accounts, pricing_config
 *   - storage avatars/
 *
 * Requiere sesión admin. Las RLS `*_write_staff` impiden a clientes
 * normales correrlo. Cuenta filas afectadas y devuelve reporte por
 * tabla.
 */

export type ResetCategory =
  | "ventas"
  | "soporte"
  | "notifs"
  | "deseos"
  | "stories"
  | "resenias"
  | "pricing_ops"
  | "ciclos"
  | "catalogo"

export interface ResetReport {
  tables: Record<string, number>
  storage_deleted: number
  errors: { where: string; message: string }[]
}

/** Definición de qué tablas borra cada categoría (FK-safe order). */
export const CATEGORY_TABLES: Record<ResetCategory, string[]> = {
  // Hijas primero (FKs hacia sales)
  ventas: [
    "movements",       // referencia sale_id, variant_id
    "payment_proofs",  // referencia sale_id
    "payments",        // referencia sale_id
    "delivery_notes",  // referencia sale_id
    "sale_items",      // referencia sale_id, variant_id
    "sales",
  ],
  soporte: ["support_tickets"],
  notifs: ["notifications"],
  deseos: ["wishes"],
  stories: ["stories"],
  resenias: ["reviews"],
  pricing_ops: ["pricing_operations"],
  ciclos: [
    "capital_injections", // FK a inventory_cycles
    "operating_expenses", // FK a inventory_cycles
    "inventory_cycles",
  ],
  catalogo: [
    "movements", // referencia variant_id — borrar antes que variants
    "variants",
    "products",
  ],
}

/** UI-friendly label + descripción corta. */
export const CATEGORY_INFO: Record<
  ResetCategory,
  { label: string; description: string; tone: "rose" | "amber" | "sky" | "slate" }
> = {
  ventas: {
    label: "Ventas y apartados",
    description: "Sales, items, pagos, comprobantes, comandas y movimientos.",
    tone: "rose",
  },
  soporte: {
    label: "Tickets de soporte",
    description: "Todos los tickets que clientes han abierto.",
    tone: "amber",
  },
  notifs: {
    label: "Notificaciones",
    description: "Buzón de Mari y todas las notifs de clientes.",
    tone: "sky",
  },
  deseos: {
    label: "Sugerencias / deseos",
    description: "Wishlist del cliente y sus solicitudes.",
    tone: "rose",
  },
  stories: {
    label: "Stories",
    description: "Fotos del día efímeras publicadas.",
    tone: "amber",
  },
  resenias: {
    label: "Reseñas",
    description: "Comentarios con foto que clientes dejaron.",
    tone: "sky",
  },
  pricing_ops: {
    label: "Cálculos guardados",
    description: "Historial de la calculadora de precios.",
    tone: "slate",
  },
  ciclos: {
    label: "Ciclos de inventario",
    description: "Ciclos cerrados, inyecciones de capital y gastos.",
    tone: "amber",
  },
  catalogo: {
    label: "Catálogo COMPLETO",
    description: "Productos, variantes y fotos. ⚠ Acción más destructiva.",
    tone: "rose",
  },
}

/** Etiquetas legibles para el reporte y la UI por tabla. */
export const TABLE_LABEL: Record<string, string> = {
  products: "Productos",
  variants: "Variantes",
  movements: "Movimientos de stock",
  sales: "Ventas / apartados",
  sale_items: "Items de venta",
  payments: "Pagos registrados",
  payment_proofs: "Comprobantes de pago",
  delivery_notes: "Comandas de entrega",
  notifications: "Notificaciones",
  support_tickets: "Tickets de soporte",
  pricing_operations: "Cálculos de precios",
  wishes: "Sugerencias / wishlist",
  stories: "Stories",
  reviews: "Reseñas",
  inventory_cycles: "Ciclos de inventario",
  capital_injections: "Inyecciones de capital",
  operating_expenses: "Gastos operativos",
}

async function deleteAllRows(
  table: string,
  report: ResetReport,
): Promise<void> {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .not("id", "is", null)

  if (error) {
    if (/relation .* does not exist/i.test(error.message) || error.code === "42P01") {
      report.tables[table] = report.tables[table] ?? 0
      return
    }
    report.errors.push({ where: `table:${table}`, message: error.message })
    report.tables[table] = report.tables[table] ?? 0
    return
  }
  report.tables[table] = (report.tables[table] ?? 0) + (count ?? 0)
}

/**
 * Limpia el bucket `product-images` solo si la categoría `catalogo`
 * está incluida. NUNCA toca la carpeta `avatars/`.
 */
async function purgeStorage(report: ResetReport): Promise<void> {
  const BUCKET = "product-images"

  try {
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

/** Lista recursivamente todos los paths bajo `prefix` en el bucket. */
async function listAllFiles(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [prefix]
  while (stack.length > 0) {
    const current = stack.pop()!
    let offset = 0
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(current, { limit: 1000, offset })
      if (error || !data) break
      for (const entry of data) {
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
 * Acción principal. Acepta lista de categorías; si está vacía o
 * undefined, se interpreta como "borrar TODO" (comportamiento legacy).
 */
export async function resetAppData(
  categories?: ResetCategory[],
): Promise<ResetReport> {
  const report: ResetReport = {
    tables: {},
    storage_deleted: 0,
    errors: [],
  }

  const ALL = Object.keys(CATEGORY_TABLES) as ResetCategory[]
  const selected: ResetCategory[] =
    categories && categories.length > 0 ? categories : ALL

  const isFullReset = selected.length === ALL.length

  // Si es reset completo Y la RPC `reset_app_data` existe, la usamos:
  // bypasea RLS y es más eficiente. Si falla o el set es parcial,
  // vamos tabla-por-tabla (RLS staff/admin debe permitirlo).
  if (isFullReset) {
    const rpcOk = await tryRpcReset(report)
    if (rpcOk) {
      if (selected.includes("catalogo")) {
        await purgeStorage(report)
      }
      return report
    }
  }

  // Método selectivo: borra cada categoría en orden FK-safe.
  // Las tablas compartidas (movements en ventas Y catalogo) se intentan
  // dos veces pero `deleteAllRows` es idempotente.
  for (const cat of selected) {
    for (const t of CATEGORY_TABLES[cat]) {
      await deleteAllRows(t, report)
    }
  }

  if (selected.includes("catalogo")) {
    await purgeStorage(report)
  }

  return report
}

/**
 * Llama a la RPC `reset_app_data` del servidor (sin parámetros).
 * Devuelve true si existe y completó.
 */
async function tryRpcReset(report: ResetReport): Promise<boolean> {
  const { data, error } = await supabase.rpc("reset_app_data")
  if (error) {
    if (
      /function .* does not exist|404|not found/i.test(error.message) ||
      error.code === "PGRST202" ||
      error.code === "42883"
    ) {
      return false
    }
    report.errors.push({ where: "rpc:reset_app_data", message: error.message })
    return true
  }
  const payload = (data ?? {}) as { tables?: Record<string, number | { error: string }> }
  const tables = payload.tables ?? {}
  for (const [name, val] of Object.entries(tables)) {
    if (typeof val === "number") {
      report.tables[name] = val
    } else if (val && typeof val === "object" && "error" in val) {
      report.tables[name] = 0
      report.errors.push({ where: `rpc:${name}`, message: String(val.error) })
    }
  }
  return true
}
