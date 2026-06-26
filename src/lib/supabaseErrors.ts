/**
 * Traductor de errores de Supabase / Postgres / red a mensajes amigables
 * para la usuaria final (no técnicos). Centraliza toda la lógica para
 * que la app hable un mismo idioma cuando algo falla.
 *
 * Uso:
 *   try { ... }
 *   catch (e) { toast.error(translateError(e)) }
 *
 * O encadenado con react-hot-toast:
 *   toast.error(translateError(e, "No se pudo guardar el producto"))
 *
 * El segundo argumento es el "contexto" que se usa cuando no encontramos
 * un match específico — sirve para que el toast diga "No se pudo guardar
 * el producto" en vez del genérico "Ocurrió un error".
 *
 * Para el patrón loading→success/error completo, usa `toastAsync` desde
 * `./toast`.
 */

/** Detecta un objeto tipo PostgrestError o cualquier shape con .message/.code */
function getMessage(err: unknown): string {
  if (!err) return ""
  if (typeof err === "string") return err
  if (typeof err === "object") {
    const e = err as any
    return String(e?.message ?? e?.error_description ?? e?.error ?? e?.msg ?? "")
  }
  return String(err)
}

function getCode(err: unknown): string {
  if (!err || typeof err !== "object") return ""
  const e = err as any
  return String(e?.code ?? e?.status ?? "")
}

interface Rule {
  test: RegExp | ((msg: string, code: string) => boolean)
  message: string
}

/**
 * Reglas en orden de prioridad. La primera que matchee gana.
 * Mantén las más específicas arriba.
 */
const RULES: Rule[] = [
  // ────────── Auth ──────────
  { test: /invalid login credentials|invalid_grant/i,
    message: "Correo o contraseña incorrectos · intenta de nuevo 💖" },
  { test: /email not confirmed/i,
    message: "Tu correo aún no está confirmado · revisa tu bandeja (y el spam)." },
  { test: /user already registered|already registered/i,
    message: "Ya hay una cuenta con ese correo · mejor inicia sesión." },
  { test: /jwt expired|invalid jwt|jwt.*expired/i,
    message: "Tu sesión se durmió · inicia sesión otra vez." },
  { test: /password should be at least|weak.?password/i,
    message: "La contraseña es muy cortita · usa al menos 6 caracteres." },
  { test: /rate limit|too many requests/i,
    message: "Mucho tap muy rápido · dale 10 segundos e intenta otra vez." },
  { test: /email rate limit/i,
    message: "Esperaste muy poco entre correos · inténtalo en un minuto." },

  // ────────── Permisos / RLS ──────────
  { test: /permission denied|not authorized|forbidden|rls/i,
    message: "No tienes permiso para esa acción. Verifica tu sesión." },
  { test: /row.?level security/i,
    message: "Acción bloqueada por permisos de la base de datos." },

  // ────────── Conflictos / FK ──────────
  { test: /duplicate key|unique.?constraint/i,
    message: "Ya existe un registro con esos datos. Revisa nombres o SKU duplicados." },
  { test: /violates foreign key|foreign.?key.?constraint/i,
    message: "No se puede borrar: hay otros registros relacionados (ventas, abonos, etc.)." },
  { test: /not.?null.?constraint|null value in column/i,
    message: "Falta llenar un campo obligatorio." },
  { test: /check.?constraint/i,
    message: "Algún valor no cumple las reglas (precio negativo, formato inválido, etc.)." },

  // ────────── Schema / cache ──────────
  { test: /could not find the (column|function|table)/i,
    message: "Algo está desincronizado en el servidor. Recarga la página o avisa al administrador." },
  { test: /relation .* does not exist/i,
    message: "Esa función o tabla aún no existe en la base de datos. Avisa al administrador." },

  // ────────── Red / fetch ──────────
  { test: /failed to fetch|networkerror|network request failed/i,
    message: "Sin internet · revisa tu red y vuelve a intentar." },
  { test: /timeout|timed out|aborted/i,
    message: "El servidor tardó demasiado · vuelve a intentar." },
  { test: (_m, c) => c === "503",
    message: "El servidor está temporalmente saturado. Espera un momento." },
  { test: (_m, c) => c === "504",
    message: "El servidor tardó demasiado. Intenta de nuevo." },
  { test: (_m, c) => c === "429",
    message: "Hiciste muchas peticiones muy rápido. Espera unos segundos." },

  // ────────── Storage ──────────
  { test: /payload too large|file too large/i,
    message: "Esa foto pesa demasiado · bajemos calidad o usa una más ligera." },
  { test: /invalid.?mime|unsupported.?(file|media|format)/i,
    message: "Ese formato no lo soporto · usa JPG, PNG o WEBP." },
  { test: /storage.*not found|object.*not found/i,
    message: "No encuentro ese archivo · quizá ya fue borrado." },
  { test: /signed url|expired.*url/i,
    message: "El enlace caducó · recarga la página para uno nuevo." },

  // ────────── Stock / negocio (mensajes con personalidad Mari) ──────────
  { test: /insufficient stock|sin stock|out of stock/i,
    message: "¡Volaron esos tonos! · ya no hay stock disponible." },
  { test: /sale.*cancelled|venta.*cancelada/i,
    message: "Este pedido ya estaba cancelado." },
  { test: /payment.*already.*approved/i,
    message: "Ese comprobante ya fue aprobado antes · todo en orden." },
  { test: /(invalid|bad).*token|token.*invalid/i,
    message: "Ese enlace ya no es válido · pide uno nuevo a Mari." },

  // ────────── Genéricos por código HTTP ──────────
  { test: (_m, c) => c === "401",
    message: "Tu sesión expiró. Inicia sesión otra vez." },
  { test: (_m, c) => c === "403",
    message: "No tienes permiso para esa acción." },
  { test: (_m, c) => c === "404",
    message: "No se encontró el recurso solicitado." },
  { test: (_m, c) => c === "409",
    message: "Hay un conflicto con datos existentes." },
  { test: (_m, c) => c === "422",
    message: "Los datos enviados no son válidos." },
  { test: (_m, c) => /^5/.test(c),
    message: "El servidor tuvo un problema. Intenta más tarde." },
]

/**
 * Traduce cualquier error a mensaje amigable en español.
 * @param err  El error capturado (Supabase, Error, string, etc.)
 * @param fallback  Mensaje si nada coincide. Default: "Ocurrió un error inesperado."
 */
export function translateError(err: unknown, fallback?: string): string {
  const msg = getMessage(err)
  const code = getCode(err)
  if (!msg && !code) return fallback ?? "Ocurrió un error inesperado."

  for (const rule of RULES) {
    if (typeof rule.test === "function") {
      if (rule.test(msg, code)) return rule.message
    } else if (rule.test.test(msg)) {
      return rule.message
    }
  }

  // Mensajes "limpios" (no técnicos): los dejamos pasar tal cual
  // si son cortos y empiezan en mayúscula
  if (msg && msg.length < 120 && /^[A-ZÁÉÍÓÚÑ¡¿]/.test(msg) && !/[{}\[\]<>]/.test(msg)) {
    return msg
  }

  return fallback ?? "Ocurrió un error inesperado."
}
