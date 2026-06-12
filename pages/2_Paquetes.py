"""Paquetes (bundles): combos de productos vendibles como uno solo."""

from __future__ import annotations

import streamlit as st

from core.services import bundles as bundles_svc
from core.services.products import catalog
from core.ui import money, page_header, page_setup, section

page_setup("Paquetes", icon="")
page_header(
    "Paquetes",
    subtitle="Combos de productos que se descuentan del stock automáticamente al venderlos",
    icon="",
)


@st.cache_data(ttl=15)
def _load_bundles() -> list[dict]:
    return bundles_svc.list_full()


@st.cache_data(ttl=30)
def _load_catalog() -> list[dict]:
    return catalog()


bundles_list = _load_bundles()
cat = _load_catalog()

if not cat:
    st.warning("Primero registra productos y variantes en la pestaña **Inventario**.")
    st.stop()

# ─── Editor de paquete ───
edit_id = st.session_state.get("bundle_edit_id")
editing = next((b for b in bundles_list if b["id"] == edit_id), None) if edit_id else None
is_new = st.session_state.get("bundle_new", False)

with st.expander(
    "Crear nuevo paquete" if not editing else f"Editando: {editing['name']}",
    expanded=is_new or bool(editing),
):
    initial_items = (
        [{"variant_id": i["variant_id"], "qty": i["qty"]} for i in (editing.get("items") or [])]
        if editing else []
    )
    state_key = f"draft_items_{edit_id or 'new'}"
    if state_key not in st.session_state:
        st.session_state[state_key] = initial_items

    # Datos básicos
    c1, c2 = st.columns([2, 1])
    name = c1.text_input("Nombre del paquete", value=editing.get("name") if editing else "",
                         key=f"bn-{edit_id or 'new'}", placeholder="Ej. Pack Belleza Total")
    price = c2.number_input("Precio del paquete", min_value=0.0, step=1.0,
                            value=float(editing.get("price") or 0) if editing else 0.0,
                            key=f"bp-{edit_id or 'new'}")
    desc = st.text_area("Descripción (opcional)", value=editing.get("description") if editing else "",
                        key=f"bd-{edit_id or 'new'}", height=70)
    counts = st.checkbox(
        "Las piezas de este paquete suman al carrito para detectar mayoreo",
        value=bool(editing.get("counts_as_wholesale")) if editing else True,
        key=f"bc-{edit_id or 'new'}",
    )

    st.markdown("**Productos en el paquete:**")

    # Items actuales
    cat_by_id = {c["id"]: c for c in cat}
    new_items: list[dict] = []
    items_to_remove = []
    for idx, it in enumerate(st.session_state[state_key]):
        v = cat_by_id.get(it["variant_id"])
        if not v:
            continue
        cols = st.columns([4, 2, 2, 1])
        cols[0].write(f"**{v['product_name']}** — {v['variant_name']}")
        cols[1].caption(f"Costo unit: {money(v['effective_cost'])}")
        new_qty = cols[2].number_input("Cantidad", min_value=1, value=int(it["qty"]),
                                        key=f"q-{state_key}-{idx}", step=1, label_visibility="collapsed")
        if cols[3].button("", key=f"rm-{state_key}-{idx}"):
            items_to_remove.append(idx)
        new_items.append({"variant_id": it["variant_id"], "qty": int(new_qty)})

    if items_to_remove:
        st.session_state[state_key] = [
            i for idx, i in enumerate(new_items) if idx not in items_to_remove
        ]
        st.rerun()
    else:
        st.session_state[state_key] = new_items

    # Agregar variante
    with st.form(f"add-item-{edit_id or 'new'}", clear_on_submit=True):
        used_ids = {i["variant_id"] for i in st.session_state[state_key]}
        available = [c for c in cat if c["id"] not in used_ids]
        if not available:
            st.caption("Todas las variantes ya están en el paquete.")
        else:
            options = {f"{v['product_name']} — {v['variant_name']} (stock: {v.get('stock', 0)})": v["id"] for v in available}
            ac1, ac2, ac3 = st.columns([4, 1, 1])
            sel = ac1.selectbox("Variante a agregar", list(options.keys()), label_visibility="collapsed")
            qty_add = ac2.number_input("Qty", min_value=1, value=1, step=1, label_visibility="collapsed")
            if ac3.form_submit_button("Agregar"):
                st.session_state[state_key].append({"variant_id": options[sel], "qty": int(qty_add)})
                st.rerun()

    # Resumen
    st.markdown("---")
    pieces = sum(int(i["qty"]) for i in st.session_state[state_key])
    cost_sum = sum(
        cat_by_id[i["variant_id"]]["effective_cost"] * int(i["qty"])
        for i in st.session_state[state_key]
        if i["variant_id"] in cat_by_id
    )
    saving = float(price or 0) - cost_sum if price else 0

    s1, s2, s3, s4 = st.columns(4)
    s1.metric("Piezas", pieces)
    s2.metric("Costo total", money(cost_sum))
    s3.metric("Precio", money(price))
    s4.metric(
        "Margen $",
        money(saving),
        delta=("ganas" if saving >= 0 else "pierdes"),
        delta_color="normal" if saving >= 0 else "inverse",
    )

    b1, b2, b3 = st.columns(3)
    if b1.button("Guardar paquete", type="primary", use_container_width=True,
                 disabled=not (name.strip() and st.session_state[state_key])):
        payload = {
            "id": edit_id,
            "name": name.strip(),
            "description": desc.strip() or None,
            "price": float(price),
            "counts_as_wholesale": counts,
            "items": st.session_state[state_key],
        }
        bundles_svc.upsert_with_items(payload)
        st.session_state.pop("bundle_edit_id", None)
        st.session_state.pop("bundle_new", None)
        st.session_state.pop(state_key, None)
        st.cache_data.clear()
        st.success("Paquete guardado")
        st.rerun()

    if b2.button("Eliminar", use_container_width=True, disabled=not editing):
        if editing:
            bundles_svc.bundles.remove(editing["id"])
            st.session_state.pop("bundle_edit_id", None)
            st.session_state.pop(state_key, None)
            st.cache_data.clear()
            st.rerun()

    if b3.button("Cancelar", use_container_width=True):
        st.session_state.pop("bundle_edit_id", None)
        st.session_state.pop("bundle_new", None)
        st.session_state.pop(state_key, None)
        st.rerun()

st.divider()

# ─── Lista de paquetes existentes ───
section(f"{len(bundles_list)} paquete(s) activo(s)")

if not bundles_list:
    st.info("Aún no hay paquetes. Crea el primero arriba.")
else:
    for b in bundles_list:
        items = b.get("items") or []
        pieces = bundles_svc.total_pieces(b)
        cost = bundles_svc.total_cost(b)
        margin = float(b.get("price") or 0) - cost

        with st.container(border=True):
            cols = st.columns([3, 1, 1, 1, 1])
            cols[0].markdown(f"**{b['name']}**")
            cols[0].caption(b.get("description") or "—")
            cols[1].metric("Piezas", pieces, label_visibility="visible")
            cols[2].metric("Precio", money(b.get("price")))
            cols[3].metric("Costo", money(cost))
            cols[4].metric(
                "Margen",
                money(margin),
                delta=("" if margin >= 0 else ""),
                delta_color="normal" if margin >= 0 else "inverse",
            )

            tags = []
            if b.get("counts_as_wholesale"):
                tags.append("cuenta para mayoreo")
            tags.append(f"{len(items)} producto(s)")
            st.caption("·".join(tags))

            if st.button("Editar", key=f"edit-{b['id']}"):
                st.session_state["bundle_edit_id"] = b["id"]
                st.rerun()
