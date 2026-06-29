import { supabase } from "./supabase"
import { debug } from "./debug"

/**
 * Logger remoto best-effort: registra errores no-críticos del cliente
 * en una tabla `error_logs` de Supabase para visibilidad. Si la tabla
 * no existe o la inserción falla, cae silenciosamente.
 *
 * Tabla esperada (correr SQL si Mari quiere activarlo):
 *   create table error_logs (
 *     id uuid primary key default gen_random_uuid(),
 *     created_at timestamptz default now(),
 *     scope text,
 *     message text,
 *     stack text,
 *     user_email text,
 *     user_agent text,
 *     route text,
 *     extra jsonb
 *   );
 *   grant insert on error_logs to anon, authenticated;
 *   create policy "any_can_insert_error_logs" on error_logs
 *     for insert to anon, authenticated with check (true);
 *
 * Cap interno: 1 error / 10s por scope para no saturar la tabla cuando
 * algo se vuelve loop. Si se acumulan muchos en memoria sin enviar,
 * solo se queda con los últimos 50.
 */
interface RemoteErrorPayload {
  scope: string
  message: string
  stack?: string | null
  extra?: Record<string, unknown>
}

const lastSentByScope = new Map<string, number>()
const RATE_PER_SCOPE_MS = 10_000

export async function logErrorRemote(
  err: unknown,
  scope: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    const now = Date.now()
    const last = lastSentByScope.get(scope) ?? 0
    if (now - last < RATE_PER_SCOPE_MS) return // throttle por scope
    lastSentByScope.set(scope, now)

    const payload: RemoteErrorPayload = {
      scope,
      message: extractMessage(err),
      stack: extractStack(err),
      extra,
    }

    // Hidrata contexto extra: email del usuario y URL actual.
    let userEmail: string | null = null
    try {
      const { data } = await supabase.auth.getUser()
      userEmail = data.user?.email ?? null
    } catch {
      /* no auth disponible */
    }

    const row: Record<string, unknown> = {
      scope: payload.scope,
      message: payload.message,
      stack: payload.stack,
      user_email: userEmail,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : null,
      route: typeof window !== "undefined" ? window.location.pathname : null,
      extra: payload.extra ?? null,
    }

    const { error } = await supabase.from("error_logs").insert(row)
    if (error) {
      // Tabla no existe o RLS bloquea → silencio.
      debug.warn("[logger] insert error_logs falló:", error.message)
    }
  } catch (e: any) {
    debug.warn("[logger] excepción interna:", e?.message)
  }
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err).slice(0, 500)
  } catch {
    return String(err).slice(0, 500)
  }
}

function extractStack(err: unknown): string | null {
  if (err instanceof Error) return err.stack ?? null
  return null
}

/** Hook conveniente para ErrorBoundary: registra el error en remoto. */
export function logBoundaryError(
  error: Error,
  componentStack: string,
  scope: string,
): void {
  logErrorRemote(error, `boundary:${scope}`, { componentStack })
}
