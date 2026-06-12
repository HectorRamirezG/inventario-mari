"""Repositorio base genérico sobre Supabase (POO)."""

from __future__ import annotations

from typing import Any

from .db import sb


class BaseRepository:
    """CRUD genérico. Hereda y define `table` para reutilizar."""

    table: str = ""
    select: str = "*"
    order_by: str | None = "created_at"
    order_desc: bool = True

    # ─── Helpers ───
    def _q(self):
        return sb.table(self.table)

    # ─── Read ───
    def list(self, *, where: dict | None = None, limit: int | None = None) -> list[dict]:
        q = self._q().select(self.select)
        for k, v in (where or {}).items():
            q = q.eq(k, v)
        if self.order_by:
            q = q.order(self.order_by, desc=self.order_desc)
        if limit:
            q = q.limit(limit)
        return q.execute().data or []

    def get(self, id_: Any) -> dict | None:
        res = self._q().select(self.select).eq("id", id_).limit(1).execute().data
        return res[0] if res else None

    # ─── Write ───
    def create(self, payload: dict) -> dict:
        res = self._q().insert(payload).execute().data
        return (res or [{}])[0]

    def update(self, id_: Any, payload: dict) -> dict:
        res = self._q().update(payload).eq("id", id_).execute().data
        return (res or [{}])[0]

    def remove(self, id_: Any) -> None:
        self._q().delete().eq("id", id_).execute()
