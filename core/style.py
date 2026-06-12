"""Estilos globales: tema rosa pro, animaciones, responsive móvil.

Uso: `from core.style import apply_style; apply_style()` al inicio de cada página.
"""

from __future__ import annotations

import streamlit as st

CSS = """
<style>
/* ═══════════════════════════════════════════════════════════
   FONT
═══════════════════════════════════════════════════════════ */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

* { font-family: 'Inter', system-ui, -apple-system, sans-serif !important; }

/* ═══════════════════════════════════════════════════════════
   FONDO PRINCIPAL CON MESH GRADIENT
═══════════════════════════════════════════════════════════ */
.stApp {
    background:
        radial-gradient(at 0% 0%, rgba(230, 0, 126, 0.06) 0%, transparent 45%),
        radial-gradient(at 100% 100%, rgba(255, 182, 193, 0.08) 0%, transparent 45%),
        radial-gradient(at 100% 0%, #fff5f9 0%, transparent 35%),
        #ffffff !important;
}

/* Ocultar branding Streamlit */
#MainMenu, footer, header[data-testid="stHeader"] { visibility: hidden; height: 0; }

/* Padding general más respirado */
.main .block-container {
    padding-top: 2rem !important;
    padding-bottom: 6rem !important;
    max-width: 1280px !important;
    animation: fadeUp 0.4s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.6; }
}

@keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
}

/* ═══════════════════════════════════════════════════════════
   SIDEBAR PRO
═══════════════════════════════════════════════════════════ */
section[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #fff7fb 0%, #ffffff 100%) !important;
    border-right: 1px solid rgba(230, 0, 126, 0.08) !important;
    box-shadow: 4px 0 24px -8px rgba(230, 0, 126, 0.04) !important;
}

section[data-testid="stSidebar"] .stMarkdown h2,
section[data-testid="stSidebar"] .stMarkdown h3 {
    background: linear-gradient(135deg, #e6007e 0%, #ff5fa8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 900 !important;
    letter-spacing: -0.02em;
}

/* Items de navegación */
section[data-testid="stSidebarNav"] ul li a {
    border-radius: 14px !important;
    margin: 2px 8px !important;
    padding: 10px 14px !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    font-weight: 600 !important;
    font-size: 13px !important;
}
section[data-testid="stSidebarNav"] ul li a:hover {
    background: rgba(230, 0, 126, 0.06) !important;
    transform: translateX(2px);
}
section[data-testid="stSidebarNav"] ul li a[aria-current="page"] {
    background: linear-gradient(135deg, rgba(230, 0, 126, 0.10) 0%, rgba(255, 95, 168, 0.05) 100%) !important;
    color: #e6007e !important;
    font-weight: 700 !important;
    box-shadow: inset 0 0 0 1px rgba(230, 0, 126, 0.12);
}

/* ═══════════════════════════════════════════════════════════
   TÍTULOS Y TEXTO
═══════════════════════════════════════════════════════════ */
h1, h2, h3, h4 {
    font-weight: 800 !important;
    letter-spacing: -0.025em !important;
    color: #0f172a !important;
}
h1 { font-size: 2rem !important; }
h3 { font-size: 1.35rem !important; }

/* ═══════════════════════════════════════════════════════════
   PAGE HEADER PRO (barra rosa lateral + título)
═══════════════════════════════════════════════════════════ */
.page-hero {
    display: flex;
    gap: 18px;
    align-items: center;
    margin-bottom: 28px;
    padding: 24px 26px;
    background: linear-gradient(135deg, #ffffff 0%, #fff5f9 100%);
    border: 1px solid rgba(230, 0, 126, 0.08);
    border-radius: 22px;
    box-shadow: 0 8px 32px -16px rgba(230, 0, 126, 0.10);
    position: relative;
    overflow: hidden;
    animation: fadeUp 0.5s cubic-bezier(0.23, 1, 0.32, 1);
}
.page-hero::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 5px;
    background: linear-gradient(180deg, #e6007e 0%, #ff5fa8 100%);
    border-radius: 22px 0 0 22px;
}
.page-hero .hero-title {
    font-size: 1.6rem;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.03em;
    margin: 0;
    line-height: 1.1;
}
.page-hero .hero-eyebrow {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #e6007e;
    margin-bottom: 4px;
}
.page-hero .hero-sub {
    color: #64748b;
    font-size: 0.85rem;
    margin-top: 6px;
    font-weight: 500;
}

/* ═══════════════════════════════════════════════════════════
   BOTONES
═══════════════════════════════════════════════════════════ */
.stButton > button {
    border-radius: 14px !important;
    font-weight: 700 !important;
    font-size: 0.85rem !important;
    letter-spacing: 0.01em !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    border: 1px solid rgba(15, 23, 42, 0.06) !important;
    box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02) !important;
}
.stButton > button:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px -8px rgba(15, 23, 42, 0.12) !important;
}
.stButton > button:active { transform: translateY(0); }

/* Primary */
.stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #e6007e 0%, #ff3d92 100%) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 8px 24px -8px rgba(230, 0, 126, 0.50) !important;
}
.stButton > button[kind="primary"]:hover {
    box-shadow: 0 14px 30px -8px rgba(230, 0, 126, 0.60) !important;
    transform: translateY(-2px);
}

/* ═══════════════════════════════════════════════════════════
   INPUTS
═══════════════════════════════════════════════════════════ */
.stTextInput > div > div > input,
.stNumberInput > div > div > input,
.stTextArea textarea,
.stSelectbox > div > div {
    border-radius: 12px !important;
    border: 1px solid rgba(15, 23, 42, 0.08) !important;
    transition: all 0.2s ease !important;
    font-weight: 500 !important;
}
.stTextInput > div > div > input:focus,
.stNumberInput > div > div > input:focus,
.stTextArea textarea:focus {
    border-color: #e6007e !important;
    box-shadow: 0 0 0 4px rgba(230, 0, 126, 0.10) !important;
}

/* ═══════════════════════════════════════════════════════════
   MÉTRICAS PRO
═══════════════════════════════════════════════════════════ */
[data-testid="stMetric"] {
    background: #ffffff;
    padding: 18px 20px;
    border-radius: 18px;
    border: 1px solid rgba(15, 23, 42, 0.05);
    box-shadow: 0 4px 16px -8px rgba(15, 23, 42, 0.06);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    animation: fadeUp 0.5s cubic-bezier(0.23, 1, 0.32, 1) backwards;
}
[data-testid="stMetric"]:hover {
    transform: translateY(-3px);
    box-shadow: 0 16px 32px -12px rgba(230, 0, 126, 0.18);
    border-color: rgba(230, 0, 126, 0.15);
}
[data-testid="stMetricLabel"] {
    font-size: 0.7rem !important;
    font-weight: 800 !important;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #94a3b8 !important;
}
[data-testid="stMetricValue"] {
    font-weight: 900 !important;
    font-size: 1.6rem !important;
    color: #0f172a !important;
    letter-spacing: -0.025em;
    font-variant-numeric: tabular-nums;
}
[data-testid="stMetricDelta"] {
    font-size: 0.72rem !important;
    font-weight: 700 !important;
}

/* ═══════════════════════════════════════════════════════════
   CONTENEDORES "border=True" → CARDS PRO
═══════════════════════════════════════════════════════════ */
[data-testid="stVerticalBlockBorderWrapper"] {
    border-radius: 20px !important;
    border: 1px solid rgba(15, 23, 42, 0.05) !important;
    background: #ffffff !important;
    box-shadow: 0 4px 16px -8px rgba(15, 23, 42, 0.06) !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    padding: 4px !important;
}
[data-testid="stVerticalBlockBorderWrapper"]:hover {
    box-shadow: 0 12px 28px -10px rgba(230, 0, 126, 0.12) !important;
    border-color: rgba(230, 0, 126, 0.12) !important;
}

/* ═══════════════════════════════════════════════════════════
   EXPANDERS
═══════════════════════════════════════════════════════════ */
[data-testid="stExpander"] {
    border-radius: 18px !important;
    border: 1px solid rgba(15, 23, 42, 0.05) !important;
    background: #ffffff !important;
    overflow: hidden;
    transition: all 0.25s ease;
    box-shadow: 0 2px 8px -4px rgba(15, 23, 42, 0.04);
}
[data-testid="stExpander"]:hover {
    border-color: rgba(230, 0, 126, 0.15) !important;
    box-shadow: 0 8px 22px -10px rgba(230, 0, 126, 0.10) !important;
}
[data-testid="stExpander"] summary {
    font-weight: 700 !important;
    padding: 14px 18px !important;
}

/* ═══════════════════════════════════════════════════════════
   TABS
═══════════════════════════════════════════════════════════ */
.stTabs [role="tablist"] {
    gap: 4px;
    background: rgba(255, 245, 249, 0.6);
    padding: 6px;
    border-radius: 16px;
    border: 1px solid rgba(230, 0, 126, 0.06);
}
.stTabs [role="tab"] {
    border-radius: 12px !important;
    padding: 8px 18px !important;
    font-weight: 700 !important;
    font-size: 0.78rem !important;
    letter-spacing: 0.05em !important;
    text-transform: uppercase;
    color: #94a3b8 !important;
    transition: all 0.2s ease !important;
    border: none !important;
}
.stTabs [role="tab"]:hover { color: #0f172a !important; }
.stTabs [role="tab"][aria-selected="true"] {
    background: #ffffff !important;
    color: #e6007e !important;
    box-shadow: 0 2px 8px -2px rgba(230, 0, 126, 0.18);
}

/* ═══════════════════════════════════════════════════════════
   ALERTAS / INFO
═══════════════════════════════════════════════════════════ */
.stAlert {
    border-radius: 16px !important;
    border: none !important;
    padding: 14px 18px !important;
    box-shadow: 0 4px 12px -4px rgba(15, 23, 42, 0.06) !important;
    animation: fadeUp 0.3s ease;
}

/* ═══════════════════════════════════════════════════════════
   DATAFRAMES
═══════════════════════════════════════════════════════════ */
[data-testid="stDataFrame"] {
    border-radius: 16px !important;
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.05);
    box-shadow: 0 4px 12px -6px rgba(15, 23, 42, 0.06);
}

/* ═══════════════════════════════════════════════════════════
   DIVIDER
═══════════════════════════════════════════════════════════ */
hr {
    border: none !important;
    height: 1px !important;
    background: linear-gradient(90deg, transparent, rgba(230, 0, 126, 0.15), transparent) !important;
    margin: 28px 0 !important;
}

/* ═══════════════════════════════════════════════════════════
   SCROLLBAR
═══════════════════════════════════════════════════════════ */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
    background: rgba(230, 0, 126, 0.15);
    border-radius: 99px;
    transition: background 0.2s;
}
::-webkit-scrollbar-thumb:hover { background: rgba(230, 0, 126, 0.35); }

/* ═══════════════════════════════════════════════════════════
   CAPTION REFINADO
═══════════════════════════════════════════════════════════ */
.stCaption, [data-testid="stCaptionContainer"] {
    color: #94a3b8 !important;
    font-size: 0.78rem !important;
    font-weight: 500 !important;
}

/* ═══════════════════════════════════════════════════════════
   CHIP / BADGE personalizado
═══════════════════════════════════════════════════════════ */
.chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 99px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}
.chip-primary { background: rgba(230, 0, 126, 0.10); color: #e6007e; }
.chip-success { background: rgba(16, 185, 129, 0.10); color: #059669; }
.chip-warn    { background: rgba(245, 158, 11, 0.10); color: #d97706; }
.chip-danger  { background: rgba(239, 68, 68, 0.10);  color: #dc2626; }
.chip-neutral { background: rgba(15, 23, 42, 0.06);   color: #475569; }

/* ═══════════════════════════════════════════════════════════
   RESPONSIVE — MOBILE FIRST
═══════════════════════════════════════════════════════════ */
@media (max-width: 768px) {
    .main .block-container {
        padding: 1rem 0.75rem 5rem !important;
    }
    .page-hero {
        padding: 18px 20px !important;
        border-radius: 18px;
    }
    .page-hero .hero-title { font-size: 1.25rem !important; }
    .page-hero .hero-eyebrow { font-size: 0.62rem !important; }

    [data-testid="stMetric"] {
        padding: 14px 16px;
        border-radius: 14px;
    }
    [data-testid="stMetricValue"] { font-size: 1.25rem !important; }
    [data-testid="stMetricLabel"] { font-size: 0.62rem !important; }

    .stTabs [role="tab"] {
        padding: 6px 12px !important;
        font-size: 0.7rem !important;
    }

    h1 { font-size: 1.5rem !important; }
    h3 { font-size: 1.1rem !important; }

    /* Sidebar más compacto */
    section[data-testid="stSidebar"] { min-width: 240px !important; }
}

@media (max-width: 480px) {
    .stColumn { min-width: 100% !important; }
}
</style>
"""


def apply_style() -> None:
    """Inyecta el CSS global. Llamar al inicio de cada página después de page_setup."""
    st.markdown(CSS, unsafe_allow_html=True)


def page_hero(eyebrow: str, title: str, subtitle: str = "") -> None:
    """Cabecera elegante con barra de acento rosa, sin emojis."""
    st.markdown(
        f"""
        <div class="page-hero">
            <div>
                <div class="hero-eyebrow">{eyebrow}</div>
                <div class="hero-title">{title}</div>
                {f'<div class="hero-sub">{subtitle}</div>' if subtitle else ''}
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def chip(label: str, tone: str = "primary") -> str:
    """Devuelve HTML de un chip. Tones: primary, success, warn, danger, neutral."""
    return f'<span class="chip chip-{tone}">{label}</span>'
