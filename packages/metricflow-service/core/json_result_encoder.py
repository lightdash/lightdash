from __future__ import annotations

import base64
import datetime as dt
import json
from decimal import Decimal
from typing import Any, Dict, List

from metricflow.data_table.mf_table import MetricFlowDataTable


_DATE_GRAIN_SUFFIXES = ("__day", "__week", "__month", "__quarter", "__year")


def _field_type(column_name: str, column_type: type) -> str:
    if column_type is dt.datetime:
        if column_name.endswith(_DATE_GRAIN_SUFFIXES):
            return "date"
        return "timestamp"
    if column_type in (int, float, Decimal):
        return "number"
    if column_type is bool:
        return "boolean"
    return "string"


def _serialize_value(value: Any, field_type: str) -> Any:
    if value is None:
        return None
    if field_type == "date":
        if isinstance(value, dt.datetime):
            return value.date().isoformat()
        if isinstance(value, dt.date):
            return value.isoformat()
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def encode_json_result(table: MetricFlowDataTable) -> str:
    fields: List[Dict[str, str]] = []
    column_names = list(table.column_names)
    column_types = [desc.column_type for desc in table.column_descriptions]
    field_types = []
    for name, col_type in zip(column_names, column_types):
        field_type = _field_type(name, col_type)
        field_types.append(field_type)
        fields.append({"name": name, "type": field_type})

    data_rows = []
    for row in table.rows:
        record: Dict[str, Any] = {}
        for name, field_type, value in zip(column_names, field_types, row):
            record[name] = _serialize_value(value, field_type)
        data_rows.append(record)

    payload = {
        "schema": {
            "fields": fields,
            "primaryKey": [],
            "pandas_version": "1.5.0",
        },
        "data": data_rows,
    }
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return base64.b64encode(raw).decode("utf-8")


def encode_rows_and_columns(table: MetricFlowDataTable) -> tuple[list[Dict[str, Any]], list[Dict[str, Any]]]:
    """
    Convert MetricFlowDataTable to columns/rows shape for Lightdash.
    columns: [{name, type}]
    rows: [{<column>: rawValue}]
    """
    columns: List[Dict[str, Any]] = []
    rows: List[Dict[str, Any]] = []
    column_names = list(table.column_names)
    column_types = [desc.column_type for desc in table.column_descriptions]
    field_types = []
    for name, col_type in zip(column_names, column_types):
        field_type = _field_type(name, col_type)
        field_types.append(field_type)
        columns.append({"name": name, "type": field_type})

    for row in table.rows:
        record: Dict[str, Any] = {}
        for name, field_type, value in zip(column_names, field_types, row):
            record[name] = _serialize_value(value, field_type)
        rows.append(record)

    return columns, rows
