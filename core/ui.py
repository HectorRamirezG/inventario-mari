"""Helpers de UI/formato compartidos por todas las páginas."""

from __future__ import annotations

import streamlit as st

from core.style import apply_style, page_hero


def page_setup(title: str) -> None:
    """Configuración base que TODAS las páginas usan: título, layout consistente, CSS global."""
    st.set_page_config(
        page_title=f"{title} · Mari Inventario",
        page_icon="https://api.iconify.design/lucide:sparkles.svg?color=%23e6007e",
        layout="wide",
        initial_sidebar_state="auto",
    )
    apply_style()


def page_header(title: str, subtitle: str = "", eyebrow: str = "MARI INVENTARIO") -> None:
    """Cabecera homologada (sin emojis, estilo editorial con barra rosa)."""
    page_hero(eyebrow=eyebrow, title=title, subtitle=subtitle)


def money(value: float | int | None) -> str:
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


def section(title: str, *, caption: str = "") -> None:
    """Título de sección con estilo consistente (eyebrow rosa)."""
    st.markdown(
        f"""
        <div style="margin: 24px 0 12px;">
            <div style="font-size: 0.7rem; font-weight: 800; letter-spacing: 0.18em;
                        text-transform: uppercase; color: #e6007e;">{title}</div>
            {f'<div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">{caption}</div>' if caption else ''}
        </div>
        """,
        unsafe_allow_html=True,
    )
