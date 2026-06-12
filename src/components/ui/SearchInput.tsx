import { useState, useEffect } from "react"
import { Search, X } from "lucide-react"
import clsx from "clsx"

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void
  debounce?: number
}

export default function SearchInput({
  className,
  onClear,
  value,
  onChange,
  debounce = 250,
  ...props
}: SearchInputProps) {

  const [focused, setFocused] = useState(false)
  const [internal, setInternal] = useState(value ?? "")

  const hasValue = typeof internal === "string" && internal.length > 0

  /* ---------------- DEBOUNCE ---------------- */
  useEffect(() => {
    const t = setTimeout(() => {
      if (onChange) {
        const e = {
          target: { value: internal }
        } as React.ChangeEvent<HTMLInputElement>

        onChange(e)
      }
    }, debounce)

    return () => clearTimeout(t)
  }, [internal])

  /* ---------------- CLEAR ---------------- */
  function clear() {
    setInternal("")
    onClear?.()

    if (onChange) {
      const e = {
        target: { value: "" }
      } as React.ChangeEvent<HTMLInputElement>

      onChange(e)
    }
  }

  return (
    <div
      className={clsx(
        "relative flex items-center w-full",
        "rounded-full border transition-all duration-200",
        "bg-gray-50/80 border-gray-200",

        "hover:bg-white hover:border-pink-200",
        focused && "bg-white border-pink-300 ring-2 ring-pink-100",

        className
      )}
    >

      {/* ICON */}
      <div className="absolute left-4 flex items-center text-slate-400 group-focus-within:text-pink-400 transition">
        <Search size={16} />
      </div>

      {/* INPUT */}
      <input
        type="search"
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={clsx(
          "w-full bg-transparent",
          "pl-11 pr-11 py-3", /* 👈 mejor para dedo */
          "text-sm text-slate-700",
          "outline-none placeholder:text-slate-400"
        )}
        placeholder="Buscar productos..."
        {...props}
      />

      {/* CLEAR */}
      {hasValue && (
        <button
          type="button"
          onClick={clear}
          className={clsx(
            "absolute right-2",
            "h-8 w-8 flex items-center justify-center",
            "rounded-full transition-all",

            "active:scale-90",
            "hover:bg-pink-50"
          )}
        >
          <X size={14} className="text-slate-400" />
        </button>
      )}

    </div>
  )
}