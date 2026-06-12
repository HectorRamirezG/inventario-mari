import clsx from "clsx"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronUp, ChevronDown } from "lucide-react"
import { useState } from "react"

interface TableProps {
  children: React.ReactNode
  className?: string
}

/* ---------------- TABLE WRAPPER ---------------- */

export function Table({ children, className }: TableProps) {
  return (
    <div
      className={clsx(
        "relative w-full overflow-hidden",
        "rounded-[2rem] bg-white",
        "border border-gray-100",
        "transition-all duration-200",
        "hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          {children}
        </table>
      </div>
    </div>
  )
}

/* ---------------- HEAD ---------------- */

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
      {children}
    </thead>
  )
}

/* ---------------- BODY ---------------- */

export function TBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="divide-y divide-gray-50">
      <AnimatePresence mode="popLayout">
        {children}
      </AnimatePresence>
    </tbody>
  )
}

/* ---------------- ROW ---------------- */

export function TR({ children, className }: TableProps) {
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        "group transition-all duration-150",
        "hover:bg-pink-50/60",
        "cursor-default",
        className
      )}
    >
      {children}
    </motion.tr>
  )
}

/* ---------------- HEADER CELL ---------------- */

export function TH({
  children,
  align = "left",
  sortable = false
}: {
  children: React.ReactNode
  align?: "left" | "center" | "right"
  sortable?: boolean
}) {

  const [dir, setDir] = useState<"asc" | "desc" | null>(null)

  const a = {
    left: "text-left",
    center: "text-center",
    right: "text-right"
  }

  function toggle() {
    if (!sortable) return
    setDir((prev) => (prev === "asc" ? "desc" : "asc"))
  }

  return (
    <th
      onClick={toggle}
      className={clsx(
        "px-6 py-4 text-[10px] font-semibold uppercase tracking-widest",
        "text-slate-400 select-none",
        "transition-colors",
        sortable && "cursor-pointer hover:text-pink-500",
        a[align]
      )}
    >
      <div className="flex items-center gap-2">
        <span>{children}</span>

        {sortable && (
          <span className="flex flex-col opacity-40 group-hover:opacity-100 transition">
            <ChevronUp
              size={12}
              className={clsx(dir === "asc" && "text-pink-500")}
            />
            <ChevronDown
              size={12}
              className={clsx(dir === "desc" && "text-pink-500")}
            />
          </span>
        )}
      </div>
    </th>
  )
}

/* ---------------- CELL ---------------- */

export function TD({
  children,
  className,
  align = "left",
  highlight = false
}: {
  children: React.ReactNode
  className?: string
  align?: "left" | "center" | "right"
  highlight?: boolean
}) {

  const a = {
    left: "text-left",
    center: "text-center",
    right: "text-right"
  }

  return (
    <td
      className={clsx(
        "px-6 py-5",
        "text-[13px] text-slate-700",
        "group-hover:text-slate-900",
        "transition-colors",
        highlight && "font-semibold text-pink-600",
        a[align],
        className
      )}
    >
      {children}
    </td>
  )
}

/* ---------------- FOOTER ---------------- */

export function TFooter({ children }: { children: React.ReactNode }) {
  return (
    <tfoot className="border-t border-gray-100 bg-gray-50/60">
      {children}
    </tfoot>
  )
}

/* ---------------- LOADING ---------------- */

export function TLoading() {
  return (
    <tr>
      <td colSpan={100} className="py-12 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-pink-400 animate-bounce" />
          <span className="h-2 w-2 rounded-full bg-pink-400 animate-bounce [animation-delay:.1s]" />
          <span className="h-2 w-2 rounded-full bg-pink-400 animate-bounce [animation-delay:.2s]" />
        </div>
      </td>
    </tr>
  )
}

/* ---------------- EMPTY ---------------- */

export function TEmpty({
  message = "Sin registros"
}: {
  message?: string
}) {
  return (
    <tr>
      <td colSpan={100} className="py-14 text-center">
        <p className="text-sm text-slate-400 font-medium">
          {message}
        </p>
      </td>
    </tr>
  )
}