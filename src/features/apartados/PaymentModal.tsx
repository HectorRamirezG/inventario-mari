import { useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Loader2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import type { Sale } from "../../types/database";

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  }).format(n || 0);

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
      setAmount("");
      onClose();
    }
  }

  return (
    <Modal open={open} title="Registrar abono" onClose={onClose} size="sm">
      <div className="flex flex-col gap-6 pb-4">
        {/* Resumen del apartado */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            {sale.customer_name ?? "Sin cliente"}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400">
                Total
              </p>
              <p className="text-[11px] font-black tabular-nums">
                {money(sale.total)}
              </p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400">
                Pagado
              </p>
              <p className="text-[11px] font-black tabular-nums text-emerald-600">
                {money(sale.paid)}
              </p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase text-slate-400">
                Saldo
              </p>
              <p className="text-[11px] font-black tabular-nums text-rose-500">
                {money(balance)}
              </p>
            </div>
          </div>
        </div>

        {/* Monto */}
        <div className="space-y-3">
          <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400">
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
              className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white border border-slate-100 text-lg font-black text-slate-900 outline-none focus:ring-2 focus:ring-primary/30 tabular-nums"
            />
          </div>

          {/* Atajos */}
          <div className="grid grid-cols-5 gap-2">
            {QUICK_AMOUNTS.map((v) => (
              <motion.button
                key={v}
                whileTap={{ scale: 0.94 }}
                onClick={() => setAmount(String(v))}
                className="h-9 rounded-xl bg-slate-100 hover:bg-primary/10 text-[10px] font-black"
              >
                ${v}
              </motion.button>
            ))}
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setAmount(String(balance))}
            className="w-full h-10 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest"
          >
            Saldar todo ({money(balance)})
          </motion.button>
        </div>

        {/* Método */}
        <div className="space-y-2">
          <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400">
            Método
          </label>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`h-10 rounded-xl text-[10px] font-black uppercase transition-all ${
                  method === m.value
                    ? "bg-slate-900 text-white shadow-md"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
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
      </div>
    </Modal>
  );
}
