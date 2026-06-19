import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, domAnimation } from 'framer-motion'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'

// --- One-shot cleanup del SW/caches viejos -----------------------------
// Hubo un deploy con URL de Supabase incorrecta hardcoded; el SW de esa
// versión sigue sirviendo bundles cacheados con esa URL. Esto purga
// todos los caches y desregistra service workers anteriores una sola
// vez, y guarda una bandera en localStorage para no repetir.
const SW_CLEAN_FLAG = 'mari-sw-cleaned-v1'
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (!localStorage.getItem(SW_CLEAN_FLAG)) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      Promise.all(regs.map(r => r.unregister()))
        .then(() => 'caches' in window ? caches.keys() : Promise.resolve([]))
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => {
          localStorage.setItem(SW_CLEAN_FLAG, '1')
          // Si había SWs activos, recarga una vez para servir el bundle fresco
          if (regs.length > 0) window.location.reload()
        })
        .catch(() => {/* ignoramos: limpieza es best-effort */})
    })
  }

  // Re-registrar SW limpio (tolerante a fallos)
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(err => console.warn('[PWA] registro deshabilitado:', err))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* LazyMotion + domAnimation: carga sólo las features básicas de
        framer-motion (~25kb gz en vez de ~80kb). Necesario `strict={false}`
        para mantener compatibilidad con componentes que usen `motion.*`
        directamente. Para usar `m.*` (variante optimizada) habría que
        migrar todos los componentes; por ahora preferimos el ahorro
        moderado sin refactor masivo. */}
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation} strict={false}>
        <App />
      </LazyMotion>
    </QueryClientProvider>
  </StrictMode>,
)
