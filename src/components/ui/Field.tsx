import type { ReactNode } from "react"
import Input from "./Input"
import clsx from "clsx"

type FieldSize = "sm" | "md" | "lg"

export default function Field({
  id,
  label,
  required,
  hint,
  error,
  right,
  children,
  size = "md",
  optional
}: {
  id?: string
  label: string
  required?: boolean
  optional?: boolean
  hint?: string
  error?: string
  right?: ReactNode
  children?: ReactNode
  size?: FieldSize
}) {
  const sizes = {
    sm: "text-[10px]",
    md: "text-[11px]",
    lg: "text-[12px]"
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className={clsx(
            "font-semibold uppercase tracking-[0.15em] text-slate-500",
            sizes[size]
          )}
        >
          {label}
          {required && <span className="ml-1 text-rose-500">*</span>}
          {optional && !required && (
            <span className="ml-2 text-[10px] text-slate-400 normal-case tracking-normal">
              opcional
            </span>
          )}
        </label>

        {right && (
          <div className="flex items-center text-xs font-semibold text-pink-500">
            {right}
          </div>
        )}
      </div>

      <div
        className={clsx(
          "group relative",
          error && "[&>input]:border-rose-200 [&>input]:focus:ring-rose-200"
        )}
      >
        {children}
      </div>

      {error ? (
        <p className="text-[11px] text-rose-500 font-medium leading-none flex items-center gap-1">
          <span>⚠</span>
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-slate-400 leading-none">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function FieldInput({
  id,
  label,
  required,
  optional,
  hint,
  error,
  right,
  icon,
  ...props
}: {
  id: string
  label: string
  required?: boolean
  optional?: boolean
  hint?: string
  error?: string
  right?: ReactNode
  icon?: ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field
      id={id}
      label={label}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
      right={right}
    >
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400 pointer-events-none z-10">
            {icon}
          </div>
        )}

        <Input
          {...props}
          id={id}
          // Priorizamos el value de props, pero aseguramos que no sea null
          value={props.value ?? ""} 
          placeholder={props.placeholder ?? `Escribe ${label.toLowerCase()}...`}
          className={clsx(
            "bg-white border border-pink-100",
            "focus:border-pink-300 focus:ring-2 focus:ring-pink-100",
            "placeholder:text-slate-400",
            icon && "pl-10",
            error && "border-rose-200 focus:ring-rose-200",
            props.className
          )}
        />
      </div>
    </Field>
  )
}