/**
 * Catálogo central de secciones del admin. Fuente única de verdad para:
 *   - Sidebar desktop (rail vertical de 80px, top 8 secciones)
 *   - Dock mobile (5 slots, mostramos top 4 + "Más" que abre ActionHub)
 *   - ActionHub (+) — grid 2 columnas con TODAS las secciones disponibles
 *   - CommandPalette (⌘K) — TODAS las secciones buscables con shortcut
 *
 * Reglas:
 *   - `adminOnly` filtra para staff sin rol admin.
 *   - `ruleFlag` (clave en BusinessRules) oculta la sección si la regla está apagada.
 *   - `pin` define el orden y qué aparece en el dock/sidebar (los pin=true
 *     son los principales). Lo demás vive en el ActionHub.
 */

import type { LucideIcon } from "lucide-react"
import {
  Calendar,
  Package,
  ShoppingCart,
  Bookmark,
  LifeBuoy,
  TrendingUp,
  Tag,
  ScrollText,
  Settings as SettingsIcon,
  Heart,
  Camera,
  Star,
} from "lucide-react"

import type { BusinessRules } from "../features/settings/businessRulesService"

export type AdminSection =
  | "hoy"
  | "catalogo"
  | "caja"
  | "pendientes"
  | "ciclos"
  | "calculadora"
  | "soporte"
  | "sugerencias"
  | "stories"
  | "resenias"
  | "reglas"
  | "ajustes"

export interface AdminSectionEntry {
  id: AdminSection
  label: string
  /** Texto secundario usado en ActionHub. */
  caption: string
  icon: LucideIcon
  /** Solo visible si el usuario es admin (no staff). */
  adminOnly?: boolean
  /** Clave en BusinessRules para gatear la sección (ej: "wishes_enabled"). */
  ruleFlag?: keyof BusinessRules
  /** Si está pinned aparece en sidebar/dock. Si no, vive solo en ActionHub. */
  pin?: boolean
  /** Gradiente para tarjeta del ActionHub. */
  accent: string
  /** Tecla numérica (1..9) para CommandPalette. */
  shortcut?: string
  /** Pista que aparece en el palette. */
  hint?: string
}

export const ADMIN_SECTIONS: AdminSectionEntry[] = [
  {
    id: "hoy",
    label: "Hoy",
    caption: "Dashboard y métricas del día",
    icon: Calendar,
    pin: true,
    accent: "linear-gradient(135deg,#0ea5e9,#6366f1)",
    shortcut: "1",
    hint: "Resumen del día y corte de caja",
  },
  {
    id: "caja",
    label: "Caja",
    caption: "Nueva venta o apartado",
    icon: ShoppingCart,
    pin: true,
    accent: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
    shortcut: "2",
    hint: "Procesar nueva venta",
  },
  {
    id: "pendientes",
    label: "Pendientes",
    caption: "Apartados y abonos",
    icon: Bookmark,
    pin: true,
    accent: "linear-gradient(135deg,#f59e0b,#fb923c)",
    shortcut: "3",
    hint: "Control de saldos y cobranza",
  },
  {
    id: "catalogo",
    label: "Catálogo",
    caption: "Productos, variantes y stock",
    icon: Package,
    pin: true,
    accent: "linear-gradient(135deg,#10b981,#34d399)",
    shortcut: "4",
    hint: "Productos y stock",
  },
  {
    id: "soporte",
    label: "Soporte",
    caption: "Reportes de clientes",
    icon: LifeBuoy,
    accent: "linear-gradient(135deg,#0ea5e9,#6366f1)",
    shortcut: "5",
    hint: "Buzón de incidencias",
  },
  {
    id: "sugerencias",
    label: "Sugerencias",
    caption: "Lo que tus clientes te piden",
    icon: Heart,
    ruleFlag: "wishes_enabled",
    accent: "linear-gradient(135deg,#ec4899,#a855f7)",
    shortcut: "6",
    hint: "Wishes / lista de deseos",
  },
  {
    id: "stories",
    label: "Stories",
    caption: "Fotos del día estilo Instagram",
    icon: Camera,
    ruleFlag: "stories_enabled",
    accent: "linear-gradient(135deg,#f97316,#e6007e)",
    shortcut: "7",
    hint: "Publicar fotos efímeras",
  },
  {
    id: "resenias",
    label: "Reseñas",
    caption: "Modera comentarios y fotos",
    icon: Star,
    ruleFlag: "reviews_enabled",
    accent: "linear-gradient(135deg,#f59e0b,#ec4899)",
    shortcut: "8",
    hint: "Aprobar reseñas del cliente",
  },
  {
    id: "ciclos",
    label: "Ciclos",
    caption: "Gastos y break-even mensual",
    icon: TrendingUp,
    adminOnly: true,
    accent: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    hint: "Ciclos de inventario",
  },
  {
    id: "calculadora",
    label: "Calculadora",
    caption: "Precios menudeo / medio / mayoreo",
    icon: Tag,
    adminOnly: true,
    accent: "linear-gradient(135deg,#f97316,#eab308)",
    hint: "Aplicar precios a variantes",
  },
  {
    id: "reglas",
    label: "Reglas",
    caption: "Políticas del negocio",
    icon: ScrollText,
    adminOnly: true,
    accent: "linear-gradient(135deg,#64748b,#475569)",
    hint: "Reglas de venta y devoluciones",
  },
  {
    id: "ajustes",
    label: "Ajustes",
    caption: "Tienda, banco, envíos",
    icon: SettingsIcon,
    accent: "linear-gradient(135deg,#94a3b8,#64748b)",
    hint: "Configuración general",
  },
]

/**
 * Devuelve las secciones visibles para el contexto dado:
 *   - filtra por adminOnly según rol
 *   - filtra por ruleFlag según reglas activas
 */
export function visibleSections(
  rules: BusinessRules,
  isAdmin: boolean,
): AdminSectionEntry[] {
  return ADMIN_SECTIONS.filter((s) => {
    if (s.adminOnly && !isAdmin) return false
    if (s.ruleFlag && !rules[s.ruleFlag]) return false
    return true
  })
}

/**
 * Subset para sidebar desktop. Incluye TODAS las secciones disponibles
 * excepto `ajustes` (vive en su propio botón al fondo del rail).
 * Devuelve hasta 9 entradas (con scroll si excede).
 */
export function sidebarSections(
  rules: BusinessRules,
  isAdmin: boolean,
): AdminSectionEntry[] {
  return visibleSections(rules, isAdmin).filter((s) => s.id !== "ajustes")
}

/**
 * Subset para dock mobile: solo las pinneadas (top 5 fijas).
 * Ajustes y secciones admin-only se acceden vía ActionHub.
 */
export function dockSections(
  rules: BusinessRules,
  isAdmin: boolean,
): AdminSectionEntry[] {
  return visibleSections(rules, isAdmin)
    .filter((s) => s.pin)
    .slice(0, 5)
}
