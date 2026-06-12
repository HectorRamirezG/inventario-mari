"""Paquetes (bundles) con sus items."""

from __future__ import annotations

from core.db import sb
from core.repository import BaseRepository


class BundlesRepo(BaseRepository):
    table = "bundles"
    select = "*, items:bundle_items(*, variant:variants(*, product:products(*)))"
    order_by = "name"
    order_desc = False


bundles = BundlesRepo()


def list_full() -> list[dict]:
    """Bundles con items + variante + producto resueltos."""
    return bundles.list()


def upsert_with_items(payload: dict) -> str:
    """Crea o actualiza un bundle reemplazando sus items.

    payload: {id?, name, description, price, counts_as_wholesale, items: [{variant_id, qty}, ...]}
    """
    items = payload.pop("items", [])
    if payload.get("id"):
        bid = payload["id"]
        sb.table("bundles").update({
            k: v for k, v in payload.items() if k != "id"
        }).eq("id", bid).execute()
    else:
        payload.pop("id", None)
        res = sb.table("bundles").insert(payload).execute().data
        bid = res[0]["id"]

    # Reemplazar items
    sb.table("bundle_items").delete().eq("bundle_id", bid).execute()
    if items:
        sb.table("bundle_items").insert(
            [{"bundle_id": bid, "variant_id": i["variant_id"], "qty": int(i["qty"])} for i in items]
        ).execute()
    return bid


def total_pieces(bundle: dict) -> int:
    return sum(int(i.get("qty") or 0) for i in (bundle.get("items") or []))


def total_cost(bundle: dict) -> float:
    s = 0.0
    for i in bundle.get("items") or []:
        v = i.get("variant") or {}
        prod = v.get("product") or {}
        cost = v.get("cost_override")
        if cost is None:
            cost = prod.get("cost") or 0
        s += float(cost or 0) * int(i.get("qty") or 0)
    return s
