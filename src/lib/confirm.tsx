import { createRoot, type Root } from "react-dom/client"
import ConfirmDialog from "../components/ui/ConfirmDialog"

/**
 * Reemplazo imperativo de `window.confirm()` que muestra el componente
 * `ConfirmDialog` (con estética y dark mode de la app) y resuelve una
 * promesa con `true`/`false`.
 *
 *   if (await confirmAction({ title: "¿Borrar producto?", tone: "danger" })) {
 *     await deleteProduct(id)
 *   }
 *
 * Internamente monta un root React efímero, lo muestra, y lo desmonta
 * al cerrar. No requiere agregar nada al árbol principal de la app.
 */

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: "danger" | "primary"
}

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false)
      return
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)

    const finish = (value: boolean) => {
      // Cerramos suavemente (la animación exit del AnimatePresence corre)
      render(false)
      setTimeout(() => {
        root.unmount()
        host.remove()
        resolve(value)
      }, 220)
    }

    function render(open: boolean) {
      root.render(
        <ConfirmDialog
          open={open}
          title={opts.title}
          description={opts.description}
          confirmLabel={opts.confirmLabel}
          cancelLabel={opts.cancelLabel}
          tone={opts.tone}
          onConfirm={() => finish(true)}
          onCancel={() => finish(false)}
        />,
      )
    }

    render(true)
  })
}
