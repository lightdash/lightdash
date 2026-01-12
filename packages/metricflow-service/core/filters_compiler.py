from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import calendar
import logging
from typing import Any, Iterable, List, Optional, Tuple

from .errors import APIError, ErrorCode


_TIME_GRAINS = {
    "nanosecond",
    "microsecond",
    "millisecond",
    "second",
    "minute",
    "hour",
    "day",
    "week",
    "month",
    "quarter",
    "year",
}

_RELATIVE_OPERATORS = {"inThePast", "inTheNext", "inTheCurrent", "notInTheCurrent"}

_DEFAULT_TIMEZONE = timezone.utc
_DEFAULT_WEEK_START = 0  # Monday

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class FilterTarget:
    field_id: str


@dataclass(frozen=True)
class FilterSettings:
    unit_of_time: Optional[str] = None
    completed: Optional[bool] = None
    group_by: Optional[List[str]] = None


@dataclass(frozen=True)
class FilterRule:
    id: str
    target: FilterTarget
    operator: str
    values: Optional[List[Any]] = None
    settings: Optional[FilterSettings] = None
    disabled: bool = False


@dataclass(frozen=True)
class FilterGroupItem:
    rule: Optional[FilterRule] = None
    group: Optional["FilterGroup"] = None


@dataclass(frozen=True)
class FilterGroup:
    id: str
    and_items: Optional[List[FilterGroupItem]] = None
    or_items: Optional[List[FilterGroupItem]] = None


@dataclass(frozen=True)
class Filters:
    dimensions: Optional[FilterGroup] = None
    metrics: Optional[FilterGroup] = None
    table_calculations: Optional[FilterGroup] = None


def filters_to_where(
    filters: Optional[Filters],
    group_by_names: Optional[List[str]] = None,
    entity_names: Optional[set[str]] = None,
) -> List[str]:
    if not filters:
        return []
    clauses: List[str] = []
    dimensions_sql = _build_filter_group_sql(
        filters.dimensions,
        target_type="dimension",
        group_by_names=group_by_names,
        entity_names=entity_names,
    )
    metrics_sql = _build_filter_group_sql(
        filters.metrics,
        target_type="metric",
        group_by_names=group_by_names,
        entity_names=entity_names,
    )
    table_calc_sql = _build_filter_group_sql(
        filters.table_calculations,
        target_type="table_calculation",
        group_by_names=group_by_names,
        entity_names=entity_names,
    )
    for clause in (dimensions_sql, metrics_sql, table_calc_sql):
        if clause:
            clauses.append(clause)
    if not clauses:
        return []
    return [" AND ".join(f"({clause})" for clause in clauses)]


def _build_filter_group_sql(
    group: Optional[FilterGroup],
    target_type: str,
    group_by_names: Optional[List[str]],
    entity_names: Optional[set[str]],
) -> Optional[str]:
    if not group:
        return None
    items, operator = _resolve_group_items(group)
    sql_parts: List[str] = []
    for item in items:
        part = _build_filter_group_item_sql(item, target_type, group_by_names, entity_names)
        if part:
            sql_parts.append(part)
    if not sql_parts:
        return None
    if len(sql_parts) == 1:
        return sql_parts[0]
    joiner = f" {operator} "
    return joiner.join(f"({part})" for part in sql_parts)


def _resolve_group_items(group: FilterGroup) -> Tuple[List[FilterGroupItem], str]:
    and_items = group.and_items or []
    or_items = group.or_items or []
    if and_items and or_items:
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message=f"FilterGroup({group.id}) 不能同时包含 and/or",
            status_code=422,
        )
    if and_items:
        return and_items, "AND"
    if or_items:
        return or_items, "OR"
    return [], "AND"


def _build_filter_group_item_sql(
    item: FilterGroupItem,
    target_type: str,
    group_by_names: Optional[List[str]],
    entity_names: Optional[set[str]],
) -> Optional[str]:
    if item.rule and item.group:
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message="FilterGroupItem 只能包含 rule 或 group",
            status_code=422,
        )
    if item.rule:
        return _build_filter_rule_sql(item.rule, target_type, group_by_names, entity_names)
    if item.group:
        return _build_filter_group_sql(item.group, target_type, group_by_names, entity_names)
    raise APIError(
        code=ErrorCode.VALIDATION_ERROR,
        message="FilterGroupItem 必须包含 rule 或 group",
        status_code=422,
    )


def _build_filter_rule_sql(
    rule: FilterRule,
    target_type: str,
    group_by_names: Optional[List[str]],
    entity_names: Optional[set[str]],
) -> Optional[str]:
    if rule.disabled:
        return None
    if target_type == "table_calculation":
        return None
    group_by_override = rule.settings.group_by if rule.settings else None
    if group_by_override and not isinstance(group_by_override, list):
        group_by_override = [group_by_override]
    if target_type == "metric" and not group_by_override:
        _LOGGER.warning(
            "metrics filter ignored: missing settings.groupBy (rule_id=%s, field_id=%s)",
            rule.id,
            rule.target.field_id,
        )
        return None
    if target_type == "metric":
        _validate_metric_group_by(group_by_override, entity_names, rule.id)
    expr = _build_target_expression(rule.target.field_id, target_type, group_by_names, group_by_override)
    operator = rule.operator
    values = list(rule.values or [])
    if operator in _RELATIVE_OPERATORS:
        return _build_relative_time_sql(expr, operator, values, rule.settings)
    return _build_operator_sql(expr, operator, values)


def _build_target_expression(
    field_id: str,
    target_type: str,
    group_by_names: Optional[List[str]],
    group_by_override: Optional[List[str]],
) -> str:
    if target_type == "metric":
        group_by_items = _format_group_by_list(group_by_override or group_by_names)
        return f"{{{{ Metric('{_escape_identifier(field_id)}', group_by={group_by_items}) }}}}"
    base, grain = _split_time_grain(field_id)
    if grain:
        return f"{{{{ TimeDimension('{_escape_identifier(base)}', '{grain}') }}}}"
    return f"{{{{ Dimension('{_escape_identifier(field_id)}') }}}}"


def _split_time_grain(field_id: str) -> Tuple[str, Optional[str]]:
    if "__" not in field_id:
        return field_id, None
    base, suffix = field_id.rsplit("__", 1)
    grain = suffix.lower()
    if grain in _TIME_GRAINS:
        return base, grain
    return field_id, None


def _build_operator_sql(expr: str, operator: str, values: List[Any]) -> str:
    if operator == "equals":
        return _equals_sql(expr, values)
    if operator == "notEquals":
        return _not_equals_sql(expr, values)
    if operator == "include":
        return _like_sql(expr, values, include=True, wildcard="both")
    if operator == "doesNotInclude":
        return _like_sql(expr, values, include=False, wildcard="both")
    if operator == "startsWith":
        return _like_sql(expr, values, include=True, wildcard="right")
    if operator == "endsWith":
        return _like_sql(expr, values, include=True, wildcard="left")
    if operator == "isNull":
        return f"{expr} IS NULL"
    if operator == "notNull":
        return f"{expr} IS NOT NULL"
    if operator == "greaterThan":
        return _compare_sql(expr, ">", values)
    if operator == "greaterThanOrEqual":
        return _compare_sql(expr, ">=", values)
    if operator == "lessThan":
        return _compare_sql(expr, "<", values)
    if operator == "lessThanOrEqual":
        return _compare_sql(expr, "<=", values)
    if operator == "inBetween":
        return _between_sql(expr, values, negate=False)
    if operator == "notInBetween":
        return _between_sql(expr, values, negate=True)
    raise APIError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"不支持的 operator: {operator}",
        status_code=422,
    )


def _equals_sql(expr: str, values: List[Any]) -> str:
    if not values:
        raise _missing_values_error("equals")
    if len(values) == 1:
        return f"{expr} = {_format_value(values[0])}"
    return f"{expr} IN ({_format_values(values)})"


def _not_equals_sql(expr: str, values: List[Any]) -> str:
    if not values:
        raise _missing_values_error("notEquals")
    if len(values) == 1:
        return f"({expr} != {_format_value(values[0])} OR {expr} IS NULL)"
    return f"({expr} NOT IN ({_format_values(values)}) OR {expr} IS NULL)"


def _compare_sql(expr: str, op: str, values: List[Any]) -> str:
    if not values:
        raise _missing_values_error(op)
    return f"{expr} {op} {_format_value(values[0])}"


def _between_sql(expr: str, values: List[Any], negate: bool) -> str:
    if len(values) < 2:
        raise _missing_values_error("inBetween")
    left = _format_value(values[0])
    right = _format_value(values[1])
    if negate:
        return f"({expr} < {left} OR {expr} > {right})"
    return f"({expr} >= {left} AND {expr} <= {right})"


def _like_sql(expr: str, values: List[Any], include: bool, wildcard: str) -> str:
    if not values:
        raise _missing_values_error("like")
    clauses = []
    for value in values:
        raw = _as_string(value)
        if wildcard == "both":
            pattern = f"%{raw}%"
        elif wildcard == "left":
            pattern = f"%{raw}"
        else:
            pattern = f"{raw}%"
        op = "LIKE" if include else "NOT LIKE"
        clauses.append(f"{expr} {op} {_format_value(pattern)}")
    joiner = " OR " if include else " AND "
    if len(clauses) == 1:
        return clauses[0]
    return f"({joiner.join(clauses)})"


def _build_relative_time_sql(
    expr: str,
    operator: str,
    values: List[Any],
    settings: Optional[FilterSettings],
) -> str:
    unit = _normalize_unit(settings.unit_of_time if settings else None)
    now = datetime.now(_DEFAULT_TIMEZONE)
    if operator == "inThePast":
        count = _normalize_count(values)
        start = _shift_time(now, -count, unit)
        end = now
        return _range_sql(expr, start, end, unit)
    if operator == "inTheNext":
        count = _normalize_count(values)
        start = now
        end = _shift_time(now, count, unit)
        return _range_sql(expr, start, end, unit)
    start, end = _current_period_range(now, unit)
    if operator == "inTheCurrent":
        return _range_sql(expr, start, end, unit)
    return f"({expr} < {_format_time(start, unit)} OR {expr} > {_format_time(end, unit)})"


def _range_sql(expr: str, start: datetime, end: datetime, unit: str) -> str:
    return f"({expr} >= {_format_time(start, unit)} AND {expr} <= {_format_time(end, unit)})"


def _normalize_unit(unit: Optional[str]) -> str:
    if not unit:
        return "day"
    unit_value = unit.lower()
    if unit_value.endswith("s"):
        unit_value = unit_value[:-1]
    if unit_value not in _TIME_GRAINS:
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message=f"不支持的 unitOfTime: {unit}",
            status_code=422,
        )
    return unit_value


def _normalize_count(values: List[Any]) -> int:
    if not values:
        raise _missing_values_error("relativeTime")
    try:
        count = int(values[0])
    except (TypeError, ValueError):
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message="relativeTime 的 values 必须为整数",
            status_code=422,
        ) from None
    if count <= 0:
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message="relativeTime 的 values 必须大于 0",
            status_code=422,
        )
    return count


def _current_period_range(now: datetime, unit: str) -> Tuple[datetime, datetime]:
    if unit == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1) - timedelta(seconds=1)
        return start, end
    if unit == "week":
        start = _start_of_week(now)
        end = start + timedelta(days=7) - timedelta(seconds=1)
        return start, end
    if unit == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = _add_months(start, 1) - timedelta(seconds=1)
        return start, end
    if unit == "quarter":
        quarter = (now.month - 1) // 3
        start_month = quarter * 3 + 1
        start = now.replace(month=start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = _add_months(start, 3) - timedelta(seconds=1)
        return start, end
    if unit == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end = start.replace(year=start.year + 1) - timedelta(seconds=1)
        return start, end
    if unit == "hour":
        start = now.replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=1) - timedelta(seconds=1)
        return start, end
    if unit == "minute":
        start = now.replace(second=0, microsecond=0)
        end = start + timedelta(minutes=1) - timedelta(seconds=1)
        return start, end
    if unit == "second":
        start = now.replace(microsecond=0)
        end = start + timedelta(seconds=1) - timedelta(seconds=1)
        return start, end
    return now, now


def _shift_time(now: datetime, count: int, unit: str) -> datetime:
    if unit == "second":
        return now + timedelta(seconds=count)
    if unit == "minute":
        return now + timedelta(minutes=count)
    if unit == "hour":
        return now + timedelta(hours=count)
    if unit == "day":
        return now + timedelta(days=count)
    if unit == "week":
        return now + timedelta(weeks=count)
    if unit == "month":
        return _add_months(now, count)
    if unit == "quarter":
        return _add_months(now, count * 3)
    if unit == "year":
        return _add_months(now, count * 12)
    return now


def _add_months(dt: datetime, months: int) -> datetime:
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def _start_of_week(dt: datetime) -> datetime:
    weekday = dt.weekday()
    delta_days = (weekday - _DEFAULT_WEEK_START) % 7
    start = dt - timedelta(days=delta_days)
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


def _format_time(dt: datetime, unit: str) -> str:
    if unit in {"hour", "minute", "second", "nanosecond", "microsecond", "millisecond"}:
        return _format_value(dt)
    return _format_value(dt.date())


def _format_values(values: Iterable[Any]) -> str:
    return ", ".join(_format_value(value) for value in values)


def _format_group_by_list(group_by_names: Optional[List[str]]) -> str:
    if not group_by_names:
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message="metrics filters 需要提供 groupBy",
            status_code=422,
        )
    items = ", ".join(f"'{_escape_identifier(name)}'" for name in group_by_names)
    return f"[{items}]"


def _validate_metric_group_by(group_by_names: Optional[List[str]], entity_names: Optional[set[str]], rule_id: str) -> None:
    if not group_by_names or not entity_names:
        return
    invalid = [name for name in group_by_names if name not in entity_names]
    if not invalid:
        return
    raise APIError(
        code=ErrorCode.VALIDATION_ERROR,
        message="metrics filters 的 settings.groupBy 必须为实体名称",
        status_code=422,
        details={"invalid": invalid, "allowed": sorted(entity_names), "ruleId": rule_id},
    )


def _format_value(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=_DEFAULT_TIMEZONE)
        return f"'{dt.astimezone(_DEFAULT_TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')}'"
    if isinstance(value, date):
        return f"'{value.isoformat()}'"
    return f"'{_escape_string(str(value))}'"


def _escape_string(value: str) -> str:
    return value.replace("'", "''")


def _escape_identifier(value: str) -> str:
    return value.replace("'", "''")


def _as_string(value: Any) -> str:
    return value if isinstance(value, str) else str(value)


def _missing_values_error(operator: str) -> APIError:
    return APIError(
        code=ErrorCode.VALIDATION_ERROR,
        message=f"operator {operator} 缺少 values",
        status_code=422,
    )
