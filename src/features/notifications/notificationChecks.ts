import { supabase } from "../../lib/supabase"
import { notifyAdmins, notifyClient } from "./notificationsService"
import { formatMoney } from "../../lib/format"
import { debug } from "../../lib/debug"
import { getBusinessRules } from "../settings/businessRulesService"

/**
 * SISTEMA DE ALERTAS "AT-LOAD"
 *
 * Cuando el admin (o el cliente) abre la app, este módulo evalúa
 * condiciones que requerirían un cron en backend tradicional.
 *
 * Usamos localStorage como "checkpoint" para no spammear: cada tipo
 * de alerta se dispara máximo una vez por día/hora/lo que aplique.
 *
 * Ventajas:
 *  - 0 infra extra (no necesitamos pg_cron ni Edge Functions)
 *  - Cero costo
 *  - Si el admin no abre la app, simplemente no le llega — pero igual
 *    está la lista visible al abrir Apartados o el Dashboard.
 *
 * Llamado desde `App.tsx` cuando hay sesión.
 */

/* ────── Helpers de checkpoint ────── */

const CHECKPOINT_PREFIX = "mari:notif-check:"

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getCheck(key: string): string | null {
  try {
    return localStorage.getItem(CHECKPOINT_PREFIX + key)
  } catch {
    return null
  }
}

function setCheck(key: string, value: string = "1"): void {
  try {
    localStorage.setItem(CHECKPOINT_PREFIX + key, value)
  } catch {
    /* noop */
  }
}

/** Devuelve true si la alerta NO se disparó hoy todavía. Si se va a
 * disparar, marca el checkpoint para no volver a hacerlo en el día. */
function fireOncePerDay(key: string): boolean {
  const last = getCheck(key)
  const today = todayKey()
  if (last === today) return false
  setCheck(key, today)
  return true
}

/* ════════════════════════════════════════════════════════════
 *  CHECKS PARA ADMIN
 * ════════════════════════════════════════════════════════════ */

/** 1) Comprobantes pendientes de revisar (>1h sin acción). */
async function checkPendingProofs(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("id, sale_id, created_at")
    .in("status", ["pending", "pending_verification"])
    .lt("created_at", oneHourAgo)
    .order("created_at", { ascending: true })
    .limit(10)
  if (error || !data || data.length === 0) return

  // Disparamos una sola notif al día con el conteo. Si lo manda
  // múltiple por proof, satura. Mejor un resumen.
  const checkpoint = `pending-proofs-${todayKey()}-${data.length}`
  if (getCheck(checkpoint)) return
  setCheck(checkpoint, "1")

  await notifyAdmins({
    type: "payment_proof_reminder",
    title: `Tienes ${data.length} comprobante${data.length > 1 ? "s" : ""} por revisar`,
    body: "Llevan más de una hora esperando aprobación. Ábrelos en Apartados.",
    link: "/apartados",
    metadata: { proofs: data.map((p) => p.id), count: data.length },
  })
}

/** 2) Apartados sin actividad ≥7 días. Una vez al día. */
async function checkStaleLayaways(): Promise<void> {
  if (!fireOncePerDay("stale-layaways")) return

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("sales")
    .select("id, customer_name, balance, created_at")
    .eq("status", "pending")
    .eq("is_layaway", true)
    .lt("created_at", sevenDaysAgo)
    .order("created_at", { ascending: true })
    .limit(20)
  if (error || !data || data.length === 0) return

  await notifyAdmins({
    type: "layaway_stale",
    title: `${data.length} apartado${data.length > 1 ? "s" : ""} sin movimiento`,
    body: "Llevan +7 días sin abono. ¿Mandar recordatorio a los clientes?",
    link: "/apartados",
    metadata: { sales: data.map((s) => s.id), count: data.length },
  })
}

/** 3) Stock bajo crítico — usa el umbral de business rules. */
async function checkLowStock(): Promise<void> {
  const rules = getBusinessRules()
  if (!rules.stock_alert_enabled) return
  if (!fireOncePerDay("low-stock")) return

  const threshold = Math.max(1, rules.stock_alert_threshold || 3)
  const { data, error } = await supabase
    .from("variants")
    .select("id,name,stock,products:products(name,is_active)")
    .gt("stock", 0)
    .lte("stock", threshold)
    .eq("is_active", true)
    .limit(30)
  if (error || !data || data.length === 0) return

  const active = data.filter((v: any) => v.products?.is_active)
  if (active.length === 0) return

  await notifyAdmins({
    type: "stock_low",
    title: `${active.length} variante${active.length > 1 ? "s" : ""} con stock bajo`,
    body: `Quedan ≤${threshold} unidades. Considera reabastecer.`,
    link: "/inventario?lowstock=1",
    metadata: { count: active.length, threshold },
  })
}

/** 4) Comandas no abiertas en +30 min después de "sent". */
async function checkComandasNotOpened(): Promise<void> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("delivery_notes")
    .select("id, sale_id, driver_name, driver_phone, sent_at, status")
    .eq("status", "sent")
    .lt("sent_at", thirtyMinAgo)
    .limit(10)
  if (error || !data || data.length === 0) return

  // Una notif por comanda — pero usamos checkpoint por delivery_id para
  // que no se repita la misma alerta cada vez que el admin abre la app.
  for (const note of data) {
    const ck = `comanda-not-opened-${note.id}`
    if (getCheck(ck)) continue
    setCheck(ck, "1")
    await notifyAdmins({
      type: "delivery_not_opened",
      title: `Comanda no abierta · ${note.driver_name ?? "Repartidor"}`,
      body: note.driver_phone
        ? `Marca al ${note.driver_phone} para confirmar.`
        : "Lleva +30 min sin abrir el link. Verifica con el repartidor.",
      link: `/apartados?sale=${note.sale_id}`,
      metadata: { delivery_id: note.id, sale_id: note.sale_id },
    })
  }
}

/** 5) Meta diaria de ventas alcanzada — confeti + notif. */
async function checkDailyGoal(): Promise<void> {
  const rules = getBusinessRules()
  if (!rules.daily_sales_goal_enabled) return
  if (!rules.daily_sales_goal_amount || rules.daily_sales_goal_amount <= 0) return
  if (!fireOncePerDay("daily-goal")) return

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from("sales")
    .select("total")
    .gte("created_at", startOfDay.toISOString())
    .neq("status", "cancelled")
  if (error || !data) return

  const total = data.reduce((a, s: any) => a + Number(s.total || 0), 0)
  if (total < rules.daily_sales_goal_amount) {
    // No alcanzada → desmarca el checkpoint para volver a evaluar más tarde
    try {
      localStorage.removeItem(CHECKPOINT_PREFIX + "daily-goal")
    } catch {
      /* noop */
    }
    return
  }

  await notifyAdmins({
    type: "daily_goal",
    title: `🎉 Meta del día alcanzada · ${formatMoney(total)}`,
    body: `Vendiste ${formatMoney(total)} (meta: ${formatMoney(rules.daily_sales_goal_amount)}). ¡Buen día!`,
    link: "/dashboard",
    metadata: { total, goal: rules.daily_sales_goal_amount, date: todayKey() },
  })

  // Confeti opcional (si la app está abierta) — el dashboard puede
  // escuchar este evento para celebrar visualmente
  try {
    window.dispatchEvent(
      new CustomEvent("mari:daily-goal-reached", { detail: { total, goal: rules.daily_sales_goal_amount } }),
    )
  } catch {
    /* noop */
  }
}

/* ════════════════════════════════════════════════════════════
 *  CHECKS PARA CLIENTE
 * ════════════════════════════════════════════════════════════ */

/** 6) Apartado por vencer (3 días o menos). Por cliente. */
async function checkLayawayDueSoon(email: string): Promise<void> {
  if (!email) return
  const clean = email.trim().toLowerCase()
  if (!clean) return
  if (!fireOncePerDay(`layaway-due-${clean}`)) return

  // Asumimos plazo de 30 días desde created_at (no existe columna due_date).
  // "Por vencer" = created_at <= hoy - 27 días.
  const cutoff = new Date(Date.now() - 27 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from("sales")
    .select("id, balance, public_token, created_at")
    .eq("customer_email", clean)
    .eq("status", "pending")
    .eq("is_layaway", true)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5)
  if (error || !data || data.length === 0) return

  for (const sale of data) {
    await notifyClient(clean, {
      type: "layaway_due_soon",
      title: "Tu apartado está por vencer",
      body: `Saldo: ${formatMoney(Number(sale.balance) || 0)}. Te quedan pocos días para liquidarlo.`,
      link: "/mis-pedidos",
      metadata: { sale_id: sale.id },
    })
  }
}

/** 7) Cumpleaños del cliente hoy — saludo personalizado. */
async function checkBirthday(email: string): Promise<void> {
  if (!email) return
  const clean = email.trim().toLowerCase()
  if (!clean) return
  if (!fireOncePerDay(`birthday-${clean}`)) return

  // La columna `birthday` puede no existir; manejamos con maybeSingle.
  let profile: { birthday: string | null; name: string | null } | null = null
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("birthday, name:full_name")
      .eq("email", clean)
      .maybeSingle()
    profile = data as any
  } catch {
    return
  }
  if (!profile?.birthday) return

  // Formato esperado YYYY-MM-DD. Comparamos mes+día.
  const today = new Date()
  const [, m, d] = profile.birthday.split("-").map(Number)
  if (m !== today.getMonth() + 1 || d !== today.getDate()) return

  // Código de cupón determinístico por email + año. Mari lo puede
  // verificar regenerándolo en su admin. Garantiza unicidad por persona
  // por año sin necesidad de tabla nueva.
  const year = today.getFullYear()
  const seed = `${clean}-${year}-birthday`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const coupon = `CUMPLE${Math.abs(hash).toString(36).slice(0, 5).toUpperCase()}`
  const discountPct = 15

  await notifyClient(clean, {
    type: "birthday",
    title: `¡Feliz cumpleaños${profile.name ? ", " + profile.name.split(" ")[0] : ""}! 🎂`,
    body: `Tu regalo: ${discountPct}% OFF en tu próxima compra con el código ${coupon}. Solo muéstraselo a Mari al apartar 💖`,
    link: "/",
    metadata: { date: todayKey(), coupon, discount_pct: discountPct },
  })

  // Y a Mari le avisamos con el mismo código para que pueda verificar
  // que el cliente no se lo invente.
  await notifyAdmins({
    type: "birthday",
    title: `🎂 Cumpleaños hoy: ${profile.name ?? clean}`,
    body: `Su cupón automático: ${coupon} (${discountPct}% OFF). Aplícaselo si lo muestra al apartar.`,
    link: "/apartados",
    metadata: { email: clean, coupon, discount_pct: discountPct },
  })
}

/* ════════════════════════════════════════════════════════════
 *  ENTRY POINTS
 * ════════════════════════════════════════════════════════════ */

/** Llamado en App.tsx cuando carga un ADMIN con sesión. */
export async function runAdminChecks(): Promise<void> {
  try {
    await Promise.allSettled([
      checkPendingProofs(),
      checkStaleLayaways(),
      checkLowStock(),
      checkComandasNotOpened(),
      checkDailyGoal(),
    ])
  } catch (e: any) {
    debug.warn("[notif-checks] admin:", e?.message)
  }
}

/** Llamado en App.tsx cuando carga un CLIENTE con sesión. */
export async function runClientChecks(email: string | null | undefined): Promise<void> {
  if (!email) return
  try {
    await Promise.allSettled([
      checkLayawayDueSoon(email),
      checkBirthday(email),
      checkAnniversary(email),
      checkWishlistBackInStock(email),
    ])
  } catch (e: any) {
    debug.warn("[notif-checks] client:", e?.message)
  }
}

/* ════════════════════════════════════════════════════════════
 *  CHECK: ANIVERSARIO DEL PRIMER APARTADO
 * ════════════════════════════════════════════════════════════
 * Push automático cuando el cliente cumple 1 año de su primer
 * apartado. Mensaje cariñoso + cupón sugerido de 15% (mismo
 * formato determinístico que el cupón de cumple).
 *
 * Gated por la regla `anniversary_push_enabled` — si Mari lo
 * tiene apagado en BusinessRules, no se dispara nada.
 */
async function checkAnniversary(email: string): Promise<void> {
  if (!email) return
  const rules = getBusinessRules()
  if (!rules.anniversary_push_enabled) return
  const clean = email.trim().toLowerCase()
  if (!clean) return
  if (!fireOncePerDay(`anniversary-${clean}`)) return

  let firstSaleIso: string | null = null
  try {
    const { data } = await supabase
      .from("sales")
      .select("created_at")
      .eq("customer_email", clean)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true })
      .limit(1)
    firstSaleIso = (data?.[0] as any)?.created_at ?? null
  } catch {
    return
  }
  if (!firstSaleIso) return

  const first = new Date(firstSaleIso)
  const today = new Date()
  // Mismo mes + día, año diferente (al menos 1 año).
  const isAnniv =
    first.getMonth() === today.getMonth() &&
    first.getDate() === today.getDate() &&
    today.getFullYear() > first.getFullYear()
  if (!isAnniv) return

  const years = today.getFullYear() - first.getFullYear()

  // Cupón determinístico tipo aniversario.
  const seed = `${clean}-${today.getFullYear()}-anniversary`
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const coupon = `ANIV${Math.abs(hash).toString(36).slice(0, 5).toUpperCase()}`
  const discountPct = 15

  await notifyClient(clean, {
    type: "anniversary",
    title: `🎉 ¡${years} ${years === 1 ? "año" : "años"} con Beauty's Me!`,
    body: `Gracias por seguir aquí. Tu regalo: ${discountPct}% OFF con el código ${coupon}. Muéstraselo a Mari al apartar 💖`,
    link: "/",
    metadata: { date: todayKey(), coupon, discount_pct: discountPct, years },
  })

  await notifyAdmins({
    type: "anniversary",
    title: `🎉 Aniversario hoy: ${clean}`,
    body: `${years} ${years === 1 ? "año" : "años"} desde su primer pedido. Cupón: ${coupon} (${discountPct}% OFF).`,
    link: "/apartados",
    metadata: { email: clean, coupon, discount_pct: discountPct, years },
  })
}

/* ════════════════════════════════════════════════════════════
 *  CHECK ADICIONAL: WISHLIST REGRESÓ A STOCK
 * ════════════════════════════════════════════════════════════ */

/**
 * Verifica la wishlist del cliente (localStorage) contra el stock actual.
 * Si un producto que estaba marcado como "agotado_avisado=true" ahora
 * tiene stock, se dispara notificación.
 *
 * Para evitar spam mantenemos un set de productos ya avisados en una
 * key separada `mari:wishlist-restock-seen` con timestamp por id.
 * Una vez que el cliente compra o quita el item, se limpia.
 */
async function checkWishlistBackInStock(email: string): Promise<void> {
  if (typeof window === "undefined") return
  const clean = email.trim().toLowerCase()
  if (!clean) return

  let wishlist: string[] = []
  try {
    const raw = localStorage.getItem("mari:wishlist")
    if (!raw) return
    const parsed = JSON.parse(raw)
    wishlist = Array.isArray(parsed) ? parsed.filter((x: any) => typeof x === "string") : []
  } catch {
    return
  }
  if (wishlist.length === 0) return

  // Trae solo los productos de la wishlist con su stock total agregado.
  // Patrón eficiente: una sola query con .in().
  const { data: products } = await supabase
    .from("products")
    .select("id, name, is_active, variants:variants(stock,is_active)")
    .in("id", wishlist)
    .eq("is_active", true)
  if (!products || products.length === 0) return

  const RESTOCK_KEY = "mari:wishlist-restock-seen"
  let seen: Record<string, string> = {}
  try {
    const raw = localStorage.getItem(RESTOCK_KEY)
    if (raw) seen = JSON.parse(raw) as Record<string, string>
  } catch {
    /* noop */
  }

  let changed = false
  for (const p of products as any[]) {
    const totalStock = (p.variants ?? [])
      .filter((v: any) => v.is_active)
      .reduce((a: number, v: any) => a + (Number(v.stock) || 0), 0)
    const lastSeenStock = Number(seen[p.id] ?? "-1")
    if (totalStock > 0 && lastSeenStock === 0) {
      // Pasó de 0 → >0: aviso
      await notifyClient(clean, {
        type: "stock_back",
        title: `"${p.name}" volvió a estar disponible`,
        body: "Producto de tu wishlist con stock fresco. ¡Apártalo antes de que se agote!",
        link: `/tienda?product=${p.id}`,
        metadata: { product_id: p.id, stock: totalStock },
      })
    }
    if (seen[p.id] !== String(totalStock)) {
      seen[p.id] = String(totalStock)
      changed = true
    }
  }
  if (changed) {
    try {
      localStorage.setItem(RESTOCK_KEY, JSON.stringify(seen))
    } catch {
      /* noop */
    }
  }
}
