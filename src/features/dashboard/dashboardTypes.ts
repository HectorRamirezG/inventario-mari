// src/features/dashboard/dashboardTypes.ts
export interface DashboardStats {
  products: number;
  variants: number;
  lowStock: number;
  revenue: number;
  profit: number;
  pending: number;
  operations: number;
  top: { name: string; qty: number }[];
  /** Ventas pagadas con envío foráneo activo (listas para preparar/enviar) */
  pendingShipments: number;
  /** Apartados con saldo creados hace 25+ días (vencen pronto, asumiendo plazo de 30 días) */
  dueLayaways: number;
  /** Comprobantes de pago en revisión */
  pendingProofs: number;
}
