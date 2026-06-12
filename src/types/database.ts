export interface Variant {
  id: string;
  product_id?: string;
  sku?: string | null;
  variant_name: string;
  stock: number;
  is_active?: boolean;

  // Precios por nivel (tier). Si la columna está vacía,
  // el carrito hará fallback al siguiente tier disponible.
  price?: number | null;
  price_menudeo?: number | null;
  price_medio?: number | null;
  price_mayoreo?: number | null;

  cost_override?: number | null;   // DB
  effective_cost?: number | null;  // CALCULADO
}

export interface Product {
  id: string;
  name: string;
  category: string | null;
  cost: number | null;
  price: number | null;
  min_stock: number | null;
  is_active?: boolean;
  variants?: Variant[];
}

export type SaleStatus = "paid" | "pending" | "cancelled";

export interface SaleItem {
  id: string;
  sale_id: string;
  variant_id: string | null;
  product_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  qty: number;
  tier: "menudeo" | "medio" | "mayoreo";
  unit_price: number;
  cost_snapshot: number;
  profit: number;
  is_bundle?: boolean;
}

export interface Payment {
  id: string;
  sale_id: string;
  amount: number;
  method?: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  customer_name: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_location?: string | null; // Google Maps URL o "lat,lng"
  notes?: string | null;
  due_date?: string | null;
  is_layaway?: boolean;
  total: number;
  paid: number;
  balance: number;
  status: SaleStatus;
  created_at: string;
  // Relaciones embebidas (opcionales)
  sale_items?: SaleItem[];
  payments?: Payment[];
}

export {};