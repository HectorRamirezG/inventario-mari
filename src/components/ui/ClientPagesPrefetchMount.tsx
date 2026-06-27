import { useEffect } from "react"
import { useAuth } from "../../lib/useAuth"
import { preloadOnIdle } from "../../lib/preloadOnIdle"

/**
 * Pre-carga en idle los chunks de las páginas más visitadas del shell
 * cliente, una vez que el usuario está logueado. Reduce la latencia
 * del primer tap en el dock — el chunk ya está en RAM.
 *
 * Se dispara una sola vez por sesión. NO bloquea el render del shell.
 *
 * Pages cubiertas: /mis-pedidos (alta prioridad), /mis-deseos,
 * /mis-premios, /mi-monedero, /mis-trofeos.
 */
export default function ClientPagesPrefetchMount() {
  const { session, email } = useAuth()

  useEffect(() => {
    if (!session || !email) return
    // /mis-pedidos primero — es la página #1 después de comprar.
    preloadOnIdle(() => import("../../features/client/ClientOrdersPage"))
    preloadOnIdle(() => import("../../features/wishes/MyWishesPage"))
    preloadOnIdle(() => import("../../features/loyalty/MyRewardsPage"))
    preloadOnIdle(() => import("../../features/wallet/MyWalletPage"))
    preloadOnIdle(() => import("../../features/loyalty/MyTrophiesPage"))
  }, [session, email])

  return null
}
