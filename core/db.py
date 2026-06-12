"""Cliente Supabase singleton + helpers de configuración."""

from __future__ import annotations

import os
from functools import lru_cache

import streamlit as st
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


def _get_credential(key: str) -> str:
    """Lee primero st.secrets (Streamlit Cloud), luego env vars."""
    try:
        if key in st.secrets:
            return str(st.secrets[key])
    except (FileNotFoundError, st.errors.StreamlitSecretNotFoundError):
        pass
    return os.environ.get(key, "")


@lru_cache(maxsize=1)
def get_client() -> Client:
    url = _get_credential("SUPABASE_URL")
    key = _get_credential("SUPABASE_ANON_KEY")
    if not url or not key:
        st.error(
            "❌ Faltan credenciales de Supabase. "
            "Configura `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `.env` o en `.streamlit/secrets.toml`."
        )
        st.stop()
    return create_client(url, key)


# Atajo: `from core.db import sb` y úsalo directo
sb: Client = get_client()
