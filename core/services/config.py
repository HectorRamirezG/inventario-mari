"""Configuración global de pricing (singleton id=1)."""

from __future__ import annotations

from core.db import sb
from core.pricing import PricingConfig

DEFAULT = PricingConfig()


def get_config() -> PricingConfig:
    res = sb.table("pricing_config").select("*").eq("id", 1).limit(1).execute().data
    if not res:
        # Crear el singleton si no existe
        sb.table("pricing_config").upsert({
            "id": 1,
            "margen_menudeo": DEFAULT.margen_menudeo,
            "margen_medio": DEFAULT.margen_medio,
            "margen_mayoreo": DEFAULT.margen_mayoreo,
            "umbral_medio": DEFAULT.umbral_medio,
            "umbral_mayoreo": DEFAULT.umbral_mayoreo,
            "costo_extra": DEFAULT.costo_extra,
        }).execute()
        return DEFAULT
    return PricingConfig.from_row(res[0])


def save_config(cfg: PricingConfig) -> None:
    sb.table("pricing_config").update({
        "margen_menudeo": cfg.margen_menudeo,
        "margen_medio": cfg.margen_medio,
        "margen_mayoreo": cfg.margen_mayoreo,
        "umbral_medio": cfg.umbral_medio,
        "umbral_mayoreo": cfg.umbral_mayoreo,
        "costo_extra": cfg.costo_extra,
    }).eq("id", 1).execute()
