import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Plus from "lucide-react/dist/esm/icons/plus"
import Trash2 from "lucide-react/dist/esm/icons/trash-2"
import Star from "lucide-react/dist/esm/icons/star"
import Home from "lucide-react/dist/esm/icons/home"
import Check from "lucide-react/dist/esm/icons/check"
import MapPin from "lucide-react/dist/esm/icons/map-pin"

import {
  listMyAddresses,
  saveAddress,
  deleteAddress,
  setPrimary,
  newAddress,
  autoMigrateLegacyAddress,
  type SavedAddress,
} from "./addressBookService"
import { useAuth } from "../../lib/useAuth"
import { toastAsync, toastSuccess } from "../../lib/toast"
import { confirmAction } from "../../lib/confirm"
import SmartLocationInput from "../../components/ui/SmartLocationInput"

/**
 * Selector de direcciones guardadas.
 *
 *   - Si NO está logueado: cae al SmartLocationInput legacy (texto plano).
 *   - Si SÍ está logueado: chips horizontales (Casa, Oficina, Mamá…) +
 *     "+ Nueva". Al tap, se selecciona y dispara `onChange`.
 *   - Al expandir "+ Nueva" abre form inline con label + address + mapa.
 *
 * Composable: si el padre quiere usarlo como reemplazo total del input
 * de dirección, pasa `mode="picker"`. Si solo quiere mostrar el catálogo
 * (settings de cliente), pasa `mode="manage"`.
 */

interface PickerProps {
  mode: "picker"
  /** Dirección actualmente seleccionada (libre, no necesariamente del catálogo). */
  address: string
  onAddressChange: (v: string) => void
  locationUrl: string
  onLocationUrlChange: (v: string) => void
}

interface ManageProps {
  mode: "manage"
}

type Props = PickerProps | ManageProps

export default function SavedAddressesSelector(props: Props) {
  const { email: authEmail } = useAuth()
  const email = authEmail ?? ""
  const [list, setList] = useState<SavedAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SavedAddress | null>(null)

  const load = async () => {
    if (!email) {
      setLoading(false)
      return
    }
    await autoMigrateLegacyAddress(email)
    const data = await listMyAddresses(email)
    setList(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  /* Modo picker (en checkout): si no hay sesión, mostramos solo el input
     legacy para no romper el flujo de invitado. */
  if (props.mode === "picker" && !email) {
    return (
      <SmartLocationInput
        address={props.address}
        onAddressChange={props.onAddressChange}
        locationUrl={props.locationUrl}
        onLocationUrlChange={props.onLocationUrlChange}
      />
    )
  }

  const handleSelect = (addr: SavedAddress) => {
    if (props.mode !== "picker") return
    props.onAddressChange(addr.address)
    props.onLocationUrlChange(addr.location_url ?? "")
    toastSuccess(`Usando: ${addr.label}`)
  }

  const handleSave = async () => {
    if (!editing) return
    if (!editing.label.trim() || !editing.address.trim()) {
      return toastSuccess("Falta etiqueta o dirección")
    }
    const next = await toastAsync(saveAddress(email, editing), {
      loading: "Guardando…",
      success: "Dirección guardada",
      error: "No se pudo guardar",
    })
    setList(next)
    setEditing(null)
    if (props.mode === "picker") handleSelect(editing)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirmAction({
      title: "Eliminar dirección",
      message: "Se borra de tu agenda.",
      confirmLabel: "Eliminar",
      tone: "danger",
    })
    if (!ok) return
    const next = await toastAsync(deleteAddress(email, id), {
      loading: "Eliminando…",
      success: "Eliminada",
      error: "No se pudo eliminar",
    })
    setList(next)
  }

  const handleSetPrimary = async (id: string) => {
    const next = await toastAsync(setPrimary(email, id), {
      loading: "Marcando…",
      success: "Marcada como principal",
      error: "No se pudo actualizar",
    })
    setList(next)
  }

  /* ─────────── Render ─────────── */
  return (
    <div className="space-y-2">
      {!loading && list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {list.map((a) => {
            const selected =
              props.mode === "picker" && props.address === a.address
            return (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  props.mode === "picker" ? handleSelect(a) : null
                }
                className={`group relative px-3 h-10 rounded-2xl border text-[11px] font-black flex items-center gap-1.5 press transition-all ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
                }`}
              >
                {a.is_primary && (
                  <Star
                    size={11}
                    fill="currentColor"
                    className="text-amber-500"
                  />
                )}
                <Home size={11} className="opacity-60" />
                <span className="truncate max-w-[100px]">{a.label}</span>
                {selected && (
                  <Check size={11} className="text-primary shrink-0" />
                )}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setEditing(newAddress())}
            className="px-3 h-10 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-black text-slate-500 dark:text-slate-400 flex items-center gap-1.5 press"
          >
            <Plus size={12} /> Nueva
          </button>
        </div>
      )}

      {!loading && list.length === 0 && (
        <button
          type="button"
          onClick={() => setEditing(newAddress())}
          className="w-full h-12 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 press"
        >
          <Plus size={14} /> Guardar mi primera dirección
        </button>
      )}

      {/* Formulario inline */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl border border-primary/30 bg-primary/5 p-3 space-y-2 overflow-hidden"
          >
            <p className="text-[10px] uppercase tracking-widest font-black text-primary flex items-center gap-1.5">
              <MapPin size={11} />
              {list.some((a) => a.id === editing.id)
                ? "Editar dirección"
                : "Nueva dirección"}
            </p>
            <input
              type="text"
              value={editing.label}
              onChange={(e) =>
                setEditing({ ...editing, label: e.target.value })
              }
              maxLength={32}
              placeholder="Casa, Oficina, Mamá…"
              className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold dark:text-slate-100 placeholder:text-slate-400"
            />
            <SmartLocationInput
              address={editing.address}
              onAddressChange={(v) => setEditing({ ...editing, address: v })}
              locationUrl={editing.location_url ?? ""}
              onLocationUrlChange={(v) =>
                setEditing({ ...editing, location_url: v })
              }
            />
            <input
              type="text"
              value={editing.notes ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, notes: e.target.value })
              }
              maxLength={120}
              placeholder="Notas (tocar 2 veces, casa azul…)"
              className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] dark:text-slate-100 placeholder:text-slate-400"
            />
            <label className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={!!editing.is_primary}
                onChange={(e) =>
                  setEditing({ ...editing, is_primary: e.target.checked })
                }
                className="w-4 h-4 accent-primary"
              />
              <span className="font-bold text-slate-600 dark:text-slate-300">
                Es mi dirección principal
              </span>
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 h-10 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest shadow-bloom"
              >
                Guardar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modo manage: lista expandida con acciones */}
      {props.mode === "manage" && !loading && list.length > 0 && (
        <div className="space-y-1.5 mt-1">
          {list.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-2.5 flex items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                  {a.is_primary && (
                    <Star
                      size={11}
                      fill="currentColor"
                      className="text-amber-500"
                    />
                  )}
                  {a.label}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {a.address}
                </p>
              </div>
              {!a.is_primary && (
                <button
                  type="button"
                  onClick={() => handleSetPrimary(a.id)}
                  className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 grid place-items-center"
                  title="Marcar como principal"
                >
                  <Star size={11} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(a)}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 grid place-items-center text-[10px] font-black"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-500 grid place-items-center"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
