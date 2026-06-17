import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Loader2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import AnimatedCheckmark from "../../components/ui/AnimatedCheckmark";
import type { Sale } from "../../types/database";
import { useFeedback } from "../../lib/useFeedback";

import { formatMoney as fmtMoney } from "../../lib/format";

const money = fmtMoney

interface Props {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onPay: (saleId: string, amount: number, method: string) => Promise<boolean>;
}

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];
const METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
] as const;

export default function PaymentModal({ open, sale, onClose, onPay }: Props) {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("efectivo");
  const [saving, setSaving] = useState(false);
  const [successView, setSuccessView] = useState(false);
  const { success: hapticSuccess, error: hapticError } = useFeedback();

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setSuccessView(false);
      setAmount("");
      setSaving(false);
    }
  }, [open]);

  if (!sale) return null;

  const balance = Number(sale.balance) || 0;
  const amountNum = Number(amount) || 0;

  async function handleSubmit() {
    if (amountNum <= 0) return;
    if (amountNum > balance + 0.01) {
      if (
        !window.confirm(
          `El abono (${money(amountNum)}) supera el saldo pendiente (${money(
            balance
          )}). ¿Continuar?`
        )
      )
        return;
    }
    setSaving(true);
    const ok = await onPay(sale!.id, amountNum, method);
    setSaving(false);
    if (ok) {
      hapticSuccess();
      setSuccessView(true);
      // Cerrar tras la animación de éxito
      setTimeout(() => {
        setAmount("");
        onClose();
      }, 1100);
    } else {
      hapticError();
    }
  }

  return (
    <Modal open={open} title={successView ? undefined : "Registrar abono"} onClose={onClose} size="sm">
      <AnimatePresence mode="wait">
        {successView ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 px-4 gap-3 text-center"
          >
            <AnimatedCheckmark size={88} tone="success" />
            <p className="text-base font-black text-slate-900 dark:text-slate-100 mt-2">
              ¡Abono registrado!
            </p>
            <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
              {money(amountNum)} · {method}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-6 pb-4"
          >
            {/* Resumen del apartado */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {sale.customer_name ?? "Sin cliente"}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500">
                    Total
                  </p>
                  <p className="text-[11px] font-black tabular-nums text-slate-900 dark:text-slate-100">
                    {money(sale.total)}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500">
                    Pagado
                  </p>
                  <p className="text-[11px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                    {money(sale.paid)}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500">
                    Saldo
                  </p>
                  <p className="text-[11px] font-black tabular-nums text-rose-500 dark:text-rose-400">
                    {money(balance)}
                  </p>
                </div>
              </div>
            </div>

            {/* Monto */}
            <div className="space-y-3">
              <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                Monto a abonar
              </label>
              <div className="relative">
                <Wallet
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-primary"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-lg font-black text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 tabular-nums"
                />
              </div>

              {/* Atajos */}
              <div className="grid grid-cols-5 gap-2">
                {QUICK_AMOUNTS.map((v) => (
                  <motion.button
                    key={v}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setAmount(String(v))}
                    className="h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-primary/10 dark:hover:bg-primary/20 text-[10px] font-black text-slate-700 dark:text-slate-200"
                  >
                    ${v}
                  </motion.button>
                ))}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setAmount(String(balance))}
                className="w-full h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest"
              >
                Saldar todo ({money(balance)})
              </motion.button>
            </div>

            {/* Método */}
            <div className="space-y-2">
              <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                Método
              </label>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={`h-10 rounded-xl text-[10px] font-black uppercase transition-all ${
                      method === m.value
                        ? "bg-slate-900 dark:bg-primary text-white shadow-md"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={saving || amountNum <= 0}
              className="w-full h-14 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                `Confirmar ${money(amountNum)}`
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
