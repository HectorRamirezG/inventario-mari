"""Calculadora de precios por tier (menudeo / medio / mayoreo).

Fórmula: precio = costo / (1 - margen/100)   (margen sobre precio de venta)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Tier = Literal["menudeo", "medio", "mayoreo"]


@dataclass(frozen=True)
class PricingConfig:
    margen_menudeo: float = 30.0
    margen_medio: float = 25.0
    margen_mayoreo: float = 20.0
    umbral_medio: int = 6
    umbral_mayoreo: int = 12
    costo_extra: float = 0.0

    @classmethod
    def from_row(cls, row: dict | None) -> "PricingConfig":
        if not row:
            return cls()
        return cls(
            margen_menudeo=float(row.get("margen_menudeo") or 30),
            margen_medio=float(row.get("margen_medio") or 25),
            margen_mayoreo=float(row.get("margen_mayoreo") or 20),
            umbral_medio=int(row.get("umbral_medio") or 6),
            umbral_mayoreo=int(row.get("umbral_mayoreo") or 12),
            costo_extra=float(row.get("costo_extra") or 0),
        )


class PriceCalculator:
    """Encapsula la lógica de tiers para que UI y servicios coincidan siempre."""

    def __init__(self, cfg: PricingConfig | None = None) -> None:
        self.cfg = cfg or PricingConfig()

    # ─── Tier helpers ───
    def tier_for(self, qty: int) -> Tier:
        if qty >= self.cfg.umbral_mayoreo:
            return "mayoreo"
        if qty >= self.cfg.umbral_medio:
            return "medio"
        return "menudeo"

    def margin_of(self, tier: Tier) -> float:
        return {
            "menudeo": self.cfg.margen_menudeo,
            "medio": self.cfg.margen_medio,
            "mayoreo": self.cfg.margen_mayoreo,
        }[tier]

    def threshold_of(self, tier: Tier) -> int:
        return {
            "menudeo": 1,
            "medio": self.cfg.umbral_medio,
            "mayoreo": self.cfg.umbral_mayoreo,
        }[tier]

    # ─── Cálculo de precio ───
    def price_for(self, cost: float, tier: Tier) -> float:
        total = cost + self.cfg.costo_extra
        margin = self.margin_of(tier)
        if margin >= 100:
            return total
        return round(total / (1 - margin / 100))

    def suggest_all(self, cost: float) -> dict[Tier, float]:
        return {t: self.price_for(cost, t) for t in ("menudeo", "medio", "mayoreo")}

    # ─── Upsell ───
    def next_tier_gap(self, qty: int) -> tuple[Tier, int] | None:
        """Devuelve (siguiente_tier, piezas_faltantes) o None si ya está en el tope."""
        current = self.tier_for(qty)
        if current == "menudeo":
            return ("medio", max(0, self.cfg.umbral_medio - qty))
        if current == "medio":
            return ("mayoreo", max(0, self.cfg.umbral_mayoreo - qty))
        return None
