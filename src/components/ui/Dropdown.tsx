import { useState, useRef, useEffect } from "react"
import { ChevronDown, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import clsx from "clsx"

interface Option {
  label: string
  value: string
}

interface DropdownProps {
  options: Option[]
  value?: string
  placeholder?: string
  onChange: (value: string) => void
  className?: string
}

export default function Dropdown({
  options,
  value,
  placeholder = "Seleccionar",
  onChange,
  className
}: DropdownProps) {

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("click", handleClick)
    return () => window.removeEventListener("click", handleClick)
  }, [])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className={clsx("relative w-full", className)}>

      {/* TRIGGER */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={clsx(
          "w-full flex items-center justify-between",
          "rounded-2xl border px-4 py-3 text-sm",
          "bg-gray-50/80 border-gray-200",
          "text-slate-700 font-medium",
          "transition-all duration-200",

          "hover:bg-white hover:border-pink-200",
          "focus:outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-300",

          "active:scale-[0.98]"
        )}
      >

        <span className={clsx(!selected && "text-slate-400")}>
          {selected?.label || placeholder}
        </span>

        <ChevronDown
          size={18}
          className={clsx(
            "text-slate-400 transition-transform duration-200",
            open && "rotate-180 text-pink-500"
          )}
        />

      </button>

      {/* CONTENT */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={clsx(
              "absolute z-40 mt-2 w-full",
              "rounded-2xl border border-gray-100 bg-white",
              "shadow-[0_12px_35px_rgba(0,0,0,0.08)] overflow-hidden"
            )}
          >

            <ul className="max-h-64 overflow-y-auto py-1">

              {options.map(o => {
                const active = o.value === value

                return (
                  <li
                    key={o.value}
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    className={clsx(
                      "flex items-center justify-between",
                      "px-4 py-3 text-sm",
                      "cursor-pointer select-none",
                      "transition-all duration-150",

                      "text-slate-700",
                      "hover:bg-pink-50",

                      active && "bg-pink-50 text-pink-600 font-medium"
                    )}
                  >

                    <span>{o.label}</span>

                    {active && (
                      <Check size={16} className="text-pink-500" />
                    )}

                  </li>
                )
              })}

            </ul>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}