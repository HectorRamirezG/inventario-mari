import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Service worker con auto-update silencioso. El import es dinámico y
// tolerante a fallos: si el plugin no expone el módulo virtual (por una
// build mal configurada), la app se renderiza igual sin SW.
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(err => console.warn('[PWA] registro deshabilitado:', err))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
