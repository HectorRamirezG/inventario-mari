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
}