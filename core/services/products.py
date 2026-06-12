"""Productos y variantes."""

from __future__ import annotations

from core.db import sb
from core.repository import BaseRepository


class ProductsRepo(BaseRepository):
    table = "products"
    select = "*, variants(*)"
    order_by = "name"
    order_desc = False

    def list_active(self) -> list[dict]:
        return self.list()


class VariantsRepo(BaseRepository):
    table = "variants"
    order_by = "variant_name"
    order_desc = False


products = ProductsRepo()
variants = VariantsRepo()


# ─── Catálogo plano para ventas/paquetes ───
def catalog() -> list[dict]:
    """Devuelve variantes con producto embebido y costo efectivo."""
    rows = (
        sb.table("variants")
        .select("*, product:products(*)")
        .order("variant_name")
        .execute()
        .data
        or []
    )
    out: list[dict] = []
    for v in rows:
        prod = v.get("product") or {}
        cost = v.get("cost_override")
        if cost is None:
            cost = prod.get("cost") or 0
        out.append({
            **v,
            "effective_cost": float(cost or 0),
            "product_name": prod.get("name") or "—",
            "category": prod.get("category"),
        })
    return out
