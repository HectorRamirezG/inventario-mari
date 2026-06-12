"""Inventario: productos + variantes + entradas/salidas/ajustes."""

from __future__ import annotations

import streamlit as st

from core.db import sb
from core.services import movements as movements_svc
from core.services.products import products, variants
from core.ui import money, page_header, page_setup, section

page_setup("Inventario", icon="📦")
page_header("Inventario", subtitle="Productos, variantes y movimientos de stock", icon="📦")


@st.cache_data(ttl=10)
def _load() -> list[dict]:
    return products.list_active()


prods = _load()

# ─── Acción: nuevo producto ───
with st.expander("➕ Crear nuevo producto", expanded=not prods):
    with st.form("new_product", clear_on_submit=True):
        c1, c2, c3 = st.columns([2, 1, 1])
        name = c1.text_input("Nombre del producto", placeholder="Ej. Labial Mate")
        category = c2.text_input("Categoría", placeholder="Maquillaje")
        cost = c3.number_input("Costo unitario", min_value=0.0, step=1.0, value=0.0)
        c4, c5 = st.columns([1, 3])
        min_stock = c4.number_input("Stock mínimo", min_value=0, step=1, value=3)

        if st.form_submit_button("Crear producto", type="primary", use_container_width=True):
            if not name.strip():
                st.error("Pon un nombre.")
            else:
                products.create({
                    "name": name.strip(),
                    "category": category.strip() or None,
                    "cost": cost,
                    "min_stock": min_stock,
                })
                st.cache_data.clear()
                st.success(f"✅ Creado: {name}")
                st.rerun()

st.divider()

# ─── Buscador ───
q = st.text_input("🔍 Buscar producto o variante", placeholder="Escribe para filtrar...")
if q:
    needle = q.lower().strip()
    prods = [
        p for p in prods
        if needle in (p.get("name") or "").lower()
        or needle in (p.get("category") or "").lower()
        or any(needle in (v.get("variant_name") or "").lower() or needle in (v.get("sku") or "").lower()
               for v in (p.get("variants") or []))
    ]

if not prods:
    st.info("📭 Sin productos. Crea uno arriba para empezar.")
    st.stop()

# ─── Listado de productos ───
section(f"{len(prods)} producto(s)", icon="🗂️")

for p in prods:
    p_variants = p.get("variants") or []
    total_stock = sum(int(v.get("stock") or 0) for v in p_variants)
    min_stock = int(p.get("min_stock") or 0)
    is_low = total_stock <= min_stock

    icon = "🔴" if is_low else "🟢"
    label = f"{icon} **{p.get('name')}** · _{p.get('category') or 'sin categoría'}_ · {len(p_variants)} variante(s) · {total_stock} pza"

    with st.expander(label):
        # Datos del producto editable
        with st.form(f"edit-prod-{p['id']}", border=False):
            c1, c2, c3, c4 = st.columns([2, 1, 1, 1])
            new_name = c1.text_input("Nombre", value=p.get("name") or "", key=f"n-{p['id']}")
            new_cat = c2.text_input("Categoría", value=p.get("category") or "", key=f"c-{p['id']}")
            new_cost = c3.number_input("Costo", value=float(p.get("cost") or 0), step=1.0, key=f"cost-{p['id']}")
            new_min = c4.number_input("Stock mín.", value=min_stock, step=1, key=f"m-{p['id']}")

            cb1, cb2 = st.columns(2)
            if cb1.form_submit_button("💾 Guardar cambios", use_container_width=True):
                products.update(p["id"], {
                    "name": new_name.strip(),
                    "category": new_cat.strip() or None,
                    "cost": new_cost,
                    "min_stock": int(new_min),
                })
                st.cache_data.clear()
                st.success("Actualizado")
                st.rerun()
            if cb2.form_submit_button("🗑️ Eliminar producto", use_container_width=True):
                # Borrar variantes primero
                sb.table("variants").delete().eq("product_id", p["id"]).execute()
                products.remove(p["id"])
                st.cache_data.clear()
                st.warning(f"Eliminado: {p.get('name')}")
                st.rerun()

        st.markdown("**Variantes:**")

        # Tabla de variantes existentes
        for v in p_variants:
            stock = int(v.get("stock") or 0)
            badge = "🔴" if stock <= min_stock else "🟢"
            cols = st.columns([3, 2, 1, 1, 1, 1, 1])
            cols[0].write(f"{badge} **{v.get('variant_name') or 'Único'}**")
            cols[1].caption(f"SKU: {v.get('sku') or '—'}")
            cols[2].metric("Stock", stock, label_visibility="collapsed")
            cols[3].markdown(f"**{money(v.get('price'))}**")

            # Botones rápidos
            if cols[4].button("➕", key=f"in-{v['id']}", help="Entrada de stock"):
                st.session_state[f"mov-{v['id']}"] = "entrada"
            if cols[5].button("➖", key=f"out-{v['id']}", help="Salida/ajuste"):
                st.session_state[f"mov-{v['id']}"] = "salida"
            if cols[6].button("✏️", key=f"ed-{v['id']}", help="Editar variante"):
                st.session_state[f"edv-{v['id']}"] = True

            # Modal de movimiento
            if st.session_state.get(f"mov-{v['id']}"):
                tipo = st.session_state[f"mov-{v['id']}"]
                with st.form(f"mov-form-{v['id']}", border=True):
                    st.markdown(f"**{'➕ Agregar' if tipo == 'entrada' else '➖ Reducir'} stock — {v.get('variant_name')}**")
                    qty = st.number_input("Cantidad", min_value=1, step=1, value=1, key=f"q-{v['id']}")
                    ref = st.text_input("Nota (opcional)", placeholder="Ej. compra a proveedor", key=f"r-{v['id']}")
                    fc1, fc2 = st.columns(2)
                    if fc1.form_submit_button("Confirmar", type="primary", use_container_width=True):
                        movements_svc.apply(v["id"], tipo, int(qty), ref)
                        del st.session_state[f"mov-{v['id']}"]
                        st.cache_data.clear()
                        st.success("Movimiento registrado")
                        st.rerun()
                    if fc2.form_submit_button("Cancelar", use_container_width=True):
                        del st.session_state[f"mov-{v['id']}"]
                        st.rerun()

            # Editor de variante
            if st.session_state.get(f"edv-{v['id']}"):
                with st.form(f"edv-form-{v['id']}", border=True):
                    st.markdown("**Editar variante**")
                    e1, e2, e3 = st.columns(3)
                    nm = e1.text_input("Nombre", value=v.get("variant_name") or "", key=f"vn-{v['id']}")
                    sk = e2.text_input("SKU", value=v.get("sku") or "", key=f"vs-{v['id']}")
                    co = e3.number_input("Costo override (vacío = del producto)", value=float(v.get("cost_override") or 0), step=1.0, key=f"vc-{v['id']}")
                    p1, p2, p3 = st.columns(3)
                    pm = p1.number_input("Precio menudeo", value=float(v.get("price_menudeo") or v.get("price") or 0), step=1.0, key=f"pm-{v['id']}")
                    pme = p2.number_input("Precio medio", value=float(v.get("price_medio") or 0), step=1.0, key=f"pme-{v['id']}")
                    pma = p3.number_input("Precio mayoreo", value=float(v.get("price_mayoreo") or 0), step=1.0, key=f"pma-{v['id']}")

                    fc1, fc2, fc3 = st.columns(3)
                    if fc1.form_submit_button("💾 Guardar", type="primary", use_container_width=True):
                        variants.update(v["id"], {
                            "variant_name": nm.strip() or "Único",
                            "sku": sk.strip() or None,
                            "cost_override": co if co > 0 else None,
                            "price": pm,
                            "price_menudeo": pm,
                            "price_medio": pme,
                            "price_mayoreo": pma,
                        })
                        del st.session_state[f"edv-{v['id']}"]
                        st.cache_data.clear()
                        st.success("Variante actualizada")
                        st.rerun()
                    if fc2.form_submit_button("🗑️ Eliminar variante", use_container_width=True):
                        variants.remove(v["id"])
                        del st.session_state[f"edv-{v['id']}"]
                        st.cache_data.clear()
                        st.rerun()
                    if fc3.form_submit_button("Cancelar", use_container_width=True):
                        del st.session_state[f"edv-{v['id']}"]
                        st.rerun()

        # Agregar nueva variante
        with st.form(f"new-var-{p['id']}", clear_on_submit=True, border=True):
            st.markdown("**➕ Nueva variante**")
            n1, n2, n3, n4 = st.columns([2, 1, 1, 1])
            vname = n1.text_input("Nombre variante", placeholder="Ej. Rojo cereza", key=f"nv-{p['id']}")
            vsku = n2.text_input("SKU", placeholder="opcional", key=f"ns-{p['id']}")
            vstock = n3.number_input("Stock inicial", min_value=0, step=1, value=0, key=f"nst-{p['id']}")
            vprice = n4.number_input("Precio", min_value=0.0, step=1.0, value=0.0, key=f"npr-{p['id']}")
            if st.form_submit_button("Agregar variante", use_container_width=True):
                if not vname.strip():
                    st.error("Pon un nombre.")
                else:
                    variants.create({
                        "product_id": p["id"],
                        "variant_name": vname.strip(),
                        "sku": vsku.strip() or None,
                        "stock": int(vstock),
                        "price": vprice,
                        "price_menudeo": vprice,
                    })
                    st.cache_data.clear()
                    st.rerun()
