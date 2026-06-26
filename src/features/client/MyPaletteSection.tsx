import { useEffect, useState } from "react"
import Palette from "lucide-react/dist/esm/icons/palette"
import Repeat from "lucide-react/dist/esm/icons/repeat"

import { useAuth } from "../../lib/useAuth"
import {
  getMyPurchaseProfile,
  estimateRefillDays,
  type PurchaseProfile,
  type PurchasedVariant,
} from "./purchaseProfileService"
import { formatRelative } from "../../lib/format"

/**
 * Sección "Mi paleta personal" del cliente: aparece en el ClientHomePage
 * (debajo del hero). Reúne 2 bloques en una sola card:
 *
 *   1. Paleta personal — grid con los 8 últimos tonos comprados.
 *   2. Para reordenar — productos cuyo refill estimado se acerca.
 *
 * El bloque "Combina con tu estilo" se quitó (Mari: catalogo chico,
 * dejaba solo 1 producto sugerido y no aportaba valor).
 *
 * Se auto-oculta si el cliente NO tiene historial de compras (evita
 * el "vacío deprimente" en clientas nuevas).
 */

export default function MyPaletteSection() {
  const { email } = useAuth()
  const [profile, setProfile] = useState<PurchaseProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!email) {
      setLoading(false)
      return
    }
    getMyPurchaseProfile(email)
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [email])

  if (loading) {
    return (
      <div className="rounded-3xl bg-slate-100 dark:bg-slate-800/40 h-32 animate-pulse" />
    )
  }
  if (!email || !profile || profile.variants.length === 0) return null

  const palette = profile.variants.slice(0, 8)
  const dueForRefill = profile.variants
    .filter((v) => {
      const days = estimateRefillDays(v)
      const since = Math.floor(
        (Date.now() - new Date(v.last_purchased_at).getTime()) /
          86_400_000,
      )
      // Avisamos cuando ya pasó el 70% del ciclo de refill
      return since >= Math.floor(days * 0.7)
    })
    .slice(0, 4)

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-pink-50/30 to-violet-50/30 dark:from-slate-900/60 dark:via-pink-500/5 dark:to-violet-500/5 overflow-hidden">
      <header className="px-4 pt-4 pb-2 flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-300 grid place-items-center shrink-0">
          <Palette size={14} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
            Tu paleta personal
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {profile.variants.length} tonos en tu historial ·{" "}
            {profile.total_orders} pedidos
          </p>
        </div>
      </header>

      {/* Paleta (grid horizontal) */}
      <div className="px-4 pb-3">
        <div className="overflow-x-auto scroll-container-ios">
          <div className="flex gap-2 pb-1">
            {palette.map((v) => (
              <PaletteSwatch key={v.variant_id} v={v} />
            ))}
          </div>
        </div>
      </div>

      {/* Reordenar */}
      {dueForRefill.length > 0 && (
        <div className="px-4 pb-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Repeat
              size={12}
              className="text-amber-600 dark:text-amber-300"
            />
            <p className="text-[10px] uppercase tracking-widest font-black text-amber-700 dark:text-amber-300">
              Quizás necesites reponer
            </p>
          </div>
          <div className="space-y-1.5">
            {dueForRefill.map((v) => {
              const days = estimateRefillDays(v)
              const since = Math.floor(
                (Date.now() -
                  new Date(v.last_purchased_at).getTime()) /
                  86_400_000,
              )
              return (
                <button
                  key={v.variant_id}
                  type="button"
                  className="w-full flex items-center gap-2 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 px-2 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-500/15 press text-left"
                  onClick={() => {
                    window.location.href = `/?variant=${v.variant_id}`
                  }}
                >
                  {v.image_url ? (
                    <img
                      src={v.image_url}
                      alt=""
                      className="w-9 h-9 rounded-lg object-cover bg-slate-200 dark:bg-slate-700 shrink-0"
                    />
                  ) : (
                    <span
                      className="w-9 h-9 rounded-lg shrink-0"
                      style={{
                        background: v.swatch_hex ?? "#cbd5e1",
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
                      {v.product_name}
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                      {v.variant_name} · ~{days}d entre compras · llevas {since}
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                    Reordenar →
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function PaletteSwatch({ v }: { v: PurchasedVariant }) {
  return (
    <button
      type="button"
      title={`${v.product_name} · ${v.variant_name} · ${formatRelative(v.last_purchased_at)}`}
      onClick={() => {
        window.location.href = `/?variant=${v.variant_id}`
      }}
      className="shrink-0 w-12 group press"
    >
      {v.image_url ? (
        <img
          src={v.image_url}
          alt=""
          loading="lazy"
          className="w-12 h-12 rounded-2xl object-cover border-2 border-white dark:border-slate-800 shadow-sm bg-slate-200 dark:bg-slate-700 group-hover:scale-110 transition-transform"
        />
      ) : (
        <span
          className="w-12 h-12 rounded-2xl border-2 border-white dark:border-slate-800 shadow-sm block group-hover:scale-110 transition-transform"
          style={{ background: v.swatch_hex ?? "#cbd5e1" }}
        />
      )}
      <p className="text-[8px] text-center text-slate-500 dark:text-slate-400 mt-1 truncate font-bold">
        {v.variant_name.split(" ")[0]}
      </p>
    </button>
  )
}
