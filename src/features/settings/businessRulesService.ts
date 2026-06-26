import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

/**
 * Reglas de negocio centralizadas. Se persisten en `app_settings`
 * bajo la clave `business_rules` como JSONB. Toda la app las consulta
 * vía `useBusinessRules()` para activar/desactivar comportamientos.
 */
export interface BusinessRules {
  /** Bloquea reportar daño/reclamación N horas después del pago/entrega. */
  claim_window_enabled: boolean
  claim_window_hours: number

  /** No permite cambiar status a "enviado/entregado" en pedido foráneo
   *  hasta que se haya capturado tracking_number. */
  force_tracking_foraneo: boolean

  /** Ventas que excedan este monto exigen confirmación extra del admin. */
  high_value_enabled: boolean
  high_value_threshold: number

  /** Días de gracia para cancelar un apartado sin penalización. */
  cancellation_grace_enabled: boolean
  cancellation_grace_days: number

  /** Bloquea la cancelación pasadas N horas desde el primer pago. */
  no_cancel_after_payment_enabled: boolean
  no_cancel_after_payment_hours: number

  /** No se permite devolución de dinero — solo nota de crédito interna. */
  no_refund: boolean

  /** Apartado mínimo (% del total) para aceptarlo. */
  min_layaway_enabled: boolean
  min_layaway_percent: number

  /** Tope de apartados simultáneos por cliente (evita acaparar stock). */
  max_layaways_enabled: boolean
  max_layaways_per_client: number

  /** Notifica al admin cuando una variante baja del umbral. */
  stock_alert_enabled: boolean
  stock_alert_threshold: number

  /** Una vez que el ciclo de inventario está cerrado, prohíbe editar
   *  pedidos viejos (no se pueden quitar artículos del histórico). */
  lock_edit_when_cycle_closed: boolean

  /* ════════════════════ NUEVAS REGLAS (2026-06-17) ════════════════════ */

  /** Bloquea agregar al carrito (cliente) / vender (admin) cuando stock = 0.
   *  Si está apagada, permite preventa (vender en negativo) con precio
   *  especial (`preorder_discount_percent`). */
  block_oversell: boolean

  /** Descuento (%) aplicado al precio cuando una variante se vende en
   *  preventa (stock=0 y block_oversell=false). Premia al cliente que
   *  paga antes de tener la pieza física. Default 10%. Solo se aplica
   *  si block_oversell está apagado. */
  preorder_discount_percent: number

  /** Días extra de gracia para clientes VIP (RFM tier "vip"). Se SUMA
   *  a `cancellation_grace_days` al evaluar `canCancelSale`. */
  vip_extra_grace_enabled: boolean
  vip_extra_grace_days: number

  /** Auto-tag VIP: si un cliente gasta más de N pesos en los últimos 30
   *  días, se le aplica precio mayoreo automáticamente y se le pinta el
   *  badge VIP. Si está apagada, VIP sólo se aplica via RFM legacy. */
  auto_vip_enabled: boolean
  auto_vip_monthly_threshold: number

  /** Descuento automático cuando el carrito supera N piezas o N pesos.
   *  Se aplica como sugerencia en SalesPage (el admin decide aplicarlo). */
  auto_discount_enabled: boolean
  auto_discount_min_items: number
  auto_discount_percent: number

  /** Mensaje personalizado que aparece en el ticket del cliente
   *  (debajo de los items, antes del total). Útil para promos
   *  temporales, advertencias, agradecimientos especiales. */
  custom_ticket_message_enabled: boolean
  custom_ticket_message: string

  /** Auto-cancelar apartados sin abono pasados N días.
   *  Solo afecta apartados con `paid = 0` (nunca tocados). */
  auto_cancel_idle_enabled: boolean
  auto_cancel_idle_days: number

  /** Cierra la ventana de venta fuera de horario (admin sigue siempre).
   *  Solo afecta al carrito del cliente público en /tienda. */
  business_hours_enabled: boolean
  business_hours_open: string // "09:00"
  business_hours_close: string // "21:00"

  /** Alerta diaria al admin cuando "por cobrar" del día supera el umbral.
   *  Se evalúa en el Dashboard al cargar; aparece en el banner superior. */
  daily_pending_alert_enabled: boolean
  daily_pending_alert_threshold: number

  /** Meta diaria de ventas en pesos. Cuando se alcanza, dispara una
   *  notificación (sólo una vez por día) tipo "milestone" para celebrar. */
  daily_sales_goal_enabled: boolean
  daily_sales_goal_amount: number

  /* ════════════════ MÓDULOS DEL CLIENTE (switcheables) ════════════════
   * Cada uno activa/desactiva una sección completa de la PWA del cliente.
   * Filosofía: decide qué ver el cliente. Si apaga uno, desaparece.
   * ═══════════════════════════════════════════════════════════════════════ */

  /** Módulo "Mis deseos" del cliente: petición de productos
   *  (catalogo o externos). Si está apagado, el FAB y la pestaña se ocultan. */
  wishes_enabled: boolean

  /** Stories del día (estilo Instagram dentro de la tienda).
   *  Pendiente de implementar. Toggle ya disponible para reservar el flag. */
  stories_enabled: boolean

  /** Reseñas con foto del cliente (dentro de cada producto, vista compacta).
   *  Pendiente de implementar. Toggle reservado. */
  reviews_enabled: boolean
  /** Si está activa, el cliente puede dejar reseña tan pronto como liquide
   *  el pedido (no espera a que se marque como entregado). Útil cuando hay
   *  pickup en tienda o pedidos pequeños que se llevan en el momento.
   *  Cuando está apagada (default), sólo aplica el flujo clásico:
   *  reseña habilitada al marcar delivery como 'delivered'. */
  reviews_on_paid_enabled: boolean
  /* ════════════════════════ MODO DIRECTO (sin fricción) ═══════════════════
   * Cuando Mari quiere operar SIN moderar nada — todo entra automático.
   * Útil para clientes confiables o eventos especiales. Cada hijo puede
   * activarse individualmente; `direct_mode_enabled` es atajo macro que
   * los enciende todos juntos. */

  /** Macro: activa los 3 auto-approve juntos. */
  direct_mode_enabled: boolean

  /** Cuando el cliente sube un comprobante, queda APROBADO de inmediato
   *  (sin esperar a Mari). El pago se aplica al balance al instante.
   *  ⚠️ Riesgo: fraudes. Úsalo solo con clientes verificados. */
  auto_approve_proofs: boolean

  /** Las reseñas con foto del cliente se publican directo sin que Mari
   *  apruebe. Si la regla `reviews_enabled` está apagada, esto no aplica. */
  auto_approve_reviews: boolean

  /** Las sugerencias / wishes del cliente entran como `accepted` directo
   *  (no se quedan en `pending`). Útil cuando confías en tu audiencia. */
  auto_accept_wishes: boolean

  /** Cliente puede cancelar su propio apartado desde el ticket público sin
   *  pedirle nada a Mari. Respeta `cancellation_grace_days` igual. */
  client_can_self_cancel: boolean

  /* ════════════════════════ APARIENCIA / TEMA ════════════════════════ */

  /** Color de acento (CSS variable --color-primary). Cambia el tono de
   *  botones, badges activos y elementos destacados de TODA la app. */
  theme_accent: "pink" | "violet" | "rose" | "amber" | "emerald" | "sky" | "indigo"

  /** Forzar dark mode a TODOS los usuarios. Anula la preferencia del SO
   *  y el toggle individual. Útil para fechas especiales (Halloween). */
  force_dark_mode: boolean

  /** Forzar light mode a TODOS los usuarios. Espejo de `force_dark_mode`.
   *  Si ambos están en true, gana `force_dark_mode` (más restrictivo).
   *  Útil para eventos diurnos / Día de las Madres / etc. */
  force_light_mode: boolean

  /** Modo festivo: pinta confetti en el header y un banner con el nombre
   *  del evento. Activa banderines de colores y emoji junto al logo. */
  holiday_mode_enabled: boolean
  holiday_mode_name: string // "Navidad 2026", "Halloween", "Buen Fin"
  holiday_mode_emoji: string // "🎄" "🎃" "💸"

  /* ════════════════════════ EXPERIENCIA CLIENTE ════════════════════════ */

  /** Mostrar al cliente el stock real del producto ("Solo quedan 3").
   *  Genera urgencia y FOMO. Si OFF, solo se ve "Agotado" cuando es 0. */
  show_stock_to_client: boolean

  /** Mostrar contador "X personas viendo esto" en cards (psicológico).
   *  Es un fake controlado server-side: muestra 2-8 al azar deterministica
   *  por producto. NO hace tracking real. */
  fake_viewers_enabled: boolean

  /** Animación de confetti al concretar venta o aprobar comprobante.
   *  Apágalo si el cliente prefiere experiencia sobria. */
  confetti_on_purchase: boolean

  /** Cliente DEBE iniciar sesión para ver precios del catálogo. Si
   *  navega anónimo solo ve el producto y un CTA "Inicia sesión para
   *  ver precio". Mata browsing casual pero captura emails. */
  hide_prices_until_login: boolean

  /** Requerir teléfono ANTES de cerrar la venta (no después). Si el
   *  cliente no lo tiene en perfil, se le pide en el carrito. */
  require_phone_to_buy: boolean

  /* ════════════════════════ MENSAJES PERSONALIZADOS ════════════════════════ */

  /** Sobreescribe los slides rotantes del hero. Si está vacío, usa el
   *  set default hardcodeado. Cada slide tiene título + subtítulo + acento.
   *  Mari edita esto desde el page de reglas. */
  welcome_slides_enabled: boolean
  welcome_slides: WelcomeSlide[]

  /** Calendario de promociones / fechas especiales que el cliente ve
   *  en /promociones. Pensado para anunciar eventos como Black Friday,
   *  días de cierre por inventario, lanzamientos, etc. */
  promo_calendar_enabled: boolean
  promo_events: PromoEvent[]

  /** Mensaje del banner superior anclado en la tienda. Se ve antes
   *  del catálogo. Ideal para anuncios temporales tipo
   *  "Cerrado por inventario el 25" o "Envío gratis hoy". */
  pinned_banner_enabled: boolean
  pinned_banner_message: string
  pinned_banner_tone: "info" | "warn" | "success" | "promo"

  /** Etiqueta extra para low-stock urgency. Default "Apúrate, solo quedan".
   *  Mari puede cambiar a "¡Últimas piezas!" o "Antes de que se acaben". */
  low_stock_label: string

  /* ════════════════════════ BADGES AUTOMÁTICOS ════════════════════════ */

  /** Cuántos días debe tener un producto (desde `created_at`) para
   *  considerarse "NUEVO" y mostrar el chip rosa "Nuevo" en su card.
   *  Pasado ese plazo el badge desaparece solo. Default 7. */
  new_badge_days: number

  /** Umbral mínimo de descuento (vs precio menudeo) para que aparezca
   *  el chip "OFERTA" + el porcentaje al lado del precio. Si pones 5,
   *  cualquier producto con descuento < 5% no muestra nada (evita ruido
   *  de descuentos diminutos). Default 5. */
  offer_min_discount_pct: number

  /* ════════════════════════ PROGRAMA DE PREMIOS ════════════════════════ */

  /** Master switch del sistema de puntos. Si está apagado, los triggers
   *  SQL siguen activos pero la UI cliente NO muestra puntos ni el botón
   *  de canje. Apagar es seguro: no pierde datos, solo oculta. */
  loyalty_enabled: boolean

  /** Cuántos pesos vale cada punto en el canje. Default 1 (1pt = $1).
   *  Permite valores fraccionales (ej. 0.5 = 2pts = $1). */
  loyalty_peso_por_punto: number

  /** Mínimo de puntos para poder canjear en una compra. Evita micro-
   *  canjeos (ej. canjear 5 puntos por $5 no vale la pena). Default 50. */
  loyalty_min_redeem: number

  /* ══════════════════════ AVISOS GLOBALES ══════════════════════
   * A diferencia de `pinned_banner_*` (que vive solo en el hero del
   * cliente), el AVISO global aparece como banner sticky arriba de TODA
   * la app: admin, cliente, tickets públicos. Útil para anunciar
   * mantenimiento, cierres parciales, problemas con un proveedor. */

  /** Master switch del aviso global. */
  announcement_enabled: boolean
  /** Texto del aviso. Máximo ~140 chars para que quepa en mobile. */
  announcement_text: string
  /** Tono visual: info (azul), warn (ámbar), success (verde), promo (rosa). */
  announcement_tone: "info" | "warn" | "success" | "promo"
  /** A quién se muestra. `all` = ambos, `client` = solo tienda pública,
   *  `admin` = solo admin/staff (recordatorios internos). */
  announcement_audience: "all" | "client" | "admin"
  /** Si true, el cliente NO puede descartarlo (siempre visible). Por
   *  defecto false: el cliente puede cerrarlo con × (localStorage 24h). */
  announcement_force_visible: boolean

  /* ═════════════════════ MODO VACACIONES ═════════════════════
   * Cuando Mari se ausenta. El catálogo sigue visible para que el
   * cliente vea productos, pero el botón de apartar/comprar queda
   * deshabilitado y aparece un mensaje con la fecha de retorno. */

  /** Master switch del modo vacaciones / tienda cerrada. */
  shop_closed_enabled: boolean
  /** Mensaje custom (ej. "Volvemos el 5 de enero"). Si vacío usa default. */
  shop_closed_message: string
  /** Fecha tentativa de retorno (YYYY-MM-DD). Opcional, se muestra si está. */
  shop_closed_until: string | null

  /* ═══════════════════ PACK DE EMPAQUE PREMIUM (opt-in) ═════════════════
   * Cliente puede pagar +$X por empaque bonito (caja + listón + tarjeta). */
  gift_wrap_enabled: boolean
  gift_wrap_price: number
  gift_wrap_label: string

  /* ═══════════════════ RETENCIÓN (opcional, opt-in) ═══════════════════
   * Features de retención que Mari puede activar/desactivar a
   * voluntad. Todas OFF por defecto para no asumir. */

  /** Banner "♻️ Repetir tu último pedido" en la Home cliente cuando
   *  hay un pedido pagado reciente. */
  reorder_banner_enabled: boolean
  /** Push automático al aniversario del primer apartado de cada
   *  cliente con mensaje + 15% off sugerido. */
  anniversary_push_enabled: boolean
  /** Push de carrito abandonado: 24h después de dejar 3+ piezas sin
   *  apartar, recuerda al cliente con un cupón dinámico. */
  abandoned_cart_enabled: boolean
}

/**
 * Slide individual del hero de la tienda. Mari puede editar título,
 * subtítulo y elegir un tema (define color/icono).
 */
export interface WelcomeSlide {
  title: string
  subtitle: string
  /** Tema visual: define el gradiente y el icono que acompaña. */
  theme:
    | "promo"      // fuchsia → pink
    | "mayoreo"    // amber → orange
    | "ticket"     // emerald → teal
    | "wishes"     // pink → purple
    | "stories"    // orange → rose
    | "reviews"    // amber → pink
    | "bienvenida" // violet → fuchsia
}

/**
 * Evento del calendario de promociones (Mari lo edita desde Reglas).
 * Pensado para anunciar al cliente fechas especiales: descuentos,
 * lanzamientos, días sin operación, eventos en tienda.
 */
export interface PromoEvent {
  id: string
  /** Fecha local (YYYY-MM-DD). Se interpreta sin zona — siempre día calendario. */
  date: string
  title: string
  description?: string | null
  /** Tono visual: define color del badge/card. */
  tone: "discount" | "launch" | "closed" | "event"
}

export const DEFAULT_RULES: BusinessRules = {
  claim_window_enabled: true,
  claim_window_hours: 24,

  force_tracking_foraneo: true,

  high_value_enabled: true,
  high_value_threshold: 5000,

  cancellation_grace_enabled: true,
  cancellation_grace_days: 3,

  no_cancel_after_payment_enabled: false,
  no_cancel_after_payment_hours: 24,

  no_refund: false,

  min_layaway_enabled: false,
  min_layaway_percent: 20,

  max_layaways_enabled: false,
  max_layaways_per_client: 3,

  stock_alert_enabled: true,
  stock_alert_threshold: 3,

  lock_edit_when_cycle_closed: false,

  // Nuevas
  block_oversell: true,
  preorder_discount_percent: 10,
  vip_extra_grace_enabled: false,
  vip_extra_grace_days: 2,
  auto_vip_enabled: false,
  auto_vip_monthly_threshold: 3000,
  auto_discount_enabled: false,
  auto_discount_min_items: 10,
  auto_discount_percent: 5,
  custom_ticket_message_enabled: false,
  custom_ticket_message: "¡Gracias por tu compra! Síguenos en Instagram @beautysme",
  auto_cancel_idle_enabled: false,
  auto_cancel_idle_days: 7,
  business_hours_enabled: false,
  business_hours_open: "09:00",
  business_hours_close: "21:00",
  daily_pending_alert_enabled: false,
  daily_pending_alert_threshold: 3000,

  daily_sales_goal_enabled: false,
  daily_sales_goal_amount: 5000,

  // Módulos del cliente
  wishes_enabled: true,
  stories_enabled: false,
  reviews_enabled: false,
  reviews_on_paid_enabled: false,

  // Modo directo (sin moderación) — todos OFF por seguridad
  direct_mode_enabled: false,
  auto_approve_proofs: false,
  auto_approve_reviews: false,
  auto_accept_wishes: false,
  client_can_self_cancel: false,

  // Apariencia
  theme_accent: "pink",
  force_dark_mode: false,
  force_light_mode: false,
  holiday_mode_enabled: false,
  holiday_mode_name: "",
  holiday_mode_emoji: "🎉",

  // Experiencia cliente
  show_stock_to_client: false,
  fake_viewers_enabled: false,
  confetti_on_purchase: true,
  hide_prices_until_login: false,
  require_phone_to_buy: false,

  // Mensajes personalizados
  welcome_slides_enabled: false,
  welcome_slides: [],
  promo_calendar_enabled: false,
  promo_events: [],
  pinned_banner_enabled: false,
  pinned_banner_message: "",
  pinned_banner_tone: "info",
  low_stock_label: "Apúrate, solo quedan",
  new_badge_days: 7,
  offer_min_discount_pct: 5,

  // Programa de Premios
  loyalty_enabled: false,
  loyalty_peso_por_punto: 1,
  loyalty_min_redeem: 50,

  // Avisos globales (OFF por defecto)
  announcement_enabled: false,
  announcement_text: "",
  announcement_tone: "info",
  announcement_audience: "all",
  announcement_force_visible: false,

  // Modo vacaciones (OFF por defecto)
  shop_closed_enabled: false,
  shop_closed_message: "",
  shop_closed_until: null,

  // Pack de empaque premium (OFF por defecto)
  gift_wrap_enabled: false,
  gift_wrap_price: 30,
  gift_wrap_label: "Envuelve para regalo (caja + listón + tarjeta)",

  // Retención opt-in — todas OFF por default
  reorder_banner_enabled: false,
  anniversary_push_enabled: false,
  abandoned_cart_enabled: false,
}

let cache: BusinessRules | null = null
const listeners = new Set<(r: BusinessRules) => void>()

function merge(raw: any): BusinessRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_RULES }
  return {
    claim_window_enabled: !!raw.claim_window_enabled,
    claim_window_hours: Number(raw.claim_window_hours) || DEFAULT_RULES.claim_window_hours,
    force_tracking_foraneo: !!raw.force_tracking_foraneo,
    high_value_enabled: !!raw.high_value_enabled,
    high_value_threshold: Number(raw.high_value_threshold) || DEFAULT_RULES.high_value_threshold,
    cancellation_grace_enabled: !!raw.cancellation_grace_enabled,
    cancellation_grace_days: Number(raw.cancellation_grace_days) || DEFAULT_RULES.cancellation_grace_days,
    no_cancel_after_payment_enabled: !!raw.no_cancel_after_payment_enabled,
    no_cancel_after_payment_hours:
      Number(raw.no_cancel_after_payment_hours) || DEFAULT_RULES.no_cancel_after_payment_hours,
    no_refund: !!raw.no_refund,
    min_layaway_enabled: !!raw.min_layaway_enabled,
    min_layaway_percent: Number(raw.min_layaway_percent) || DEFAULT_RULES.min_layaway_percent,
    max_layaways_enabled: !!raw.max_layaways_enabled,
    max_layaways_per_client:
      Number(raw.max_layaways_per_client) || DEFAULT_RULES.max_layaways_per_client,
    stock_alert_enabled: !!raw.stock_alert_enabled,
    stock_alert_threshold:
      Number(raw.stock_alert_threshold) || DEFAULT_RULES.stock_alert_threshold,
    lock_edit_when_cycle_closed: !!raw.lock_edit_when_cycle_closed,

    // Nuevas (con defaults si no existen aún en BD)
    block_oversell: raw.block_oversell ?? DEFAULT_RULES.block_oversell,
    preorder_discount_percent: Math.max(
      0,
      Math.min(
        50,
        Number(raw.preorder_discount_percent) ??
          DEFAULT_RULES.preorder_discount_percent,
      ),
    ),
    vip_extra_grace_enabled: !!raw.vip_extra_grace_enabled,
    vip_extra_grace_days: Number(raw.vip_extra_grace_days) || DEFAULT_RULES.vip_extra_grace_days,
    auto_vip_enabled: !!raw.auto_vip_enabled,
    auto_vip_monthly_threshold:
      Number(raw.auto_vip_monthly_threshold) || DEFAULT_RULES.auto_vip_monthly_threshold,
    auto_discount_enabled: !!raw.auto_discount_enabled,
    auto_discount_min_items: Number(raw.auto_discount_min_items) || DEFAULT_RULES.auto_discount_min_items,
    auto_discount_percent: Number(raw.auto_discount_percent) || DEFAULT_RULES.auto_discount_percent,
    custom_ticket_message_enabled: !!raw.custom_ticket_message_enabled,
    custom_ticket_message:
      typeof raw.custom_ticket_message === "string" && raw.custom_ticket_message.trim()
        ? raw.custom_ticket_message
        : DEFAULT_RULES.custom_ticket_message,
    auto_cancel_idle_enabled: !!raw.auto_cancel_idle_enabled,
    auto_cancel_idle_days: Number(raw.auto_cancel_idle_days) || DEFAULT_RULES.auto_cancel_idle_days,
    business_hours_enabled: !!raw.business_hours_enabled,
    business_hours_open:
      typeof raw.business_hours_open === "string" && /^\d{2}:\d{2}$/.test(raw.business_hours_open)
        ? raw.business_hours_open
        : DEFAULT_RULES.business_hours_open,
    business_hours_close:
      typeof raw.business_hours_close === "string" && /^\d{2}:\d{2}$/.test(raw.business_hours_close)
        ? raw.business_hours_close
        : DEFAULT_RULES.business_hours_close,
    daily_pending_alert_enabled: !!raw.daily_pending_alert_enabled,
    daily_pending_alert_threshold:
      Number(raw.daily_pending_alert_threshold) || DEFAULT_RULES.daily_pending_alert_threshold,

    daily_sales_goal_enabled: !!raw.daily_sales_goal_enabled,
    daily_sales_goal_amount:
      Number(raw.daily_sales_goal_amount) || DEFAULT_RULES.daily_sales_goal_amount,

    // Módulos del cliente (default según DEFAULT_RULES)
    wishes_enabled: raw.wishes_enabled ?? DEFAULT_RULES.wishes_enabled,
    stories_enabled: raw.stories_enabled ?? DEFAULT_RULES.stories_enabled,
    reviews_enabled: raw.reviews_enabled ?? DEFAULT_RULES.reviews_enabled,
    reviews_on_paid_enabled: !!raw.reviews_on_paid_enabled,

    // Modo directo
    direct_mode_enabled: !!raw.direct_mode_enabled,
    auto_approve_proofs: !!raw.auto_approve_proofs,
    auto_approve_reviews: !!raw.auto_approve_reviews,
    auto_accept_wishes: !!raw.auto_accept_wishes,
    client_can_self_cancel: !!raw.client_can_self_cancel,

    // Apariencia — el accent solo acepta un set fijo, sino fallback al default
    theme_accent: ((): BusinessRules["theme_accent"] => {
      const ok = new Set([
        "pink",
        "violet",
        "rose",
        "amber",
        "emerald",
        "sky",
        "indigo",
      ])
      const t = raw.theme_accent
      return (ok.has(t) ? t : DEFAULT_RULES.theme_accent) as BusinessRules["theme_accent"]
    })(),
    force_dark_mode: !!raw.force_dark_mode,
    force_light_mode: !!raw.force_light_mode,
    holiday_mode_enabled: !!raw.holiday_mode_enabled,
    holiday_mode_name:
      typeof raw.holiday_mode_name === "string" ? raw.holiday_mode_name : "",
    holiday_mode_emoji:
      typeof raw.holiday_mode_emoji === "string" && raw.holiday_mode_emoji.trim()
        ? raw.holiday_mode_emoji
        : DEFAULT_RULES.holiday_mode_emoji,

    // Experiencia cliente
    show_stock_to_client: !!raw.show_stock_to_client,
    fake_viewers_enabled: !!raw.fake_viewers_enabled,
    confetti_on_purchase: raw.confetti_on_purchase ?? DEFAULT_RULES.confetti_on_purchase,
    hide_prices_until_login: !!raw.hide_prices_until_login,
    require_phone_to_buy: !!raw.require_phone_to_buy,

    // Mensajes personalizados
    welcome_slides_enabled: !!raw.welcome_slides_enabled,
    welcome_slides: Array.isArray(raw.welcome_slides)
      ? (raw.welcome_slides as any[])
          .filter(
            (s) =>
              s &&
              typeof s.title === "string" &&
              typeof s.subtitle === "string",
          )
          .map((s) => ({
            title: String(s.title).slice(0, 80),
            subtitle: String(s.subtitle).slice(0, 140),
            theme: [
              "promo",
              "mayoreo",
              "ticket",
              "wishes",
              "stories",
              "reviews",
              "bienvenida",
            ].includes(s.theme)
              ? s.theme
              : "bienvenida",
          }))
      : [],
    promo_calendar_enabled: !!raw.promo_calendar_enabled,
    promo_events: Array.isArray(raw.promo_events)
      ? (raw.promo_events as any[])
          .filter(
            (e) =>
              e &&
              typeof e.date === "string" &&
              typeof e.title === "string",
          )
          .map((e) => ({
            id: typeof e.id === "string" ? e.id : crypto.randomUUID(),
            date: String(e.date).slice(0, 10),
            title: String(e.title).slice(0, 80),
            description: e.description ? String(e.description).slice(0, 240) : null,
            tone: ["discount", "launch", "closed", "event"].includes(e.tone)
              ? e.tone
              : "event",
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [],
    pinned_banner_enabled: !!raw.pinned_banner_enabled,
    pinned_banner_message:
      typeof raw.pinned_banner_message === "string"
        ? raw.pinned_banner_message
        : "",
    pinned_banner_tone: ["info", "warn", "success", "promo"].includes(
      raw.pinned_banner_tone,
    )
      ? raw.pinned_banner_tone
      : DEFAULT_RULES.pinned_banner_tone,
    low_stock_label:
      typeof raw.low_stock_label === "string" && raw.low_stock_label.trim()
        ? raw.low_stock_label
        : DEFAULT_RULES.low_stock_label,
    new_badge_days:
      Number.isFinite(Number(raw.new_badge_days)) && Number(raw.new_badge_days) > 0
        ? Math.min(365, Math.floor(Number(raw.new_badge_days)))
        : DEFAULT_RULES.new_badge_days,
    offer_min_discount_pct:
      Number.isFinite(Number(raw.offer_min_discount_pct)) &&
      Number(raw.offer_min_discount_pct) >= 0
        ? Math.min(99, Math.floor(Number(raw.offer_min_discount_pct)))
        : DEFAULT_RULES.offer_min_discount_pct,

    // Programa de Premios
    loyalty_enabled: !!raw.loyalty_enabled,
    loyalty_peso_por_punto:
      Number.isFinite(Number(raw.loyalty_peso_por_punto)) &&
      Number(raw.loyalty_peso_por_punto) > 0
        ? Number(raw.loyalty_peso_por_punto)
        : DEFAULT_RULES.loyalty_peso_por_punto,
    loyalty_min_redeem:
      Number.isFinite(Number(raw.loyalty_min_redeem)) &&
      Number(raw.loyalty_min_redeem) >= 0
        ? Math.floor(Number(raw.loyalty_min_redeem))
        : DEFAULT_RULES.loyalty_min_redeem,

    // Avisos globales
    announcement_enabled: !!raw.announcement_enabled,
    announcement_text:
      typeof raw.announcement_text === "string"
        ? raw.announcement_text.slice(0, 240)
        : "",
    announcement_tone: ["info", "warn", "success", "promo"].includes(
      raw.announcement_tone,
    )
      ? raw.announcement_tone
      : DEFAULT_RULES.announcement_tone,
    announcement_audience: ["all", "client", "admin"].includes(
      raw.announcement_audience,
    )
      ? raw.announcement_audience
      : DEFAULT_RULES.announcement_audience,
    announcement_force_visible: !!raw.announcement_force_visible,

    // Modo vacaciones
    shop_closed_enabled: !!raw.shop_closed_enabled,
    shop_closed_message:
      typeof raw.shop_closed_message === "string"
        ? raw.shop_closed_message.slice(0, 240)
        : "",
    shop_closed_until:
      typeof raw.shop_closed_until === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.shop_closed_until)
        ? raw.shop_closed_until
        : null,

    // Pack de empaque premium
    gift_wrap_enabled: !!raw.gift_wrap_enabled,
    gift_wrap_price:
      typeof raw.gift_wrap_price === "number" && raw.gift_wrap_price >= 0
        ? raw.gift_wrap_price
        : 30,
    gift_wrap_label:
      typeof raw.gift_wrap_label === "string" && raw.gift_wrap_label.trim()
        ? raw.gift_wrap_label.slice(0, 120)
        : DEFAULT_RULES.gift_wrap_label,

    // Retención
    reorder_banner_enabled: !!raw.reorder_banner_enabled,
    anniversary_push_enabled: !!raw.anniversary_push_enabled,
    abandoned_cart_enabled: !!raw.abandoned_cart_enabled,
  }
}

async function load(): Promise<BusinessRules> {
  if (cache) return cache
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "business_rules")
      .maybeSingle()
    cache = merge(data?.value)
  } catch {
    cache = { ...DEFAULT_RULES }
  }
  listeners.forEach((l) => l(cache!))
  return cache!
}

function applyIfChanged(next: BusinessRules): boolean {
  const before = cache ? JSON.stringify(cache) : ""
  const after = JSON.stringify(next)
  if (before === after) return false
  cache = next
  listeners.forEach((l) => l(cache!))
  return true
}

export async function saveBusinessRules(rules: BusinessRules): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "business_rules", value: rules, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  if (error) throw error
  applyIfChanged({ ...rules })
}

export function useBusinessRules(): BusinessRules {
  const [val, setVal] = useState<BusinessRules>(cache ?? DEFAULT_RULES)
  useEffect(() => {
    let alive = true
    if (!cache) {
      load().then((r) => alive && setVal(r))
    } else {
      setVal(cache)
    }
    const l = (r: BusinessRules) => {
      if (!alive) return
      setVal((prev) => (JSON.stringify(prev) === JSON.stringify(r) ? prev : r))
    }
    listeners.add(l)
    return () => {
      alive = false
      listeners.delete(l)
    }
  }, [])
  return computeEffectiveRules(val)
}

/**
 * Aplica reglas calculadas en runtime:
 *  - Modo vacaciones (`shop_closed_enabled`) se DESACTIVA solo si
 *    `shop_closed_until` ya pasó. Permite a Mari programar "cerrada
 *    hasta el 5 ene" y olvidarse: el día 6 reabre automático.
 */
function computeEffectiveRules(r: BusinessRules): BusinessRules {
  if (!r.shop_closed_enabled || !r.shop_closed_until) return r
  const until = new Date(r.shop_closed_until + "T23:59:59")
  if (Number.isFinite(until.getTime()) && Date.now() > until.getTime()) {
    return { ...r, shop_closed_enabled: false }
  }
  return r
}

/**
 * Helper síncrono para validar fuera de React (services, hooks).
 * Usa la caché — si aún no cargó devuelve DEFAULT_RULES.
 */
export function getBusinessRules(): BusinessRules {
  return computeEffectiveRules(cache ?? DEFAULT_RULES)
}

/** Pre-carga la caché al boot. Llámalo desde App.tsx. */
export function preloadBusinessRules(): Promise<BusinessRules> {
  return load()
}

/* ════════════════════════ HELPERS DE EVALUACIÓN ════════════════════════ */

export interface ClaimEligibility {
  allowed: boolean
  remainingMs: number
  reason?: string
}

/** ¿Puede el cliente abrir un reclamo para esta venta? */
export function canClaim(
  rules: BusinessRules,
  sale: { paid_at?: string | null; created_at: string; status: string }
): ClaimEligibility {
  if (!rules.claim_window_enabled) return { allowed: true, remainingMs: Infinity }
  if (sale.status === "cancelled") {
    return { allowed: false, remainingMs: 0, reason: "Venta cancelada" }
  }
  const start = new Date(sale.paid_at ?? sale.created_at).getTime()
  const limit = start + rules.claim_window_hours * 3600 * 1000
  const remaining = limit - Date.now()
  if (remaining <= 0) {
    return {
      allowed: false,
      remainingMs: 0,
      reason: `Cerrado · pasaron más de ${rules.claim_window_hours}h desde la entrega`,
    }
  }
  return { allowed: true, remainingMs: remaining }
}

/** ¿Puede el cliente o admin cancelar este apartado/venta? */
export function canCancelSale(
  rules: BusinessRules,
  sale: { created_at: string; paid?: number | null; status: string },
  opts: { isVip?: boolean } = {}
): { allowed: boolean; reason?: string } {
  if (sale.status === "cancelled") return { allowed: false, reason: "Ya cancelada" }
  if (sale.status === "paid") return { allowed: false, reason: "Pagada por completo" }

  if (rules.cancellation_grace_enabled) {
    const created = new Date(sale.created_at).getTime()
    let extraDays = 0
    if (rules.vip_extra_grace_enabled && opts.isVip) {
      extraDays = rules.vip_extra_grace_days
    }
    const limit = created + (rules.cancellation_grace_days + extraDays) * 24 * 3600 * 1000
    if (Date.now() > limit) {
      return {
        allowed: false,
        reason: `Pasaron más de ${rules.cancellation_grace_days + extraDays} días desde el apartado`,
      }
    }
  }
  if (rules.no_cancel_after_payment_enabled && (Number(sale.paid) || 0) > 0) {
    // simplificación: usamos created_at como proxy de "primer pago" si no
    // se conoce; el backend puede afinar esto con sales.payments[0].created_at.
    const created = new Date(sale.created_at).getTime()
    const limit = created + rules.no_cancel_after_payment_hours * 3600 * 1000
    if (Date.now() > limit) {
      return {
        allowed: false,
        reason: `No se puede cancelar después de ${rules.no_cancel_after_payment_hours}h del primer pago`,
      }
    }
  }
  return { allowed: true }
}

/** Formato humano de ms restantes. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Vencido"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h >= 1) return `${h}h ${m}m`
  return `${m}m`
}

/* ════════════════════════════════════════════════════════════════════
 * NUEVOS HELPERS (2026-06-17)
 * ════════════════════════════════════════════════════════════════════ */

/**
 * ¿Está la tienda dentro del horario comercial?
 * Si la regla está apagada, siempre devuelve true.
 * Tolerante a "cierre" después de medianoche (ej: 22:00 a 02:00 NO soportado
 * — para eso usar abierto siempre).
 */
export function isWithinBusinessHours(rules: BusinessRules, now = new Date()): boolean {
  if (!rules.business_hours_enabled) return true
  const [openH, openM] = rules.business_hours_open.split(":").map(Number)
  const [closeH, closeM] = rules.business_hours_close.split(":").map(Number)
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const openMin = openH * 60 + openM
  const closeMin = closeH * 60 + closeM
  if (closeMin <= openMin) return true // configuración inválida → no bloquear
  return minutesNow >= openMin && minutesNow < closeMin
}

/**
 * Calcula el descuento automático sugerido para un carrito según las reglas.
 * Devuelve 0 si no aplica.
 */
export function calculateAutoDiscount(
  rules: BusinessRules,
  cart: { totalItems: number; subtotal: number }
): { applies: boolean; amount: number; percent: number; reason: string } {
  if (!rules.auto_discount_enabled) {
    return { applies: false, amount: 0, percent: 0, reason: "" }
  }
  if (cart.totalItems < rules.auto_discount_min_items) {
    return {
      applies: false,
      amount: 0,
      percent: rules.auto_discount_percent,
      reason: `Faltan ${rules.auto_discount_min_items - cart.totalItems} piezas para ${rules.auto_discount_percent}% de descuento`,
    }
  }
  const amount = Math.round(cart.subtotal * (rules.auto_discount_percent / 100) * 100) / 100
  return {
    applies: true,
    amount,
    percent: rules.auto_discount_percent,
    reason: `${rules.auto_discount_percent}% por comprar ${cart.totalItems} piezas`,
  }
}

/**
 * Valida si una venta nueva supera el oversell permitido.
 * Devuelve un mensaje si NO se puede agregar; null si todo OK.
 */
export function validateStock(
  rules: BusinessRules,
  variant: { stock: number | null | undefined },
  requestedQty: number,
): string | null {
  if (!rules.block_oversell) return null
  const current = Number(variant.stock ?? 0)
  if (current <= 0) {
    return "Sin stock — la pre-venta está deshabilitada"
  }
  if (requestedQty > current) {
    return `Solo hay ${current} disponibles`
  }
  return null
}
