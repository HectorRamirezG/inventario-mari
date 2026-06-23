import { useState } from "react"
import { Send, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

import { useStoreInfo } from "../../lib/useStoreInfo"
import { shareUrl } from "../../lib/share"
import {
  buildDailyReportText,
  getDailyReport,
} from "./dailyReportService"

/**
 * Botón "1-click" que genera el resumen de HOY y lo comparte por
 * WhatsApp (Web Share en mobile, wa.me en desktop). Sin pantallas
 * intermedias: pide → genera → comparte.
 */
export default function DailyReportShareButton() {
  const [loading, setLoading] = useState(false)
  const { info: store } = useStoreInfo()

  async function handleClick() {
    if (loading) return
    setLoading(true)
    try {
      const report = await getDailyReport()
      const text = buildDailyReportText(report, store.name)
      // En mobile abre el sheet nativo de compartir (WhatsApp aparece como
      // app). En desktop o si no hay soporte, cae a wa.me con texto pre-llenado.
      const shared = await shareUrl({
        title: `Reporte ${report.prettyDate}`,
        text,
        url: "",
      })
      if (shared === "shared") {
        toast.success("Reporte compartido")
      } else if (shared === "copied") {
        toast.success("Texto copiado al portapapeles")
      } else {
        // Fallback duro: abrir WhatsApp web con el mensaje listo.
        const wa = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(wa, "_blank")
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el reporte")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="h-10 px-3 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform disabled:opacity-60"
      title="Generar resumen del día y compartir por WhatsApp"
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Send size={12} />
      )}
      Reporte HOY
    </button>
  )
}
