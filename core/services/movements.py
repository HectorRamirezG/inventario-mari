"""Movimientos manuales de inventario (entradas/ajustes)."""

from __future__ import annotations

from core.db import sb


def apply(variant_id: str, type_: str, quantity: int, reference: str = "") -> None:
    """type_: 'entrada' | 'salida' | 'ajuste'."""
    sb.rpc("apply_movement", {
        "p_variant_id": variant_id,
        "p_type": type_,
        "p_quantity": int(quantity),
        "p_reference": reference,
    }).execute()
