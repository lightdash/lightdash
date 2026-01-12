from __future__ import annotations

from typing import Any, Optional

from .filters_compiler import (
    FilterGroup,
    FilterGroupItem,
    FilterRule,
    FilterSettings,
    FilterTarget,
    Filters,
)
from .query_service import GroupByInput, MetricInput, OrderByInput


def _get_attr(obj: Any, *names: str):
    if isinstance(obj, dict):
        for name in names:
            if name in obj:
                return obj[name]
    for name in names:
        if hasattr(obj, name):
            return getattr(obj, name)
    return None


def to_metric_input(obj: Any) -> MetricInput:
    name = _get_attr(obj, "name")
    return MetricInput(name=name)


def to_group_by_input(obj: Any) -> GroupByInput:
    name = _get_attr(obj, "name")
    grain = _get_attr(obj, "grain")
    return GroupByInput(name=name, grain=grain)


def to_order_by_input(obj: Any) -> OrderByInput:
    descending = bool(_get_attr(obj, "descending"))
    metric_obj = _get_attr(obj, "metric")
    group_by_obj = _get_attr(obj, "group_by", "groupBy")
    metric = to_metric_input(metric_obj) if metric_obj else None
    group_by = to_group_by_input(group_by_obj) if group_by_obj else None
    return OrderByInput(descending=descending, metric=metric, group_by=group_by)


def to_filters_input(obj: Any) -> Optional[Filters]:
    if obj is None:
        return None
    return Filters(
        dimensions=_to_filter_group(_get_attr(obj, "dimensions")),
        metrics=_to_filter_group(_get_attr(obj, "metrics")),
        table_calculations=_to_filter_group(_get_attr(obj, "table_calculations", "tableCalculations")),
    )


def _to_filter_group(obj: Any) -> Optional[FilterGroup]:
    if obj is None:
        return None
    group_id = _get_attr(obj, "id")
    and_items = _to_filter_items(_get_attr(obj, "and_items", "and", "and_"))
    or_items = _to_filter_items(_get_attr(obj, "or_items", "or", "or_"))
    return FilterGroup(id=group_id, and_items=and_items, or_items=or_items)


def _to_filter_items(obj: Any) -> Optional[list[FilterGroupItem]]:
    if obj is None:
        return None
    return [_to_filter_item(item) for item in obj]


def _to_filter_item(obj: Any) -> FilterGroupItem:
    rule_obj = _get_attr(obj, "rule")
    group_obj = _get_attr(obj, "group")
    return FilterGroupItem(
        rule=_to_filter_rule(rule_obj) if rule_obj else None,
        group=_to_filter_group(group_obj) if group_obj else None,
    )


def _to_filter_rule(obj: Any) -> FilterRule:
    rule_id = _get_attr(obj, "id")
    target_obj = _get_attr(obj, "target")
    target = FilterTarget(field_id=_get_attr(target_obj, "field_id", "fieldId"))
    operator = _get_attr(obj, "operator")
    values = _get_attr(obj, "values")
    settings_obj = _get_attr(obj, "settings")
    settings = _to_filter_settings(settings_obj) if settings_obj else None
    disabled = bool(_get_attr(obj, "disabled")) if _get_attr(obj, "disabled") is not None else False
    return FilterRule(
        id=rule_id,
        target=target,
        operator=operator,
        values=values if isinstance(values, list) else ([values] if values is not None else None),
        settings=settings,
        disabled=disabled,
    )


def _to_filter_settings(obj: Any) -> FilterSettings:
    return FilterSettings(
        unit_of_time=_get_attr(obj, "unit_of_time", "unitOfTime"),
        completed=_get_attr(obj, "completed"),
        group_by=_get_attr(obj, "group_by", "groupBy"),
    )
