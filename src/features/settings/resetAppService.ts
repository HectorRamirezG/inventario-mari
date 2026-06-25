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
  | "loyalty"
  // Limpiezas SELECTIVAS (no borran toda la tabla, solo lo "cerrado").
  // Mari pidió estas porque la versión anterior solo permitía "borrar
  // TODO" — y ella quería limpiar solo tickets ya resueltos, notifs
  // ya leídas y ventas canceladas residuales.
  | "tickets_resueltos"
  | "notifs_leidas"
  | "ventas_canceladas"
  | "visitas_viejas"
  | "audit_viejo"

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
  notifs: [
    "notifications",
    "stock_alerts", // alertas pendientes de reposición son notifs
  ],
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
    // Hijos del catálogo que apuntan a products/variants. Si no se
    // borran antes, quedan huérfanos (cards rotas, FK violations).
    "product_questions", // FK a products
    "bundles",           // referencia productos/variantes vía json
    "movements",         // referencia variant_id — borrar antes que variants
    "variants",
    "products",
  ],
  loyalty: [
    // Hijas primero (FKs hacia loyalty_balance no existen, pero por
    // claridad las eventos antes que el balance).
    "loyalty_events",
    "loyalty_balance",
    // loyalty_rules NO se borra aquí — son la configuración del
    // programa (similar a business_rules). Solo borramos data del
    // cliente: balance e historial.
  ],
  // Las selectivas no usan el borrado genérico por tabla; tienen su
  // propio handler dentro de runSelectiveCleanup() que filtra antes
  // del DELETE. Aquí dejamos la lista informativa para el reporte.
  tickets_resueltos: ["support_tickets"],
  notifs_leidas: ["notifications"],
  ventas_canceladas: [
    "movements",
    "payment_proofs",
    "payments",
    "delivery_notes",
    "sale_items",
    "sales",
  ],
  visitas_viejas: ["site_visitors"],
  audit_viejo: ["audit_log"],
}

/** Días de antigüedad usados por las limpiezas selectivas por fecha. */
const VISITAS_DIAS = 30
const AUDIT_DIAS = 90

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
    description: "Buzón del staff y todas las notifs de clientes.",
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
  loyalty: {
    label: "Programa de premios (data)",
    description:
      "Balance de puntos de cada cliente y su historial. Las REGLAS del programa NO se borran (eso se hace desde el editor de reglas).",
    tone: "amber",
  },
  tickets_resueltos: {
    label: "Solo tickets resueltos",
    description:
      "Limpieza selectiva: borra tickets de soporte ya resueltos. Los abiertos NO se tocan.",
    tone: "sky",
  },
  notifs_leidas: {
    label: "Solo notifs leídas",
    description:
      "Limpieza selectiva: borra notificaciones que ya marcaste como leídas. Las no leídas permanecen.",
    tone: "sky",
  },
  ventas_canceladas: {
    label: "Solo ventas canceladas",
    description:
      "Limpieza selectiva: borra ventas con status=cancelled y todos sus dependientes (items, pagos, comprobantes, comandas, movimientos).",
    tone: "amber",
  },
  visitas_viejas: {
    label: "Visitas anónimas viejas",
    description: `Limpieza selectiva: borra el tracking de visitantes con más de ${VISITAS_DIAS} días. Útil para no acumular gigas de telemetría que ya no consultas.`,
    tone: "slate",
  },
  audit_viejo: {
    label: "Bitácora de admin vieja",
    description: `Limpieza selectiva: borra entradas del audit log con más de ${AUDIT_DIAS} días. Las recientes (para investigar incidentes) se conservan.`,
    tone: "slate",
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
  stock_alerts: "Alertas «Avísame cuando llegue»",
  loyalty_events: "Eventos del programa de premios",
  loyalty_balance: "Saldos de puntos de clientes",
  bundles: "Combos / paquetes",
  product_questions: "Preguntas de productos (Q&A)",
  site_visitors: "Visitantes anónimos",
  audit_log: "Bitácora del admin",
}

/**
 * Algunas tablas no tienen columna `id` (su PK es otra). Para que el
 * DELETE de Supabase requiera siempre un WHERE (PostgREST exige
 * filtro), mapeamos aquí la columna "siempre presente" a usar como
 * filtro `is not null`.
 *
 * - loyalty_balance: PK = customer_email
 */
const TABLE_FILTER_COLUMN: Record<string, string> = {
  loyalty_balance: "customer_email",
}

async function deleteAllRows(
  table: string,
  report: ResetReport,
): Promise<void> {
  const filterCol = TABLE_FILTER_COLUMN[table] ?? "id"
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .not(filterCol, "is", null)

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
  // Las selectivas NO entran en "borrar TODO":
  //  - tickets_resueltos / notifs_leidas / ventas_canceladas → ya las
  //    cubre la categoría padre (soporte / notifs / ventas).
  //  - visitas_viejas / audit_viejo → son históricos, NO se borran en
  //    un reset completo aunque el admin pida "todo". Mari debe pedir
  //    explícitamente la selectiva si quiere limpiar telemetría.
  const FULL_RESET_SET = ALL.filter(
    (c) =>
      ![
        "tickets_resueltos",
        "notifs_leidas",
        "ventas_canceladas",
        "visitas_viejas",
        "audit_viejo",
      ].includes(c),
  )
  const selected: ResetCategory[] =
    categories && categories.length > 0 ? categories : FULL_RESET_SET

  const isFullReset =
    selected.length === FULL_RESET_SET.length &&
    FULL_RESET_SET.every((c) => selected.includes(c))

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
  // Las categorías SELECTIVAS (tickets_resueltos, notifs_leidas,
  // ventas_canceladas) tienen su propio handler con filtro — NO usan
  // deleteAllRows porque ese borra TODA la tabla.
  const SELECTIVE: ResetCategory[] = [
    "tickets_resueltos",
    "notifs_leidas",
    "ventas_canceladas",
    "visitas_viejas",
    "audit_viejo",
  ]
  // Dedupe de tablas compartidas (ej. `movements` está en `ventas` y
  // `catalogo`). Antes se borraba dos veces — era idempotente pero
  // gastaba round-trips y el reporte ya contaba el total real en la
  // primera pasada. Preservamos el orden de aparición para mantener
  // la garantía FK-safe (hijas antes que padres).
  const seenTables = new Set<string>()
  for (const cat of selected) {
    if (SELECTIVE.includes(cat)) {
      await runSelectiveCleanup(cat, report)
      continue
    }
    for (const t of CATEGORY_TABLES[cat]) {
      if (seenTables.has(t)) continue
      seenTables.add(t)
      await deleteAllRows(t, report)
    }
  }

  if (selected.includes("catalogo")) {
    await purgeStorage(report)
  }

  return report
}

/**
 * Handlers de limpiezas selectivas. Cada uno hace un DELETE con WHERE
 * específico para tocar solo lo "cerrado" sin afectar lo activo.
 * Mari reportó que la versión anterior decía "borra tickets resueltos"
 * pero borraba TODOS los tickets (lo que era mentira en el copy).
 */
async function runSelectiveCleanup(
  cat: ResetCategory,
  report: ResetReport,
): Promise<void> {
  if (cat === "tickets_resueltos") {
    const { data, error } = await supabase
      .from("support_tickets")
      .delete()
      .eq("status", "resolved")
      .select("id")
    if (error) {
      report.errors.push({
        where: "selective:tickets_resueltos",
        message: error.message,
      })
      report.tables["support_tickets"] = 0
    } else {
      report.tables["support_tickets"] = (data ?? []).length
    }
    return
  }

  if (cat === "notifs_leidas") {
    const { data, error } = await supabase
      .from("notifications")
      .delete()
      .not("read_at", "is", null)
      .select("id")
    if (error) {
      report.errors.push({
        where: "selective:notifs_leidas",
        message: error.message,
      })
      report.tables["notifications"] = 0
    } else {
      report.tables["notifications"] = (data ?? []).length
    }
    return
  }

  if (cat === "ventas_canceladas") {
    // 1) Buscamos los IDs de sales canceladas
    const { data: cancelledSales, error: idsErr } = await supabase
      .from("sales")
      .select("id")
      .eq("status", "cancelled")
    if (idsErr) {
      report.errors.push({
        where: "selective:ventas_canceladas:lookup",
        message: idsErr.message,
      })
      return
    }
    const ids = (cancelledSales ?? []).map((r: any) => r.id as string)
    if (ids.length === 0) {
      report.tables["sales"] = 0
      return
    }
    // 2) Borramos en orden FK-safe (hijas primero, luego sales).
    // Cada tabla intenta solo las filas asociadas a las sales seleccionadas.
    const childTables = [
      "movements",
      "payment_proofs",
      "payments",
      "delivery_notes",
      "sale_items",
    ]
    for (const t of childTables) {
      const { data, error } = await supabase
        .from(t)
        .delete()
        .in("sale_id", ids)
        .select("id")
      if (error) {
        // movements puede no tener sale_id (es por variant_id) — ignoramos
        // ese caso específico para no contaminar el reporte.
        if (!/column .* does not exist/i.test(error.message)) {
          report.errors.push({
            where: `selective:ventas_canceladas:${t}`,
            message: error.message,
          })
        }
        report.tables[t] = 0
      } else {
        report.tables[t] = (data ?? []).length
      }
    }
    // 3) Finalmente las sales
    const { data: salesDel, error: salesErr } = await supabase
      .from("sales")
      .delete()
      .in("id", ids)
      .select("id")
    if (salesErr) {
      report.errors.push({
        where: "selective:ventas_canceladas:sales",
        message: salesErr.message,
      })
      report.tables["sales"] = 0
    } else {
      report.tables["sales"] = (salesDel ?? []).length
    }
    return
  }

  if (cat === "visitas_viejas") {
    // Borra tracking anónimo más viejo que VISITAS_DIAS. Usa `created_at`
    // como referencia (toda fila de site_visitors lo tiene por default).
    const cutoff = new Date(Date.now() - VISITAS_DIAS * 86_400_000).toISOString()
    const { data, error } = await supabase
      .from("site_visitors")
      .delete()
      .lt("created_at", cutoff)
      .select("id")
    if (error) {
      // Si la tabla no existe o la RLS no permite delete, lo registramos
      // sin tirar el flujo completo.
      if (!/relation .* does not exist/i.test(error.message) && error.code !== "42P01") {
        report.errors.push({
          where: "selective:visitas_viejas",
          message: error.message,
        })
      }
      report.tables["site_visitors"] = 0
    } else {
      report.tables["site_visitors"] = (data ?? []).length
    }
    return
  }

  if (cat === "audit_viejo") {
    // Borra entradas del audit_log con más de AUDIT_DIAS días. Las
    // recientes (las que sirven para investigar incidentes) se quedan.
    const cutoff = new Date(Date.now() - AUDIT_DIAS * 86_400_000).toISOString()
    const { data, error } = await supabase
      .from("audit_log")
      .delete()
      .lt("created_at", cutoff)
      .select("id")
    if (error) {
      if (!/relation .* does not exist/i.test(error.message) && error.code !== "42P01") {
        report.errors.push({
          where: "selective:audit_viejo",
          message: error.message,
        })
      }
      report.tables["audit_log"] = 0
    } else {
      report.tables["audit_log"] = (data ?? []).length
    }
    return
  }
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
