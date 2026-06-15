import { useState } from "react"
import { Copy, Check, Building2 } from "lucide-react"
import toast from "react-hot-toast"

import { useBankAccount, hasBankAccount } from "../../features/settings/bankAccountService"

/**
 * Tarjeta compacta con los datos bancarios de la tienda + botón
 * "Copiar" por campo. Si Mari aún no configuró sus datos, no se muestra.
 */
export default function BankAccountCard() {
  const bank = useBankAccount()
  if (!hasBankAccount(bank)) return null

  return (
    <div className="rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-500/10 dark:to-blue-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center shrink-0">
          <Building2 size={14} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-300 leading-none">
            Datos para transferencia
          </p>
          <p className="text-[9px] text-sky-700/70 dark:text-sky-300/70 mt-0.5">
            Toca para copiar
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {bank.bank && <CopyRow label="Banco" value={bank.bank} />}
        {bank.holder && <CopyRow label="Titular" value={bank.holder} />}
        {bank.clabe && <CopyRow label="CLABE" value={bank.clabe} mono />}
        {bank.card && <CopyRow label="Tarjeta" value={bank.card} mono />}
      </div>

      {bank.notes && (
        <p className="text-[9px] text-sky-800/80 dark:text-sky-300/80 leading-snug pt-1 border-t border-sky-200/40">
          {bank.notes}
        </p>
      )}
    </div>
  )
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label} copiado`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar")
    }
  }
  return (
    <button
      type="button"
      onClick={handle}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-slate-900/40 hover:bg-white active:scale-[0.99] transition-all text-left"
    >
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 shrink-0">
        {label}
      </span>
      <span
        className={`flex-1 min-w-0 truncate text-right text-xs font-black text-slate-900 dark:text-slate-100 ${
          mono ? "tabular-nums tracking-tight" : ""
        }`}
      >
        {value}
      </span>
      {copied ? (
        <Check size={12} className="text-emerald-500 shrink-0" />
      ) : (
        <Copy size={11} className="text-sky-500 shrink-0" />
      )}
    </button>
  )
}
