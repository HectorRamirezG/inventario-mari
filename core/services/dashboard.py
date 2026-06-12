"""Métricas para el dashboard."""

from __future__ import annotations

from datetime import datetime, timedelta

from core.db import sb


def stats() -> dict:
    sales = (
        sb.table("sales")
        .select("*, items:sale_items(*)")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

    revenue = sum(float(s.get("total") or 0) for s in sales)
    paid = sum(float(s.get("paid") or 0) for s in sales)
    pending = max(0.0, revenue - paid)

    cost_total = 0.0
    top_map: dict[str, int] = {}
    for s in sales:
        for it in s.get("items") or []:
            cost_total += float(it.get("cost") or 0) * int(it.get("qty") or 0)
            name = it.get("name") or "—"
            top_map[name] = top_map.get(name, 0) + int(it.get("qty") or 0)

    profit = revenue - cost_total

    # Stock bajo
    low = (
        sb.table("variants")
        .select("*, product:products(name, min_stock)")
        .execute()
        .data
        or []
    )
    low_stock = [
        v
        for v in low
        if int(v.get("stock") or 0) <= int((v.get("product") or {}).get("min_stock") or 0)
    ]

    # Ventas últimos 7 días
    cutoff = datetime.utcnow() - timedelta(days=7)
    by_day: dict[str, float] = {}
    for s in sales:
        ts = s.get("created_at")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            continue
        if dt < cutoff:
            continue
        key = dt.strftime("%Y-%m-%d")
        by_day[key] = by_day.get(key, 0) + float(s.get("total") or 0)

    top = sorted(top_map.items(), key=lambda x: -x[1])[:5]

    return {
        "revenue": revenue,
        "paid": paid,
        "pending": pending,
        "profit": profit,
        "operations": len(sales),
        "low_stock": low_stock,
        "top": [{"name": n, "qty": q} for n, q in top],
        "by_day": by_day,
        "ticket_avg": (revenue / len(sales)) if sales else 0,
    }
