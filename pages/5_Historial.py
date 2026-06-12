"""Historial de ventas + movimientos de inventario, con abonos."""

from __future__ import annotations

from datetime import datetime

import pandas as pd
import streamlit as st

from core.services import sales as sales_svc
from core.ui import money, page_header, page_setup, section


def _fmt_dt(ts: str | None) -> str:
    if not ts:
        return "—"
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return ts[:16]


page_setup("Historial", icon="")
page_header("Historial", subtitle="Ventas, abonos y movimientos de stock", icon="")


@st.cache_data(ttl=10)
def _load_sales() -> list[dict]:
    return sales_svc.list_history()


@st.cache_data(ttl=10)
def _load_movements() -> list[dict]:
    return sales_svc.list_movements()


tab_sales, tab_mov = st.tabs(["Ventas", "Movimientos de stock"])

# ════════════════════════════════════
# TAB: VENTAS
# ════════════════════════════════════
with tab_sales:
    sales = _load_sales()

    # Filtros
    f1, f2 = st.columns([2, 1])
    q = f1.text_input("Buscar por cliente o producto", placeholder="Escribe para filtrar...")
    fstatus = f2.selectbox("Estado", ["Todas", "Pendientes", "Pagadas"])

    filtered = []
    for s in sales:
        if fstatus == "Pendientes" and float(s.get("balance") or 0) <= 0:
            continue
        if fstatus == "Pagadas" and float(s.get("balance") or 0) > 0:
            continue
        if q:
            needle = q.lower()
            if needle not in (s.get("customer") or "").lower() and not any(
                needle in (i.get("name") or "").lower() for i in (s.get("items") or [])
            ):
                continue
        filtered.append(s)

    section(f"{len(filtered)} venta(s)")

    if not filtered:
        st.info("Sin ventas que mostrar.")

    for s in filtered:
        balance = float(s.get("balance") or 0)
        is_pending = balance > 0
        items = s.get("items") or []

        with st.container(border=True):
            top = st.columns([3, 1, 1, 1])
            top[0].markdown(f"**{s.get('customer') or 'Mostrador'}**")
            top[0].caption(_fmt_dt(s.get("created_at")))

            top[1].metric("Total", money(s.get("total")))
            top[2].metric("Pagado", money(s.get("paid")))
            top[3].metric(
                "Saldo",
                money(balance),
                delta=("pendiente" if is_pending else "pagada"),
                delta_color="inverse" if is_pending else "normal",
            )

            with st.expander(f"Ver {len(items)} ítem(s)"):
                if items:
                    df = pd.DataFrame([
                        {
                            "Producto": i.get("name"),
                            "Variante": i.get("variant_name") or "—",
                            "Cant.": i.get("qty"),
                            "P. Unit.": money(i.get("unit_price")),
                            "Subtotal": money(float(i.get("qty") or 0) * float(i.get("unit_price") or 0)),
                            "Tier": i.get("tier"),
                        }
                        for i in items
                    ])
                    st.dataframe(df, use_container_width=True, hide_index=True)

                if s.get("payments"):
                    st.caption("**Abonos:**")
                    for p in s["payments"]:
                        st.caption(f"• {_fmt_dt(p.get('created_at'))} — {money(p.get('amount'))}")

            if is_pending:
                with st.form(f"abono-{s['id']}", clear_on_submit=True, border=False):
                    a1, a2 = st.columns([2, 1])
                    monto = a1.number_input(
                        f"Abonar a esta venta (pendiente: {money(balance)})",
                        min_value=0.01,
                        max_value=float(balance),
                        value=float(balance),
                        step=10.0,
                        key=f"ab-{s['id']}",
                    )
                    if a2.form_submit_button("Registrar abono", type="primary", use_container_width=True):
                        sales_svc.register_payment(s["id"], float(monto))
                        st.cache_data.clear()
                        st.success("Abono registrado")
                        st.rerun()

# ════════════════════════════════════
# TAB: MOVIMIENTOS
# ════════════════════════════════════
with tab_mov:
    moves = _load_movements()
    section(f"Últimos {len(moves)} movimientos", icon="")

    if not moves:
        st.info("Sin movimientos registrados.")
    else:
        df = pd.DataFrame([
            {
                "Fecha": _fmt_dt(m.get("created_at")),
                "Tipo": m.get("type"),
                "Producto": ((m.get("variant") or {}).get("product") or {}).get("name") or "—",
                "Variante": (m.get("variant") or {}).get("variant_name") or "—",
                "Cantidad": m.get("quantity"),
                "Nota": m.get("reference") or "—",
            }
            for m in moves
        ])
        st.dataframe(df, use_container_width=True, hide_index=True)
