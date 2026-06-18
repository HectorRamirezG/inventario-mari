/**
 * Web Push Notifications nativas — mini layer.
 *
 * Como Beauty's Me NO tiene backend para hacer push remoto (servidor que
 * envíe vía VAPID), por ahora cubrimos la versión "LOCAL" del Web Push:
 *   - El usuario otorga permiso al navegador
 *   - Cuando el realtime de Supabase recibe una notif, mostramos
 *     `new Notification(...)` que SÍ persiste en el systray del SO
 *     aunque el tab esté en background, siempre que el tab esté abierto
 *     o el service worker esté activo y la página sea PWA instalada.
 *
 * Para push REMOTO completo (notifs aunque la PWA esté cerrada del todo)
 * se requiere:
 *   1. Generar par de claves VAPID
 *   2. Endpoint en backend que reciba la suscripción y guarde en BD
 *   3. Cron/trigger que llame al Push API con las suscripciones
 * Eso queda para una iteración futura cuando haya servidor propio.
 *
 * Por ahora: pedimos permiso, registramos el service worker y dejamos
 * que `triggerLocalNotification` (en notificationsService.ts) muestre
 * la notif del SO cuando llegue un realtime push de Supabase.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  )
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported"
  return Notification.permission
}

/**
 * Pide permiso al navegador para mostrar notificaciones del sistema.
 * Devuelve true si fue concedido.
 *
 * Si el usuario ya lo había concedido o rechazado, no vuelve a preguntar.
 */
export async function ensurePushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false
  try {
    const result = await Notification.requestPermission()
    return result === "granted"
  } catch {
    return false
  }
}

/**
 * Registra el service worker (si no lo está) y deja el push listo
 * para recibir notificaciones del sistema operativo. Llamar una vez
 * al cargar la app para usuarios que ya activaron push.
 */
export async function registerPushSW(): Promise<void> {
  if (!isPushSupported()) return
  if (Notification.permission !== "granted") return
  try {
    // El SW principal lo registra vite-plugin-pwa. Aquí solo nos
    // aseguramos de que esté activo.
    await navigator.serviceWorker.ready
  } catch {
    /* noop */
  }
}
