import { type LucideIcon } from "lucide-react";
import clsx from "clsx";

interface StatItemProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: "primary" | "success" | "violet" | "warn" | "danger";
  description?: string;
}

export default function StatItem({
  label,
  value,
  icon: Icon,
  color = "primary",
  description
}: StatItemProps) {
  
  const colors = {
    primary: "bg-blue-50 text-blue-600 border-blue-100",
    success: "bg-emerald-50 text-emerald-600 border-emerald-100",
    violet: "bg-violet-50 text-violet-600 border-violet-100",
    warn: "bg-amber-50 text-amber-600 border-amber-100",
    danger: "bg-rose-50 text-rose-600 border-rose-100",
  };

  return (
    <div className="group relative overflow-hidden rounded-[2rem] bg-white border border-gray-100 shadow-sm p-6 transition-all hover:shadow-md hover:scale-[1.02]">
      <div className="flex items-center gap-5">
        <div className={clsx(
          "flex h-14 w-14 items-center justify-center rounded-2xl border-2 transition-transform group-hover:rotate-3",
          colors[color]
        )}>
          {/* Aquí usamos Icon como componente */}
          <Icon size={28} strokeWidth={2.5} />
        </div>

        <div className="text-left">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">
            {label}
          </p>
          <p className="text-2xl font-black text-gray-800 tracking-tight">
            {value}
          </p>
          {description && (
            <p className="mt-1 text-[10px] font-bold text-gray-400">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-gray-50/50 blur-2xl transition-opacity opacity-0 group-hover:opacity-100" />
    </div>
  );
}