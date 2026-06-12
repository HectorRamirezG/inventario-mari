"""Mari Inventario · Dashboard (entry point).

Ejecutar local:    streamlit run app.py
"""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from core.services.dashboard import stats
from core.ui import money, page_header, page_setup, section

page_setup("Inicio", icon="")

# ─── Sidebar marca ───
with st.sidebar:
    st.markdown("## Mari Inventario")
    st.caption("Gestión de inventario, ventas y precios")
    st.divider()
    if st.button("Refrescar datos", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

# ─── Cabecera ───
page_header(
    "Resumen Financiero",
    subtitle="Estado actual de tu negocio en tiempo real",
    icon="",
)


@st.cache_data(ttl=30)
def _load() -> dict:
    return stats()


data = _load()

# ─── Métricas principales ───
section("Capital", icon="")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Utilidad", money(data["profit"]))
c2.metric("Ingresos", money(data["revenue"]))
c3.metric("Cobrado", money(data["paid"]))
c4.metric(
    "Pendiente",
    money(data["pending"]),
    delta=("por cobrar" if data["pending"] > 0 else "todo al día"),
    delta_color="inverse" if data["pending"] > 0 else "normal",
)

st.write("")
section("Operación", icon="")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Ventas", data["operations"])
c2.metric("Ticket promedio", money(data["ticket_avg"]))
c3.metric("Stock bajo", len(data["low_stock"]))
eficiencia = 100 - (data["pending"] / data["revenue"] * 100 if data["revenue"] else 0)
c4.metric("Eficiencia cobro", f"{eficiencia:.0f}%")

st.divider()

# ─── Gráfica + Top ───
left, right = st.columns([2, 1])

with left:
    section("Ventas últimos 7 días", icon="")
    if data["by_day"]:
        df = pd.DataFrame(
            sorted(data["by_day"].items()), columns=["Fecha", "Total"]
        )
        df["Fecha"] = pd.to_datetime(df["Fecha"])
        fig = px.area(df, x="Fecha", y="Total", color_discrete_sequence=["#e6007e"])
        fig.update_layout(
            margin=dict(l=0, r=0, t=10, b=0),
            height=280,
            yaxis_title="",
            xaxis_title="",
            plot_bgcolor="white",
        )
        fig.update_traces(line=dict(width=3), fillcolor="rgba(230,0,126,0.10)")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Aún no hay ventas registradas. Ve a **Ventas** para crear la primera.")

with right:
    section("Top productos", icon="")
    if data["top"]:
        for i, p in enumerate(data["top"], start=1):
            cols = st.columns([1, 4, 2])
            cols[0].markdown(f"**#{i}**")
            cols[1].write(p["name"])
            cols[2].markdown(f"**{p['qty']} pz**")
    else:
        st.caption("Sin datos suficientes.")

st.divider()

# ─── Stock bajo (alerta) ───
if data["low_stock"]:
    section("Stock por reabastecer", icon="")
    df = pd.DataFrame([
        {
            "Producto": (v.get("product") or {}).get("name") or "—",
            "Variante": v.get("variant_name") or "—",
            "Stock": int(v.get("stock") or 0),
            "Mínimo": int((v.get("product") or {}).get("min_stock") or 0),
        }
        for v in data["low_stock"]
    ])
    st.dataframe(df, use_container_width=True, hide_index=True)
else:
    st.success("Inventario sano: ningún producto bajo el mínimo.")
