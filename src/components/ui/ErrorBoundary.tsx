import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

interface Props {
  children: ReactNode
  /** Etiqueta que identifica esta zona en consola/telemetry. */
  scope?: string
  /** Fallback custom; si se omite usa el default bonito. */
  fallback?: (reset: () => void, error: Error) => ReactNode
  /** Hook opcional para telemetría (Sentry, log a Supabase, etc.). */
  onError?: (error: Error, info: ErrorInfo, scope: string) => void
  /** Si true, usa un fallback compacto (tarjeta) en vez de pantalla completa. */
  compact?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary genérico. Aísla un árbol de React para que si una vista
 * truena, NO se muera toda la app (white screen of death).
 * Ideal para envolver cada ruta lazy.
 *
 * No captura errores de event handlers ni de código async — sólo render.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const scope = this.props.scope ?? "root"
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${scope}]`, error, info.componentStack)
    // Telemetría opcional + evento global para que otros listeners (p.ej.
    // un mini-logger a Supabase) capturen sin acoplarse al componente.
    try {
      this.props.onError?.(error, info, scope)
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("mari:error-caught", {
            detail: { scope, message: error.message },
          }),
        )
      }
    } catch {
      /* nunca propagar errores del propio boundary */
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.reset, this.state.error)
      }
      // Compact: tarjeta pequeña que NO ocupa toda la pantalla. Para usar
      // dentro de páginas (un widget que truena sin tumbar la página).
      if (this.props.compact) {
        return (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10 p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-rose-700 dark:text-rose-200">
                No se pudo mostrar esta sección
              </p>
              <p className="text-[10px] font-bold text-rose-600/80 dark:text-rose-300/80 mt-0.5 line-clamp-2">
                {this.state.error.message || "Error desconocido"}
              </p>
            </div>
            <button
              type="button"
              onClick={this.reset}
              className="h-8 px-3 rounded-xl bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1 press shrink-0"
            >
              <RotateCw size={11} /> Reintentar
            </button>
          </div>
        )
      }
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-500/15 border border-rose-100 dark:border-rose-500/30 flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-rose-500 dark:text-rose-300" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-1">
            Algo falló al mostrar esta pantalla
          </h2>
          <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            No te preocupes, tus datos están seguros. Puedes intentar recargar
            esta sección o volver al inicio.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="h-11 px-5 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom press-hard"
            >
              <RotateCw size={12} /> Reintentar
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  window.location.href = "/"
                } catch {
                  this.reset()
                }
              }}
              className="h-11 px-5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest press"
            >
              Ir al inicio
            </button>
          </div>
          {import.meta.env.DEV && (
            <details className="mt-6 max-w-md text-left text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
              <summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-300">
                Detalles del error (modo desarrollo)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">
                {this.state.error.message}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
              </pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
