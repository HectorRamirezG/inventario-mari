import { type ReactNode } from "react"
import ErrorBoundary from "./ErrorBoundary"

interface Props {
  children: ReactNode
  /** Etiqueta para consola/telemetry (p.ej. "dashboard:insights"). */
  scope: string
}

/**
 * Wrapper liviano para aislar widgets dentro de una página. Si el widget
 * truena, NO tumba toda la página: muestra una tarjetita roja con botón
 * para reintentar. Pensado para piezas que hacen su propio fetch (gráficas,
 * paneles de inteligencia, KPIs costosos).
 *
 * Ejemplo:
 *   <SafeSection scope="dashboard:insights"><InsightsPanel /></SafeSection>
 */
export default function SafeSection({ children, scope }: Props) {
  return (
    <ErrorBoundary scope={scope} compact>
      {children}
    </ErrorBoundary>
  )
}
