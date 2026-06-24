import Skeleton from "./Skeleton"

/**
 * Skeletons específicos por módulo. Reemplazan al `<Skeleton>` genérico
 * gris/cuadrado por shapes que reflejan el card real, dando una sensación
 * de carga más rápida y predecible (no hay "salto" de layout cuando el
 * contenido aparece). Cada componente expone un único `count` prop para
 * el caller controle cuántos esqueletos pintar.
 */

interface CountProps {
  /** Cuántas tarjetas pintar. Default 3. */
  count?: number
}

/**
 * Esqueleto del card de venta en `ApartadosPage`. Imita avatar + nombre +
 * status pill + meta + barra de progreso + monto.
 */
export function SaleCardSkeleton({ count = 3 }: CountProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 p-4 space-y-3"
        >
          {/* fila 1: avatar + nombre + status */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0" rounded="full" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <Skeleton className="h-3.5 w-32" rounded="full" />
              <Skeleton className="h-2.5 w-20" rounded="full" />
            </div>
            <Skeleton className="h-6 w-16" rounded="full" />
          </div>
          {/* fila 2: barra de progreso */}
          <Skeleton className="h-1.5 w-full" rounded="full" />
          {/* fila 3: monto + actions */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" rounded="md" />
            <div className="flex gap-1.5">
              <Skeleton className="h-7 w-7" rounded="lg" />
              <Skeleton className="h-7 w-7" rounded="lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Esqueleto del card de movimiento en `MovementHistoryPage`. Imita
 * icono + descripción + delta + timestamp.
 */
export function MovementCardSkeleton({ count = 4 }: CountProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 p-3 flex items-center gap-3"
        >
          <Skeleton className="h-10 w-10 shrink-0" rounded="lg" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-40" rounded="full" />
            <Skeleton className="h-2.5 w-28" rounded="full" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <Skeleton className="h-4 w-12" rounded="md" />
            <Skeleton className="h-2 w-16" rounded="full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Esqueleto del card de reporte/comprobante. Imita thumbnail + monto +
 * status pill + acciones.
 */
export function ReportCardSkeleton({ count = 3 }: CountProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 p-3 flex gap-3"
        >
          <Skeleton className="h-16 w-16 shrink-0" rounded="lg" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24" rounded="full" />
              <Skeleton className="h-5 w-16" rounded="full" />
            </div>
            <Skeleton className="h-2.5 w-32" rounded="full" />
            <Skeleton className="h-2 w-20" rounded="full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Esqueleto de fila de inventario (LowStockView). Imita imagen +
 * nombre + variante + stock + indicador.
 */
export function StockRowSkeleton({ count = 5 }: CountProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 p-3 flex items-center gap-3"
        >
          <Skeleton className="h-12 w-12 shrink-0" rounded="lg" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-36" rounded="full" />
            <Skeleton className="h-2.5 w-24" rounded="full" />
          </div>
          <Skeleton className="h-6 w-10" rounded="md" />
        </div>
      ))}
    </div>
  )
}

/**
 * Esqueleto del card de un wish/pedido futuro (WishAdminPage / MyWishesPage).
 * Refleja la card real: thumbnail 24x24, padding p-3, info-flow vertical.
 */
export function WishCardSkeleton({ count = 3 }: CountProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 p-3"
        >
          <div className="flex gap-3">
            <Skeleton className="h-24 w-24 shrink-0" rounded="lg" />
            <div className="flex-1 min-w-0 space-y-1.5 py-1">
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-4 w-32" rounded="full" />
                <Skeleton className="h-5 w-16 shrink-0" rounded="full" />
              </div>
              <div className="flex gap-1.5 mt-1">
                <Skeleton className="h-4 w-12" rounded="md" />
                <Skeleton className="h-4 w-14" rounded="md" />
              </div>
              <Skeleton className="h-2.5 w-40" rounded="full" />
              <Skeleton className="h-2 w-24" rounded="full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
