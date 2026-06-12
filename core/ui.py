"""Helpers de UI/formato compartidos por todas las páginas."""

from __future__ import annotations

import streamlit as st


def page_setup(title: str, icon: str = "💄") -> None:
    """Configuración base que TODAS las páginas usan: título, icono, layout consistente."""
    st.set_page_config(
        page_title=f"{title} · Mari Inventario",
        page_icon=icon,
        layout="wide",
        initial_sidebar_state="expanded",
    )


def page_header(title: str, subtitle: str = "", icon: str = "💄") -> None:
    """Cabecera homologada para todas las pantallas."""
    col1, col2 = st.columns([1, 12])
    with col1:
        st.markdown(
            f"<div style='font-size:42px;line-height:1;'>{icon}</div>",
            unsafe_allow_html=True,
        )
    with col2:
        st.markdown(f"### {title}")
        if subtitle:
            st.caption(subtitle)
    st.divider()


def money(value: float | int | None) -> str:
    """Formato MXN consistente."""
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        n = 0.0
    return f"${n:,.2f}"


def money_int(value: float | int | None) -> str:
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        n = 0.0
    return f"${n:,.0f}"


def section(title: str, *, icon: str = "") -> None:
    label = f"{icon} {title}".strip()
    st.markdown(f"#### {label}")
