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

export {};