import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"
import {
  X,
  Loader2,
  Wallet,
  Send,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { sound } from "../../lib/sound"
import { formatMoney } from "../../lib/format"
import type { Sale, SaleItem } from "../../types/database"
import { previewCascade, toCascadeLine, type CascadeLine } from "./saleCascade"
import { getPricingConfig } from "../pricing/pricingConfigService"
import type { PricingConfig } from "../pricing/pricingTypes"
import { notifyClient } from "../notifications/notificationsService"

interface Props {
  open: boolean
  sale: Sale | null
  onClose: () => void
  onSaved: () => void
}

type Tier = "menudeo" | "medio" | "mayoreo"
const TIER_LIST: Tier[] = ["menudeo", "medio", "mayoreo"]
const TIER_LABEL: Record<Tier, string> = {
  menudeo: "Menudeo",
  medio: "Medio mayoreo",
  mayoreo: "Mayoreo",
}

interface PricedItem extends SaleItem {
  price_menudeo: number | null
  price_medio: number | null
  price_mayoreo: number | null
  _removed?: boolean
}

export default function EditSaleAdjustModal({
  open,
  sale,
  onClose,
  onSaved,
}: Props) {
  const [items, setItems] = useState<PricedItem[]>([])
  const [originalItems, setOriginalItems] = useState<PricedItem[]>([])
  const [adjustment, setAdjustment] = useState<number | "">("")
  const [adjustSign, setAdjustSign] = useState<"discount" | "charge">("discount")
  const [reason, setReason] = useState("")
  const [loadingItems, setLoadingItems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState<PricingConfig | null>(null)

  useEffect(() => {
    getPricingConfig().then(setCfg).catch(() => setCfg(null))
  }, [])

  useEffect(() => {
    if (!open || !sale) return
    const initialAdj = Number(sale.adjustment_amount) || 0
    setAdjustSign(initialAdj < 0 ? "charge" : "discount")
    setAdjustment(initialAdj !== 0 ? Math.abs(initialAdj) : "")
    setReason(sale.adjustment_reason ?? "")
    setItems([])
    loadItems(sale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id])

  async function loadItems(s: Sale) {
    setLoadingItems(true)
    try {
      const { data: rawItems, error } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", s.id)
        .order("id")
      if (error) throw error
      const baseItems = (rawItems ?? []) as SaleItem[]
      const variantIds = baseItems
        .map((i) => i.variant_id)
        .filter((v): v is string => !!v)
      if (variantIds.length === 0) {
        setItems(baseItems.map((i) => fillEmptyPrices(i)))
        return
      }
      const { data: variants } = await supabase
        .from("variants")
        .select("id, price_menudeo, price_medio, price_mayoreo")
        .in("id", variantIds)
      const vmap = new Map(
        (variants ?? []).map((v: any) => [v.id, v])
      )
      const enriched: PricedItem[] = baseItems.map((i) => {
        const v: any = i.variant_id ? vmap.get(i.variant_id) : null
        return {
          ...i,
          price_menudeo: Number(v?.price_menudeo) || null,
          price_medio: Number(v?.price_medio) || null,
          price_mayoreo: Number(v?.price_mayoreo) || null,
        }
      })
      setItems(enriched)
      setOriginalItems(enriched.map((it) => ({ ...it })))
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar las líneas")
    } finally {
      setLoadingItems(false)
    }
  }

  function fillEmptyPrices(i: SaleItem): PricedItem {
    return { ...i, price_menudeo: null, price_medio: null, price_mayoreo: null }
  }

  function setLineTier(item: PricedItem, tier: Tier) {
    const price =
      tier === "menudeo"
        ? item.price_menudeo
        : tier === "medio"
        ? item.price_medio
        : item.price_mayoreo
    if (!price || price <= 0) {
      toast.error(`No hay precio ${tier} configurado para "${item.variant_name}"`)
      return
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, tier, unit_price: price } : it
      )
    )
  }

  function setLineQty(item: PricedItem, qty: number) {
    if (qty < 1) return
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, qty } : it))
    )
  }

  function toggleRemove(item: PricedItem) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, _removed: !it._removed } : it
      )
    )
  }

  function resetLines() {
    if (sale) loadItems(sale)
  }

  /* ---------- Vista previa en cascada ---------- */
  const cascade = useMemo(() => {
    if (!sale || !cfg || originalItems.length === 0) return null
    const orig = originalItems.map((it) => toCascadeLine(it, it))
    const mod = items.map((it) => ({
      ...toCascadeLine(it, it),
      _removed: it._removed,
    }))
    return previewCascade(
      {
        adjustment_amount: adjustSign === "discount" ? Number(adjustment) || 0 : -(Number(adjustment) || 0),
        shipping_amount: sale.shipping_amount,
        paid: sale.paid,
      },
      orig,
      mod,
      cfg
    )
  }, [sale, cfg, items, originalItems, adjustment, adjustSign])

  const tierChanged = cascade && cascade.newTier !== cascade.oldTier

  /* ---------- Cálculo del nuevo subtotal y signed adjustment ---------- */
  const newSubtotal = cascade?.newSubtotal ?? 0
  const signedAdj = useMemo(() => {
    const n = Number(adjustment) || 0
    return adjustSign === "discount" ? n : -n
  }, [adjustment, adjustSign])
  const projectedTotal = cascade?.newTotal ?? Math.max(0, newSubtotal - signedAdj)

  async function handleSave() {
    if (!sale) return
    setSaving(true)
    const tid = toast.loading("Aplicando cambios...")
    try {
      // Si hay alguna modificación en items (qty, tier, unit_price, removed)
      // disparamos el flujo en cascada manual: UPDATE/DELETE de sale_items
      // + apply_movement('devolucion') por cada unidad devuelta
      // + UPDATE de sales (total, balance, status).
      const repriced = cascade?.lines ?? items.filter((i) => !i._removed)
      const removed = items.filter((i) => i._removed)

      const original = originalItems
      const updates = repriced.filter((it) => {
        const o = original.find((x) => x.id === it.id)
        if (!o) return true
        return (
          Number(o.qty) !== Number(it.qty) ||
          Number(o.unit_price) !== Number(it.unit_price) ||
          o.tier !== it.tier
        )
      })

      // 1) UPDATE de líneas modificadas
      for (const it of updates) {
        const profit =
          (Number(it.unit_price) - Number(it.cost_snapshot)) * Number(it.qty)
        const { error } = await supabase
          .from("sale_items")
          .update({
            qty: it.qty,
            unit_price: it.unit_price,
            tier: it.tier,
            profit,
          })
          .eq("id", it.id)
        if (error) throw error
      }

      // 2) DELETE de líneas removidas + restock
      for (const it of removed) {
        const { error: delErr } = await supabase
          .from("sale_items")
          .delete()
          .eq("id", it.id)
        if (delErr) throw delErr
        if (it.variant_id) {
          const { error: movErr } = await supabase.rpc("apply_movement", {
            p_variant_id: it.variant_id,
            p_type: "devolucion",
            p_qty: Number(it.qty),
          })
          if (movErr) {
            console.warn("[cascade] apply_movement falló, intentando UPDATE directo:", movErr.message)
            // Fallback si apply_movement no acepta 'devolucion' en la BD
            const { data: v } = await supabase
              .from("variants")
              .select("stock")
              .eq("id", it.variant_id)
              .maybeSingle()
            const newStock = (Number(v?.stock) || 0) + Number(it.qty)
            await supabase.from("variants").update({ stock: newStock }).eq("id", it.variant_id)
          }
        }
      }

      // Update único de la cabecera de la venta. Usamos SIEMPRE el cálculo
      // local (cascade ya consideró tier, ajuste, envío y pagos previos)
      // para garantizar que total y balance queden consistentes y el
      // cliente no vea "Total $375 / Falta $440" cuando lo abra.
      const paid = Number(sale.paid) || 0
      const ship = Number(sale.shipping_amount) || 0
      const finalTotal = Math.max(0, newSubtotal - signedAdj + ship)
      const finalBalance = Math.max(0, finalTotal - paid)
      const finalStatus =
        sale.status === "cancelled"
          ? "cancelled"
          : finalBalance <= 0
            ? "paid"
            : "pending"

      const { error: upErr } = await supabase
        .from("sales")
        .update({
          total: finalTotal,
          balance: finalBalance,
          status: finalStatus,
          adjustment_amount: signedAdj || null,
          adjustment_reason: reason.trim() || null,
        })
        .eq("id", sale.id)
      if (upErr) throw upErr

      // Notif al CLIENTE con motivo + delta exacto. Solo si tenemos su
      // email. Es best-effort: si falla la RLS no rompe el flujo.
      if (sale.customer_email) {
        const prevTotal = Number(sale.total) || 0
        const delta = finalTotal - prevTotal // negativo = bajó
        const tierChange = cascade && cascade.oldTier !== cascade.newTier
        let title: string
        let body: string
        if (tierChange && delta < 0) {
          title = `Tu ticket bajó a ${cascade!.newTier === "mayoreo" ? "precio mayoreo" : "medio mayoreo"}`
          body = `Ahorras ${formatMoney(Math.abs(delta))}. ${reason.trim() ? reason.trim() : "aplicó el ajuste por la cantidad de piezas."}`
        } else if (delta < 0) {
          title = `Descuento aplicado · ${formatMoney(Math.abs(delta))}`
          body = reason.trim() || "aplicó un descuento a tu pedido."
        } else if (delta > 0) {
          title = `Cargo adicional · ${formatMoney(delta)}`
          body = reason.trim() || "Se ajustó el total de tu pedido."
        } else {
          title = "Tu pedido fue actualizado"
          body = reason.trim() || "ajustó tu pedido."
        }
        await notifyClient(sale.customer_email, {
          type: "price_adjusted",
          title,
          body: `${body}\n\nNuevo total: ${formatMoney(finalTotal)} · Falta: ${formatMoney(finalBalance)}`,
          link: sale.public_token ? `/ticket/${sale.public_token}` : null,
          metadata: {
            sale_id: sale.id,
            old_total: prevTotal,
            new_total: finalTotal,
            new_balance: finalBalance,
            delta,
            adjustment: signedAdj,
            reason: reason.trim() || null,
            old_tier: cascade?.oldTier ?? null,
            new_tier: cascade?.newTier ?? null,
          },
        })
      }

      sound.success()
      toast.success(
        removed.length > 0
          ? `Ticket actualizado · ${removed.length} línea${removed.length === 1 ? "" : "s"} devuelta${removed.length === 1 ? "" : "s"} al stock`
          : "Ticket actualizado",
        { id: tid }
      )
      onSaved()
      onClose()
    } catch (e: any) {
      sound.error()
      toast.error(e?.message ?? "No se pudo guardar", { id: tid })
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === "undefined" || !sale) return null

  const currentTotal = Number(sale.total) || 0
  const isCharge = adjustSign === "charge"
  const adjLabel = isCharge ? "Cargo extra" : "Descuento"
  const adjSign = isCharge ? "+" : "−"

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[230] flex items-end md:items-center justify-center"
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={() => !saving && onClose()}
          />

          <motion.div
            initial={{ y: "100%", scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: "100%", scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] md:rounded-3xl shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[92vh] flex flex-col"
          >
            <div className="flex justify-center pt-2 pb-1 md:hidden">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-black tracking-tight">
                  Ajustar ticket
                </h3>
                <p className="text-[10px] text-slate-500 font-bold">
                  {sale.customer_name ?? "Cliente"} · Total actual:{" "}
                  <span className="font-black text-primary">
                    {formatMoney(currentTotal)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios space-y-5">
              {/* LÍNEAS DEL TICKET — control de tier/qty por partida */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <Layers size={10} /> Líneas del ticket
                  </label>
                  <button
                    type="button"
                    onClick={resetLines}
                    disabled={loadingItems}
                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary flex items-center gap-1"
                  >
                    <RotateCcw size={10} /> Restablecer
                  </button>
                </div>

                {loadingItems ? (
                  <div className="py-6 text-center">
                    <Loader2 size={18} className="animate-spin mx-auto text-slate-300" />
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-[10px] text-slate-400 text-center py-4">
                    Sin partidas
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tierChanged && (
                      <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-500/15 dark:border-amber-500/40 p-2.5 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-[10px] font-bold text-amber-800 dark:text-amber-200 leading-snug">
                          Al quitar piezas el ticket baja de{" "}
                          <span className="font-black uppercase">{TIER_LABEL[cascade!.oldTier]}</span>{" "}
                          a <span className="font-black uppercase">{TIER_LABEL[cascade!.newTier]}</span>.
                          Los precios unitarios se recalcularán automáticamente.
                        </div>
                      </div>
                    )}
                    {items.map((it) => (
                      <LineRow
                        key={it.id}
                        item={it}
                        onChangeTier={(t) => setLineTier(it, t)}
                        onChangeQty={(q) => setLineQty(it, q)}
                        onToggleRemove={() => toggleRemove(it)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Ajuste manual */}
              <section className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Wallet size={10} /> Ajuste manual al total
                </label>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAdjustSign("discount")}
                    className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                      adjustSign === "discount"
                        ? "bg-emerald-500 text-white shadow-[0_10px_30px_-8px_rgba(16,185,129,0.5)]"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    <Minus size={11} strokeWidth={3} /> Descuento
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustSign("charge")}
                    className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                      adjustSign === "charge"
                        ? "bg-amber-500 text-white shadow-[0_10px_30px_-8px_rgba(245,158,11,0.5)]"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    <Plus size={11} strokeWidth={3} /> Cargo extra
                  </button>
                </div>

                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={adjustment}
                  onChange={(e) =>
                    setAdjustment(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="0.00"
                  className="w-full h-12 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-lg font-black tabular-nums text-center"
                />
                <p className="text-[10px] text-slate-500 leading-snug">
                  {isCharge
                    ? "Suma al total. Ej: envío Uber, empaque especial."
                    : "Resta del total. Ej: descuento por lealtad."}
                </p>
              </section>

              {/* Motivo */}
              <section className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Motivo (lo verá el cliente en la notificación)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Descuento por compra recurrente"
                  maxLength={120}
                  className="w-full h-11 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-sm font-bold"
                />
              </section>

              {/* Resumen */}
              <div
                className={`rounded-2xl border p-3 ${
                  isCharge
                    ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/30"
                    : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/30"
                }`}
              >
                <SummaryRow label="Subtotal nuevo" value={formatMoney(newSubtotal)} />
                {Number(adjustment) > 0 && (
                  <SummaryRow
                    label={adjLabel}
                    value={`${adjSign}${formatMoney(Number(adjustment))}`}
                    tone={isCharge ? "amber" : "rose"}
                  />
                )}
                <div className="flex items-center justify-between text-base mt-2 pt-2 border-t border-slate-200/40 dark:border-slate-700/40">
                  <span className="font-bold">Total final</span>
                  <span
                    className={`font-black tabular-nums ${
                      isCharge
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {formatMoney(projectedTotal)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loadingItems}
                className="w-full h-12 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
                className="bg-brand"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Aplicar y notificar al cliente
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ════════════════════════ Sub-componentes ════════════════════════ */

function LineRow({
  item,
  onChangeTier,
  onChangeQty,
  onToggleRemove,
}: {
  item: PricedItem
  onChangeTier: (t: Tier) => void
  onChangeQty: (qty: number) => void
  onToggleRemove: () => void
}) {
  const removed = !!item._removed
  return (
    <div
      className={`rounded-2xl border p-3 transition-all ${
        removed
          ? "border-rose-300 bg-rose-50/60 dark:bg-rose-500/10 dark:border-rose-500/40 opacity-70"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p
            className={`text-[12px] font-black truncate ${
              removed ? "line-through text-rose-600 dark:text-rose-400" : ""
            }`}
          >
            {item.product_name}
          </p>
          {item.variant_name && (
            <p
              className={`text-[10px] font-bold truncate ${
                removed ? "line-through text-rose-500/70" : "text-slate-500"
              }`}
            >
              {item.variant_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onChangeQty(Number(item.qty) - 1)}
              disabled={removed}
              className="w-6 h-6 flex items-center justify-center text-slate-500 disabled:opacity-30"
              aria-label="Restar"
            >
              <Minus size={10} />
            </button>
            <span className="w-7 text-center text-[11px] font-black tabular-nums">
              {item.qty}
            </span>
            <button
              type="button"
              onClick={() => onChangeQty(Number(item.qty) + 1)}
              disabled={removed}
              className="w-6 h-6 flex items-center justify-center text-slate-500 disabled:opacity-30"
              aria-label="Sumar"
            >
              <Plus size={10} />
            </button>
          </div>
          <button
            type="button"
            onClick={onToggleRemove}
            aria-label={removed ? "Restaurar línea" : "Quitar línea (devuelve stock)"}
            title={removed ? "Restaurar línea" : "Quitar línea (devuelve stock)"}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              removed
                ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 hover:bg-emerald-100"
                : "bg-rose-50 dark:bg-rose-500/15 text-rose-600 hover:bg-rose-100"
            }`}
          >
            {removed ? <RotateCcw size={12} /> : <Trash2 size={12} />}
          </button>
        </div>
      </div>

      {/* Tier picker — muestra solo los tiers que existen */}
      {!removed && (
        <div className="grid grid-cols-3 gap-1 mb-2">
          {TIER_LIST.map((t) => {
            const price =
              t === "menudeo"
                ? item.price_menudeo
                : t === "medio"
                ? item.price_medio
                : item.price_mayoreo
            const has = !!price && price > 0
            const active = item.tier === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChangeTier(t)}
                disabled={!has}
                className={`h-12 rounded-xl flex flex-col items-center justify-center transition-all ${
                  active
                    ? "bg-primary text-white shadow-bloom"
                    : has
                    ? "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                    : "bg-slate-50/50 dark:bg-slate-800/50 text-slate-300 cursor-not-allowed"
                }`}
              >
                <p className="text-[7px] font-black uppercase tracking-widest leading-none">
                  {TIER_LABEL[t]}
                </p>
                <p className="text-[10px] font-black tabular-nums leading-tight">
                  {has ? formatMoney(price!) : "—"}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-bold pt-1.5 border-t border-slate-100 dark:border-slate-800">
        <span className={removed ? "text-rose-500" : "text-slate-400"}>
          {removed
            ? `Se devolverán ${item.qty} pz al stock`
            : `${item.qty} × ${formatMoney(Number(item.unit_price))}`}
        </span>
        <span
          className={`font-black tabular-nums ${
            removed
              ? "line-through text-rose-500/70"
              : "text-slate-900 dark:text-slate-100"
          }`}
        >
          {formatMoney(Number(item.qty) * Number(item.unit_price))}
        </span>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "rose" | "amber"
}) {
  const cls =
    tone === "rose"
      ? "text-rose-500"
      : tone === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : "text-slate-700 dark:text-slate-200"
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`font-black tabular-nums ${cls}`}>{value}</span>
    </div>
  )
}
