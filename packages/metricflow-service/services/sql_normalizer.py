"""
Adapter-specific SQL 规范化工具。

当前仅处理 Postgres 不支持 database.schema.table 的场景：将三段式降级为两段式。
"""

from __future__ import annotations

import re
from typing import Optional


_THREE_PART_QUOTED_RE = re.compile(r'"[^"]+"\."([^"]+)"\."([^"]+)"')
_THREE_PART_RE = re.compile(
    r"\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b"
)


def normalize_sql_for_adapter(sql: Optional[str], engine) -> Optional[str]:
    if not sql:
        return sql

    sql_client = getattr(engine, "_sql_client", None)
    adapter = getattr(sql_client, "_adapter", None)
    adapter_type = adapter.type() if adapter and hasattr(adapter, "type") else None
    if adapter_type != "postgres":
        return sql

    # Postgres 不支持 database.schema.table，全限定名需要去掉 database。
    # 优先按当前 credentials.database 精确匹配，避免误伤字符串/注释；否则退回通用替换。
    credentials = getattr(getattr(adapter, "config", None), "credentials", None)
    db_name = None
    if credentials:
        db_name = getattr(credentials, "database", None) or getattr(credentials, "dbname", None)
    normalized_sql = sql
    if db_name:
        quoted_pattern = rf'"{re.escape(db_name)}"\."([^"]+)"\."([^"]+)"'
        normalized_sql = re.sub(quoted_pattern, lambda m: f"\"{m.group(1)}\".\"{m.group(2)}\"", normalized_sql)
        unquoted_pattern = rf"\b{re.escape(db_name)}\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b"
        normalized_sql = re.sub(unquoted_pattern, lambda m: f"{m.group(1)}.{m.group(2)}", normalized_sql)
    # 兜底：处理未匹配到 db_name 的三段式。
    if normalized_sql is sql:
        normalized_sql = _THREE_PART_QUOTED_RE.sub(
            lambda match: f"\"{match.group(1)}\".\"{match.group(2)}\"",
            sql,
        )
        normalized_sql = _THREE_PART_RE.sub(
            lambda match: f"{match.group(2)}.{match.group(3)}",
            normalized_sql,
        )
    return normalized_sql
