"""Calculadora de precios + configuración de tiers + historial."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from core.db import sb
from core.pricing import PriceCalculator, PricingConfig
from core.services import config as config_svc
from core.services.products import catalog, variants
from core.ui import money, page_header, page_setup, section

page_setup("Precios", icon="")
page_header(
    "Precios",
    subtitle="Calcula precios por nivel (menudeo / medio / mayoreo) y aplícalos a tus variantes",
    icon="",
)


@st.cache_data(ttl=15)
def _load_cfg() -> PricingConfig:
    return config_svc.get_config()


@st.cache_data(ttl=20)
def _load_catalog() -> list[dict]:
    return catalog()


cfg = _load_cfg()
calc = PriceCalculator(cfg)
cat = _load_catalog()

tab_calc, tab_config, tab_hist = st.tabs(["Calculadora", "Configuración", "Historial"])

# ════════════════════════════════════
# TAB: CALCULADORA
# ════════════════════════════════════
with tab_calc:
    if not cat:
        st.warning("Primero registra productos en **Inventario**.")
    else:
        section("Análisis por variante", icon="")
        st.caption(
            f"Margen actual: **menudeo {cfg.margen_menudeo:.0f}% · "
            f"medio {cfg.margen_medio:.0f}% · "
            f"mayoreo {cfg.margen_mayoreo:.0f}%** · "
            f"Costo extra: **{money(cfg.costo_extra)}**"
        )

        opts = {f"{v['product_name']} — {v['variant_name']} ({money(v['effective_cost'])})": v for v in cat}
        sel = st.selectbox("Selecciona una variante", list(opts.keys()))
        v = opts[sel]

        c1, c2 = st.columns([1, 1])
        with c1:
            override = st.number_input(
                "Costo a usar (puedes ajustarlo)",
                min_value=0.0,
                value=float(v["effective_cost"]),
                step=1.0,
            )
        with c2:
            qty = st.number_input("Cantidad típica de venta", min_value=1, value=1, step=1)

        # Sugerencias
        suggested = calc.suggest_all(override)
        current_tier = calc.tier_for(int(qty))

        st.markdown("**Precios sugeridos:**")
        sc1, sc2, sc3 = st.columns(3)
        for col, tier, label, emoji in [
            (sc1, "menudeo", "Menudeo", ""),
            (sc2, "medio", "Medio mayoreo", ""),
            (sc3, "mayoreo", "Mayoreo", ""),
        ]:
            is_active = current_tier == tier
            with col:
                st.metric(
                    f"{emoji} {label}{'' if is_active else ''}",
                    money(suggested[tier]),
                    delta=f"{calc.margin_of(tier):.0f}% margen · ≥{calc.threshold_of(tier)} pza",
                )

        if st.button("Guardar estos precios en la variante", type="primary", use_container_width=True):
            variants.update(v["id"], {
                "price": suggested["menudeo"],
                "price_menudeo": suggested["menudeo"],
                "price_medio": suggested["medio"],
                "price_mayoreo": suggested["mayoreo"],
            })
            sb.table("pricing_operations").insert({
                "product_id": v.get("product_id"),
                "product_name_snapshot": v["product_name"],
                "variant_name_snapshot": v["variant_name"],
                "quantity": int(qty),
                "cost_unit": override,
                "price_applied": suggested[current_tier],
                "tier": current_tier,
                "total": suggested[current_tier] * int(qty),
                "margin_percent": calc.margin_of(current_tier),
            }).execute()
            st.cache_data.clear()
            st.success("Precios actualizados y registrados en historial")

# ════════════════════════════════════
# TAB: CONFIGURACIÓN
# ════════════════════════════════════
with tab_config:
    section("Márgenes y umbrales", icon="")
    with st.form("cfg-form"):
        c1, c2, c3 = st.columns(3)
        m_men = c1.number_input("Margen Menudeo (%)", min_value=0.0, max_value=99.9, value=cfg.margen_menudeo, step=1.0)
        m_med = c2.number_input("Margen Medio (%)", min_value=0.0, max_value=99.9, value=cfg.margen_medio, step=1.0)
        m_may = c3.number_input("Margen Mayoreo (%)", min_value=0.0, max_value=99.9, value=cfg.margen_mayoreo, step=1.0)

        c4, c5, c6 = st.columns(3)
        u_med = c4.number_input("Umbral Medio (≥ pza)", min_value=1, value=cfg.umbral_medio, step=1)
        u_may = c5.number_input("Umbral Mayoreo (≥ pza)", min_value=1, value=cfg.umbral_mayoreo, step=1)
        c_extra = c6.number_input("Costo extra por unidad ($)", min_value=0.0, value=cfg.costo_extra, step=0.5)

        if st.form_submit_button("Guardar configuración", type="primary", use_container_width=True):
            if u_med >= u_may:
                st.error("El umbral de medio debe ser menor al de mayoreo.")
            elif m_men <= m_med or m_med <= m_may:
                st.warning("Recomendado: margen menudeo > medio > mayoreo. Lo guardo igual.")
                config_svc.save_config(PricingConfig(m_men, m_med, m_may, int(u_med), int(u_may), c_extra))
                st.cache_data.clear()
                st.rerun()
            else:
                config_svc.save_config(PricingConfig(m_men, m_med, m_may, int(u_med), int(u_may), c_extra))
                st.cache_data.clear()
                st.success("Configuración guardada")
                st.rerun()

# ════════════════════════════════════
# TAB: HISTORIAL
# ════════════════════════════════════
with tab_hist:
    section("Últimos análisis guardados", icon="")
    rows = (
        sb.table("pricing_operations")
        .select("*")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    if not rows:
        st.caption("Aún no hay registros.")
    else:
        df = pd.DataFrame([
            {
                "Fecha": r.get("created_at", "")[:16].replace("T", ""),
                "Producto": r.get("product_name_snapshot"),
                "Variante": r.get("variant_name_snapshot"),
                "Tier": r.get("tier"),
                "Cant.": r.get("quantity"),
                "Costo": float(r.get("cost_unit") or 0),
                "Precio": float(r.get("price_applied") or 0),
                "Margen %": float(r.get("margin_percent") or 0),
                "Total": float(r.get("total") or 0),
            }
            for r in rows
        ])
        st.dataframe(df, use_container_width=True, hide_index=True)
