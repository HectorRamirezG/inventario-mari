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

  // ─────────── PRO: comparativa con período anterior ───────────
  /** Ingresos del período anterior (mismo número de días anteriores) */
  prevRevenue: number;
  /** Ganancia del período anterior */
  prevProfit: number;
  /** Operaciones del período anterior */
  prevOperations: number;

  // ─────────── PRO: tendencia diaria de últimos 30 días ───────────
  trend: {
    date: string; // YYYY-MM-DD
    label: string; // "12 jun"
    revenue: number;
    profit: number;
    operations: number;
  }[];

  // ─────────── PRO: agregados extra ───────────
  /** Pagos del período agrupados por método */
  paymentMethods: { method: string; amount: number; count: number }[];
  /** Top clientes del período por monto total */
  topCustomers: { name: string; total: number; orders: number }[];
  /** Categorías más vendidas (por unidades + ingreso) */
  topCategories: { category: string; qty: number; revenue: number }[];
  /** Valor del inventario actual al costo (stock × cost) */
  inventoryValue: number;

  /** Variantes con riesgo de quedarse sin stock en los próximos N días */
  stockoutRisk: {
    variantId: string;
    productName: string;
    variantName: string;
    stock: number;
    daysUntilStockout: number;
    soldPerDay: number;
  }[];
}
