from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
import threading
from typing import Dict, Optional

from .types import DbtQueryStatus, QueryResultDTO


@dataclass
class StoredQuery:
    query_id: str
    project_id: str
    status: DbtQueryStatus
    sql: Optional[str] = None
    columns: Optional[list] = None
    rows: Optional[list] = None
    warnings: Optional[list] = None
    total_pages: Optional[int] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    request_payload: Optional[dict] = None

    def to_result(self) -> QueryResultDTO:
        return QueryResultDTO(
            status=self.status,
            sql=self.sql,
            columns=self.columns,
            rows=self.rows,
            warnings=self.warnings,
            total_pages=self.total_pages,
            error=self.error,
        )


class QueryStore:
    def __init__(self, ttl_seconds: int = 3600) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._lock = threading.Lock()
        self._items: Dict[str, StoredQuery] = {}

    def _is_expired(self, stored: StoredQuery) -> bool:
        return datetime.utcnow() - stored.created_at > self._ttl

    def get(self, query_id: str) -> tuple[Optional[StoredQuery], bool]:
        with self._lock:
            stored = self._items.get(query_id)
            if not stored:
                return None, False
            if self._is_expired(stored):
                self._items.pop(query_id, None)
                self._remove(query_id)
                return None, True
            return stored, False

    def set(self, stored: StoredQuery) -> None:
        with self._lock:
            self._items[stored.query_id] = stored
            self._persist(stored)

    def update(self, query_id: str, **changes) -> Optional[StoredQuery]:
        with self._lock:
            stored = self._items.get(query_id)
            if not stored:
                return None
            for key, value in changes.items():
                setattr(stored, key, value)
            self._persist(stored)
            return stored

    def delete(self, query_id: str) -> None:
        with self._lock:
            self._items.pop(query_id, None)
            self._remove(query_id)

    # 持久化钩子，默认内存实现直接返回；子类可覆盖落盘/外部存储。
    def _persist(self, stored: StoredQuery) -> None:  # pragma: no cover
        return

    def _remove(self, query_id: str) -> None:  # pragma: no cover
        return
