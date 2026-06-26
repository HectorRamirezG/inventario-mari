import { useState, useRef, useMemo, useEffect } from "react"
import FileText from "lucide-react/dist/esm/icons/file-text"
import Printer from "lucide-react/dist/esm/icons/printer"
import Download from "lucide-react/dist/esm/icons/download"
import X from "lucide-react/dist/esm/icons/x"

import { shareTicketPdf } from "../../lib/shareImage"
import { formatMoney, formatDate, shortId } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { supabase } from "../../lib/supabase"
import { type DeliveryNote } from "./deliveryService"
import OverlayShell from "../../components/ui/OverlayShell"

/**
 * "Hoja del repartidor" — agregador imprimible/PDF que junta TODAS las
 * entregas activas (sent + picked_up) en una sola hoja. Reemplaza el
 * pdf-por-comanda cuando Mari quiere darle al repartidor un papel único
 * que pueda ir tachando.
 *
 * Flujo:
 *   1. Tap "Hoja del día" → abre overlay con preview.
 *   2. "Imprimir" usa window.print() (CSS print-only en index.css).
 *   3. "PDF" usa shareTicketPdf existente.
 *   4. Cierra; nada toca BD.
 */

interface Props {
  notes: DeliveryNote[]
  /**
   * Lookup customer name por sale_id. Opcional: si no se pasa, el
   * componente lo fetchea cuando se abre el overlay.
   */
  customerNameBySaleId?: Record<string, string | null>
  /** Tono visual del botón disparador */
  triggerVariant?: "primary" | "ghost"
}

export default function DriverSheetButton({
  notes,
  customerNameBySaleId,
  triggerVariant = "ghost",
}: Props) {
  const [open, setOpen] = useState(false)
  const [fetchedLookup, setFetchedLookup] = useState<Record<string, string | null>>(
    {},
  )
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const store = useMemo(() => getStoreInfo(), [])

  const visibleNotes = useMemo(() => {
    return notes
      .filter((n) => n.status === "sent" || n.status === "picked_up")
      .sort((a, b) => {
        const za = (a.delivery_zone ?? "").toLowerCase()
        const zb = (b.delivery_zone ?? "").toLowerCase()
        if (za !== zb) return za.localeCompare(zb)
        return (a.delivery_time_target ?? "").localeCompare(
          b.delivery_time_target ?? "",
        )
      })
  }, [notes])

  // Cuando se abre el overlay, fetch del lookup si no nos lo dieron.
  useEffect(() => {
    if (!open) return
    if (customerNameBySaleId) return
    const ids = Array.from(new Set(visibleNotes.map((n) => n.sale_id)))
    if (ids.length === 0) return
    supabase
      .from("sales")
      .select("id, customer_name, customer_phone, customer_address")
      .in("id", ids)
      .then(({ data }) => {
        const map: Record<string, string | null> = {}
        ;(data ?? []).forEach((s: any) => {
          map[s.id] = s.customer_name ?? null
        })
        setFetchedLookup(map)
      })
  }, [open, customerNameBySaleId, visibleNotes])

  const lookup = customerNameBySaleId ?? fetchedLookup

  const totals = useMemo(() => {
    const cash = visibleNotes.reduce(
      (s, n) => s + Number(n.amount_to_collect ?? 0),
      0,
    )
    return { cash, count: visibleNotes.length }
  }, [visibleNotes])

  const handlePdf = async () => {
    await shareTicketPdf({
      node: sheetRef.current,
      filename: `hoja-repartidor-${new Date().toISOString().slice(0, 10)}.pdf`,
    })
  }

  const handlePrint = () => {
    const node = sheetRef.current
    if (!node) return
    node.classList.add("print-target")
    document.body.classList.add("printing-driver-sheet")
    const cleanup = () => {
      node.classList.remove("print-target")
      document.body.classList.remove("printing-driver-sheet")
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    window.print()
  }

  const triggerCls =
    triggerVariant === "primary"
      ? "h-10 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom active:scale-95 transition-transform whitespace-nowrap disabled:opacity-50"
      : "h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 active:scale-95 transition-transform whitespace-nowrap disabled:opacity-50"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={visibleNotes.length === 0}
        className={triggerCls}
        title={
          visibleNotes.length === 0
            ? "No hay entregas activas"
            : `Hoja agregada con ${visibleNotes.length} entregas`
        }
      >
        <FileText size={12} />
        Hoja del día
        {visibleNotes.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/30 dark:bg-white/10 text-[9px]">
            {visibleNotes.length}
          </span>
        )}
      </button>

      <OverlayShell
        open={open}
        variant="sheet"
        onClose={() => setOpen(false)}
        panelClassName="rounded-t-3xl md:rounded-3xl bg-white dark:bg-slate-950 max-w-[860px] w-full max-h-[92vh] flex flex-col overflow-hidden shadow-xl mx-auto"
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-widest font-black text-amber-600 dark:text-amber-300">
              Hoja del repartidor
            </p>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
              {totals.count} entrega{totals.count !== 1 ? "s" : ""} ·{" "}
              {formatMoney(totals.cash)} a cobrar
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="h-10 px-3 rounded-xl bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press"
            >
              <Printer size={12} /> Imprimir
            </button>
            <button
              type="button"
              onClick={handlePdf}
              className="h-10 px-3 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press"
            >
              <Download size={12} /> PDF
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-500"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Preview (lo que se imprime / PDFéa) */}
        <div className="flex-1 overflow-y-auto scroll-container-ios bg-slate-100 dark:bg-slate-900 p-3 sm:p-6">
          <div
            ref={sheetRef}
            className="driver-sheet bg-white text-slate-900 mx-auto max-w-[780px] rounded-xl shadow-lg p-6 print:shadow-none print:rounded-none print:max-w-none"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            {/* Encabezado */}
            <header className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-4">
              <div>
                <h1 className="text-xl font-black leading-none">
                  {store.name || "Beauty's Me"}
                </h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-0.5">
                  Hoja de entregas · {formatDate(new Date().toISOString())}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">
                  Total a cobrar
                </p>
                <p className="text-2xl font-black tabular-nums">
                  {formatMoney(totals.cash)}
                </p>
                <p className="text-[9px] text-slate-500">
                  {totals.count} parada{totals.count !== 1 ? "s" : ""}
                </p>
              </div>
            </header>

            {/* Tabla */}
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 text-left uppercase tracking-widest">
                  <th className="py-2 pr-2 w-8">#</th>
                  <th className="py-2 pr-2 w-20">Folio</th>
                  <th className="py-2 pr-2">Cliente / Dirección</th>
                  <th className="py-2 pr-2 w-24">Teléfono</th>
                  <th className="py-2 pr-2 w-24 text-right">A cobrar</th>
                  <th className="py-2 pr-2 w-10 text-center">✓</th>
                </tr>
              </thead>
              <tbody>
                {visibleNotes.map((n, i) => (
                  <tr
                    key={n.id}
                    className="border-b border-slate-200 align-top"
                  >
                    <td className="py-2.5 pr-2 font-black tabular-nums">
                      {i + 1}
                    </td>
                    <td className="py-2.5 pr-2 font-mono text-[10px]">
                      {shortId(n.sale_id)}
                    </td>
                    <td className="py-2.5 pr-2">
                      <p className="font-black">
                        {lookup[n.sale_id] ?? "Cliente sin nombre"}
                      </p>
                      {n.delivery_zone && (
                        <p className="text-[10px] text-slate-500 italic">
                          Zona: {n.delivery_zone}
                        </p>
                      )}
                      {n.delivery_address && (
                        <p className="text-[10px] text-slate-700 leading-tight mt-0.5">
                          {n.delivery_address}
                        </p>
                      )}
                      {n.meeting_point && (
                        <p className="text-[10px] text-slate-700 italic mt-0.5">
                          Punto: {n.meeting_point}
                        </p>
                      )}
                      {n.delivery_time_target && (
                        <p className="text-[10px] font-black text-amber-700 mt-0.5">
                          ⏱ {n.delivery_time_target}
                        </p>
                      )}
                      {n.notes && (
                        <p className="text-[10px] text-rose-700 italic mt-0.5">
                          ⚠ {n.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 tabular-nums">
                      {n.driver_phone ?? "—"}
                    </td>
                    <td className="py-2.5 pr-2 text-right font-black tabular-nums">
                      {Number(n.amount_to_collect ?? 0) > 0
                        ? formatMoney(n.amount_to_collect)
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-2 text-center">
                      <span className="inline-block w-5 h-5 border-2 border-slate-900 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900">
                  <td
                    colSpan={4}
                    className="pt-3 font-black uppercase tracking-widest text-[10px]"
                  >
                    Total efectivo a entregar
                  </td>
                  <td className="pt-3 text-right font-black text-base tabular-nums">
                    {formatMoney(totals.cash)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>

            {/* Pie de firmas */}
            <footer className="mt-8 grid grid-cols-2 gap-6 text-[10px]">
              <div>
                <div className="border-t border-slate-400 pt-1.5 text-center">
                  Firma repartidor
                </div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1.5 text-center">
                  Firma {store.name || "tienda"}
                </div>
              </div>
            </footer>

            <p className="text-[9px] text-slate-400 text-center mt-4 italic">
              Generado el {formatDate(new Date().toISOString())} ·{" "}
              {store.name || "Beauty's Me"}
            </p>
          </div>
        </div>

        <div className="px-5 py-2 text-[10px] text-slate-500 text-center border-t border-slate-100 dark:border-slate-800 shrink-0">
          Vista previa. Imprime o exporta a PDF para entregar al repartidor.
        </div>
      </OverlayShell>
    </>
  )
}
