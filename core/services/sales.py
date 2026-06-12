"""Ventas atómicas + abonos."""

from __future__ import annotations

from typing import Any

from core.db import sb


def create_sale(payload: dict[str, Any]) -> dict[str, Any]:
    """Llama al RPC `create_sale_atomic` que inserta venta+items+pagos+movimientos
    en una sola transacción del lado del servidor.

    payload = {
      customer: str,
      paid: float,
      items: [{variant_id, product_id, name, variant_name, qty, unit_price, cost, tier}],
      bundles: [{bundle_id, name, qty, unit_price}],
    }
    """
    res = sb.rpc("create_sale_atomic", {"payload": payload}).execute()
    return res.data or {}


def list_history() -> list[dict]:
    """Trae ventas + items + pagos para la pantalla de historial."""
    sales = (
        sb.table("sales")
        .select("*, items:sale_items(*), payments(*)")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return sales


def list_movements() -> list[dict]:
    """Movimientos de inventario (entradas/salidas/ajustes)."""
    return (
        sb.table("movements")
        .select("*, variant:variants(*, product:products(*))")
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )


def register_payment(sale_id: str, amount: float) -> None:
    sb.table("payments").insert({"sale_id": sale_id, "amount": amount}).execute()
    # Actualizar el balance/status de la venta
    sale = sb.table("sales").select("*").eq("id", sale_id).limit(1).execute().data
    if sale:
        s = sale[0]
        new_paid = float(s.get("paid") or 0) + float(amount)
        total = float(s.get("total") or 0)
        new_balance = max(0, total - new_paid)
        sb.table("sales").update({
            "paid": new_paid,
            "balance": new_balance,
            "status": "pagado" if new_balance <= 0 else "pendiente",
        }).eq("id", sale_id).execute()
