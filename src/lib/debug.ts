/**
 * Logger silencioso en producción. Sólo activo cuando `import.meta.env.DEV`
 * es true (modo dev de Vite). Reemplaza los `console.log` huérfanos.
 *
 * Uso:
 *   import { debug } from "@/lib/debug"
 *   debug.log("Datos cargados", data)
 *   debug.warn("Advertencia")
 *   debug.error("Falló X", e)
 *
 * En producción los métodos son no-op para no inflar el bundle ni
 * expuesto datos en la consola del navegador del cliente.
 */

const isDev = import.meta.env.DEV

const noop = () => {}

export const debug = {
  log:   isDev ? console.log.bind(console)   : noop,
  info:  isDev ? console.info.bind(console)  : noop,
  warn:  isDev ? console.warn.bind(console)  : noop,
  error: isDev ? console.error.bind(console) : noop,
  group: isDev ? console.group.bind(console) : noop,
  groupEnd: isDev ? console.groupEnd.bind(console) : noop,
  time: isDev ? console.time.bind(console) : noop,
  timeEnd: isDev ? console.timeEnd.bind(console) : noop,
}

/** Útil dentro de useEffect para detectar memory leaks en dev. */
export function logMount(name: string) {
  if (!isDev) return
  debug.log(`[mount] ${name}`)
}
