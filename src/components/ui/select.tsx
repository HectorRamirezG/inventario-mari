import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/* ---------------- ROOT ---------------- */

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

/* ---------------- TRIGGER ---------------- */

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex w-full items-center justify-between",
      "h-12 px-4",
      "rounded-2xl border transition-all duration-200",

      /* base */
      "bg-gray-50/80 border-gray-200 text-slate-700 text-sm font-medium",

      /* interacción */
      "hover:bg-white hover:border-pink-200",
      "focus:outline-none focus:ring-2 focus:ring-pink-100 focus:border-pink-300",

      /* mobile feel */
      "active:scale-[0.98]",

      /* contenido */
      "[&>span]:truncate",

      /* disabled */
      "disabled:opacity-50 disabled:cursor-not-allowed",

      className
    )}
    {...props}
  >
    {children}

    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 text-slate-400 transition-transform data-[state=open]:rotate-180" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = "SelectTrigger"

/* ---------------- CONTENT ---------------- */

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        "relative z-50 overflow-hidden",

        /* look */
        "rounded-2xl border border-gray-100 bg-white shadow-xl",

        /* animación */
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
        "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",

        /* posición */
        "data-[side=bottom]:slide-in-from-top-2",
        "data-[side=top]:slide-in-from-bottom-2",

        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          "p-2",
          "max-h-72", /* mejor en móvil */
          position === "popper" &&
            "w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = "SelectContent"

/* ---------------- ITEM ---------------- */

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full items-center",
      "rounded-xl px-3 py-3", /* 👈 mejor touch */
      "text-sm font-medium text-slate-700",
      "select-none outline-none transition-all duration-150",

      /* hover/focus */
      "focus:bg-pink-50 focus:text-pink-600",
      "hover:bg-pink-50",

      /* seleccionado */
      "data-[state=checked]:bg-pink-100 data-[state=checked]:text-pink-700",

      /* disabled */
      "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",

      className
    )}
    {...props}
  >

    {/* CHECK */}
    <span className="absolute right-3 flex items-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-pink-600" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>
      {children}
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = "SelectItem"

/* ---------------- EXPORT ---------------- */

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}