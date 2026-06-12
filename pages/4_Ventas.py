"""Punto de venta: carrito + tier por carrito + upsell + RPC atómica."""

from __future__ import annotations

import streamlit as st

from core.pricing import PriceCalculator, Tier
from core.services import bundles as bundles_svc
from core.services import config as config_svc
from core.services import sales as sales_svc
from core.services.products import catalog
from core.ui import money, page_header, page_setup, section

page_setup("Ventas", icon="")
page_header(
    "Punto de Venta",
    subtitle="Agrega productos y paquetes; el sistema detecta el mejor precio por carrito",
    icon="",
)


@st.cache_data(ttl=15)
def _load_catalog() -> list[dict]:
    return catalog()


@st.cache_data(ttl=15)
def _load_bundles() -> list[dict]:
    return bundles_svc.list_full()


@st.cache_data(ttl=30)
def _load_cfg():
    return config_svc.get_config()


cat = _load_catalog()
bundles_list = _load_bundles()
cfg = _load_cfg()
calc = PriceCalculator(cfg)

# ─── Estado del carrito ───
if "cart" not in st.session_state:
    st.session_state.cart = []  # cada item: {kind: 'variant'|'bundle', id, ...}
if "customer" not in st.session_state:
    st.session_state.customer = ""
if "paid" not in st.session_state:
    st.session_state.paid = 0.0


def _find_in_cart(kind: str, id_: str):
    for line in st.session_state.cart:
        if line["kind"] == kind and line["id"] == id_:
            return line
    return None


def add_variant(v: dict) -> None:
    line = _find_in_cart("variant", v["id"])
    if line:
        line["qty"] += 1
    else:
        st.session_state.cart.append({
            "kind": "variant",
            "id": v["id"],
            "product_id": v.get("product_id"),
            "name": v["product_name"],
            "variant_name": v["variant_name"],
            "qty": 1,
            "cost": float(v["effective_cost"]),
            "prices": {
                "menudeo": float(v.get("price_menudeo") or v.get("price") or 0),
                "medio": float(v.get("price_medio") or v.get("price") or 0),
                "mayoreo": float(v.get("price_mayoreo") or v.get("price") or 0),
            },
            "stock_max": int(v.get("stock") or 0),
        })


def add_bundle(b: dict) -> None:
    line = _find_in_cart("bundle", b["id"])
    if line:
        line["qty"] += 1
    else:
        pieces = bundles_svc.total_pieces(b)
        st.session_state.cart.append({
            "kind": "bundle",
            "id": b["id"],
            "name": b["name"],
            "qty": 1,
            "unit_price": float(b.get("price") or 0),
            "pieces": pieces,
            "counts_as_wholesale": bool(b.get("counts_as_wholesale")),
        })


def total_pieces() -> int:
    """Suma piezas para detectar tier (variantes + bundles que cuentan)."""
    n = 0
    for line in st.session_state.cart:
        if line["kind"] == "variant":
            n += line["qty"]
        elif line["kind"] == "bundle" and line.get("counts_as_wholesale"):
            n += line["qty"] * line["pieces"]
    return n


tier_pieces = total_pieces()
cart_tier: Tier = calc.tier_for(tier_pieces)

# Calcular total
total = 0.0
for line in st.session_state.cart:
    if line["kind"] == "variant":
        line["unit_price"] = line["prices"][cart_tier]
        total += line["qty"] * line["unit_price"]
    else:
        total += line["qty"] * line["unit_price"]

balance = max(0.0, total - float(st.session_state.paid or 0))

# ─── Layout ───
left, right = st.columns([1, 1])

# ════════ IZQUIERDA: catálogo ════════
with left:
    section("Catálogo", icon="")
    tab_p, tab_b = st.tabs(["Productos", f"Paquetes ({len(bundles_list)})"])

    with tab_p:
        q = st.text_input("Buscar producto", key="q-prod", label_visibility="collapsed", placeholder="Buscar...")
        filtered = cat
        if q:
            n = q.lower()
            filtered = [c for c in cat if n in (c["product_name"] + c["variant_name"] + (c.get("sku") or "")).lower()]

        if not filtered:
            st.caption("Sin resultados")
        else:
            for v in filtered[:60]:
                stock = int(v.get("stock") or 0)
                disabled = stock <= 0
                label = f"{v['product_name']} — {v['variant_name']}"
                cols = st.columns([4, 2, 2])
                cols[0].write(f"**{v['product_name']}**")
                cols[0].caption(f"{v['variant_name']} · stock {stock}")
                cols[1].markdown(f"**{money(v.get('price_menudeo') or v.get('price'))}**")
                if cols[2].button("Añadir", key=f"add-v-{v['id']}", disabled=disabled, use_container_width=True):
                    add_variant(v)
                    st.rerun()

    with tab_b:
        if not bundles_list:
            st.caption("No hay paquetes creados. Ve a la pestaña **Paquetes**.")
        for b in bundles_list:
            cols = st.columns([4, 2, 2])
            cols[0].write(f"**{b['name']}**")
            cols[0].caption(f"{bundles_svc.total_pieces(b)} pza" + ("· cuenta mayoreo" if b.get("counts_as_wholesale") else ""))
            cols[1].markdown(f"**{money(b.get('price'))}**")
            if cols[2].button("Añadir", key=f"add-b-{b['id']}", use_container_width=True):
                add_bundle(b)
                st.rerun()

# ════════ DERECHA: carrito ════════
with right:
    section(f"Carrito · {len(st.session_state.cart)} ítem(s)")

    # Banner upsell
    gap = calc.next_tier_gap(tier_pieces)
    if gap:
        next_tier, missing = gap
        if missing > 0:
            # estimar ahorro: diferencia entre tier actual y siguiente sobre las variantes en carrito
            saving = 0.0
            for line in st.session_state.cart:
                if line["kind"] == "variant":
                    diff = max(0.0, line["unit_price"] - line["prices"][next_tier])
                    saving += diff * line["qty"]
            st.info(
                f"Faltan **{missing} pza** para **{next_tier.upper()}**. "
                f"El cliente ahorraría **{money(saving)}** si llega al siguiente nivel.",
                icon="",
            )

    # Tier + total
    tc1, tc2, tc3 = st.columns(3)
    tc1.metric("Piezas", tier_pieces)
    tc2.metric("Tier", cart_tier.upper())
    tc3.metric("Total", money(total))

    if not st.session_state.cart:
        st.caption("Carrito vacío. Agrega productos del catálogo.")
    else:
        for idx, line in enumerate(st.session_state.cart):
            with st.container(border=True):
                c1, c2, c3, c4 = st.columns([4, 2, 2, 1])
                if line["kind"] == "variant":
                    c1.write(f"**{line['name']}**")
                    c1.caption(f"{line['variant_name']} · {cart_tier}")
                else:
                    c1.write(f"**{line['name']}**")
                    c1.caption(f"Paquete · {line['pieces']} pza c/u")

                new_qty = c2.number_input(
                    "qty", min_value=0, value=int(line["qty"]),
                    key=f"qty-{idx}", step=1, label_visibility="collapsed"
                )
                if new_qty != line["qty"]:
                    if new_qty <= 0:
                        st.session_state.cart.pop(idx)
                    else:
                        line["qty"] = int(new_qty)
                    st.rerun()

                c3.markdown(f"**{money(line['qty'] * line['unit_price'])}**")
                c3.caption(f"{money(line['unit_price'])} c/u")

                if c4.button("", key=f"rm-{idx}"):
                    st.session_state.cart.pop(idx)
                    st.rerun()

        st.divider()

        # Cliente / Pagado
        f1, f2 = st.columns(2)
        st.session_state.customer = f1.text_input(
            "Cliente (opcional)", value=st.session_state.customer, placeholder="Nombre del cliente"
        )
        st.session_state.paid = f2.number_input(
            "Pagado", min_value=0.0, value=float(st.session_state.paid or 0), step=10.0
        )

        if balance > 0:
            st.warning(f"Saldo pendiente: **{money(balance)}**")
        elif st.session_state.paid > total:
            st.success(f"Cambio: **{money(st.session_state.paid - total)}**")

        # Confirmar
        if st.button("Confirmar venta", type="primary", use_container_width=True, disabled=not st.session_state.cart):
            payload = {
                "customer": st.session_state.customer or None,
                "paid": float(st.session_state.paid or 0),
                "items": [
                    {
                        "variant_id": line["id"],
                        "product_id": line.get("product_id"),
                        "name": line["name"],
                        "variant_name": line["variant_name"],
                        "qty": line["qty"],
                        "unit_price": line["unit_price"],
                        "cost": line["cost"],
                        "tier": cart_tier,
                    }
                    for line in st.session_state.cart if line["kind"] == "variant"
                ],
                "bundles": [
                    {
                        "bundle_id": line["id"],
                        "name": line["name"],
                        "qty": line["qty"],
                        "unit_price": line["unit_price"],
                    }
                    for line in st.session_state.cart if line["kind"] == "bundle"
                ],
            }
            try:
                sales_svc.create_sale(payload)
                st.session_state.cart = []
                st.session_state.customer = ""
                st.session_state.paid = 0.0
                st.cache_data.clear()
                st.success("Venta registrada con éxito")
                st.balloons()
                st.rerun()
            except Exception as e:
                st.error(f"Error al guardar: {e}")

        if st.button("Vaciar carrito", use_container_width=True):
            st.session_state.cart = []
            st.session_state.customer = ""
            st.session_state.paid = 0.0
            st.rerun()
