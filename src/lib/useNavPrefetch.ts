import { useMemo } from "react"
import type { AdminSection } from "./adminNav"
import { queryClient } from "./queryClient"

// Set global anti-doble. Una vez que un asset+data se precargaron, no
// vale la pena repetirlo en el mismo session.
const warmed = new Set<AdminSection>()

/**
 * Mapa de loaders. Cada sección sabe:
 *   - `chunk`: el dynamic import del módulo (igual al que App.tsx usa
 *     con `lazy()`). Dispararlo precarga el JS antes de que el user
 *     haga el click real, eliminando el "salto" de Suspense.
 *   - `data`: función opcional que prefetcha datos a React Query.
 *     Solo definida para módulos que ya usan useQuery (Dashboard,
 *     Apartados). El resto se omite y solo precarga código.
 */
const LOADERS: Record<
  AdminSection,
  {
    chunk: () => Promise<unknown>
    data?: () => Promise<void>
  }
> = {
  hoy: {
    chunk: () => import("../features/dashboard/DashboardPage"),
    data: async () => {
      const { getDashboardStats } = await import(
        "../features/dashboard/dashboardService"
      )
      const { dashboardQueryKey } = await import(
        "../features/dashboard/useDashboard"
      )
      await queryClient.prefetchQuery({
        queryKey: dashboardQueryKey(30),
        queryFn: () => getDashboardStats(30),
        staleTime: 30_000,
      })
    },
  },
  pendientes: {
    chunk: () => import("../features/apartados/ApartadosPage"),
  },
  catalogo: { chunk: () => import("../features/inventory/InventoryPage") },
  caja: { chunk: () => import("../features/sales/SalesPage") },
  soporte: { chunk: () => import("../features/support/SupportPage") },
  sugerencias: { chunk: () => import("../features/wishes/WishAdminPage") },
  stories: { chunk: () => import("../features/stories/StoriesAdminPage") },
  resenias: { chunk: () => import("../features/reviews/ReviewsAdminPage") },
  ciclos: { chunk: () => import("../features/cycles/CyclesPage") },
  calculadora: { chunk: () => import("../features/pricing/PricingPage") },
  usuarios: { chunk: () => import("../features/users/UsersPage") },
  reglas: { chunk: () => import("../features/settings/BusinessRulesPage") },
  ajustes: { chunk: () => import("../features/settings/SettingsPage") },
}

/** Dispara prefetch (chunk + datos si aplica) para una sección admin. */
export function prefetchSection(section: AdminSection): void {
  if (warmed.has(section)) return
  warmed.add(section)
  const loader = LOADERS[section]
  if (!loader) return
  // Chunk: arranca a descargar inmediato. El navegador lo cachea.
  loader.chunk().catch(() => {
    // Si falla la red, permitimos un nuevo intento más tarde.
    warmed.delete(section)
  })
  // Datos: corre en paralelo, sin bloquear ni reventar el chunk.
  if (loader.data) {
    loader.data().catch(() => {
      /* silencio: prefetch es best-effort */
    })
  }
}

/**
 * Devuelve handlers para enganchar a un botón de navegación. Cuando el
 * usuario apenas pone el dedo encima (touch) o el cursor (hover), arranca
 * la descarga del módulo y de sus datos. Para cuando suelte el dedo y
 * dispare el click real, todo ya está caliente y la pantalla abre sin
 * spinner perceptible.
 */
export function useNavPrefetch(section: AdminSection) {
  return useMemo(() => {
    const trigger = () => prefetchSection(section)
    return {
      onMouseEnter: trigger,
      onTouchStart: trigger,
      onFocus: trigger,
    }
  }, [section])
}
