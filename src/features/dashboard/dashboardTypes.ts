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
  /** Apartados con saldo y due_date a 5 días o menos */
  dueLayaways: number;
  /** Comprobantes de pago en revisión */
  pendingProofs: number;
}
