import { clsx } from "clsx"
import { useId, useState } from "react"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  containerClassName?: string
}

export default function Input({
  label,
  hint,
  error,
  iconLeft,
  iconRight,
  className,
  containerClassName,
  onFocus,
  onBlur,
  disabled,
  ...props
}: InputProps) {

  const id = useId()
  const [focused, setFocused] = useState(false)

  return (
    <div className={clsx("flex flex-col gap-1.5", containerClassName)}>

      {/* LABEL */}
      {label && (
        <label
          htmlFor={id}
          className="ml-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400"
        >
          {label}
        </label>
      )}

      {/* INPUT WRAPPER */}
      <div
        className={clsx(
          "group relative flex items-center rounded-2xl border transition-all duration-200",
          "bg-gray-50/80 border-gray-200",
          "hover:bg-white hover:border-pink-200",
          focused && "bg-white border-pink-300 ring-2 ring-pink-100",
          error && "border-rose-300 ring-2 ring-rose-100 bg-rose-50/30",
          disabled && "opacity-60 cursor-not-allowed"
        )}
      >

        {/* ICON LEFT */}
        {iconLeft && (
          <div className="absolute left-3 flex items-center text-slate-400 group-focus-within:text-pink-400 transition-colors">
            {iconLeft}
          </div>
        )}

        {/* INPUT */}
        <input
          id={id}
          disabled={disabled}
          className={clsx(
            "w-full bg-transparent px-4 py-2.5 text-sm text-slate-700",
            "outline-none placeholder:text-slate-400",
            "transition-all duration-150",
            iconLeft && "pl-10",
            iconRight && "pr-10",
            className
          )}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          {...props}
        />

        {/* ICON RIGHT */}
        {iconRight && (
          <div className="absolute right-3 flex items-center text-slate-400 group-focus-within:text-pink-400 transition-colors">
            {iconRight}
          </div>
        )}

      </div>

      {/* FEEDBACK */}
      {error ? (
        <span className="ml-1 text-[11px] font-medium text-rose-500 flex items-center gap-1">
          <span className="text-xs">⚠</span>
          {error}
        </span>
      ) : hint ? (
        <span className="ml-1 text-[11px] text-slate-400">
          {hint}
        </span>
      ) : null}

    </div>
  )
}