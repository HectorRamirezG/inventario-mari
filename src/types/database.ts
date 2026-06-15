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
  image_url?: string | null;       // foto principal (legacy / fallback)
  image_urls?: string[] | null;    // galería ordenada de fotos
}

export interface Product {
  id: string;
  name: string;
  category: string | null;
  cost: number | null;
  price: number | null;
  min_stock: number | null;
  is_active?: boolean;
  image_url?: string | null;       // foto principal del producto
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
  customer_email?: string | null;     // Para self-shopping (RLS)
  customer_address?: string | null;
  customer_location?: string | null;  // Google Maps URL o "lat,lng"
  payment_url?: string | null;        // Link de cobro (Mercado Pago, etc.)
  public_token?: string | null;       // Token para ticket público /ticket/:token
  notes?: string | null;
  due_date?: string | null;
  apartado_due_date?: string | null;  // Fecha límite para liquidar apartado (yyyy-mm-dd)
  is_layaway?: boolean;
  total: number;
  paid: number;
  balance: number;
  status: SaleStatus;
  created_at: string;
  // Ajuste manual del admin (positivo = descuento, negativo = cargo extra)
  adjustment_amount?: number | null;
  adjustment_reason?: string | null;
  // Envío
  shipping_amount?: number | null;
  is_foreign_shipping?: boolean | null;
  // Relaciones embebidas (opcionales)
  sale_items?: SaleItem[];
  payments?: Payment[];
}

export type AppRole = "admin" | "staff" | "client" | "anon";

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  created_at?: string;
}

export {};