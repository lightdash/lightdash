from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional


class DbtTimeGranularity(str, Enum):
    NANOSECOND = "NANOSECOND"
    MICROSECOND = "MICROSECOND"
    MILLISECOND = "MILLISECOND"
    SECOND = "SECOND"
    MINUTE = "MINUTE"
    HOUR = "HOUR"
    DAY = "DAY"
    WEEK = "WEEK"
    MONTH = "MONTH"
    QUARTER = "QUARTER"
    YEAR = "YEAR"


class DbtDimensionType(str, Enum):
    CATEGORICAL = "CATEGORICAL"
    TIME = "TIME"


class DbtMetricType(str, Enum):
    SIMPLE = "SIMPLE"
    RATIO = "RATIO"
    CUMULATIVE = "CUMULATIVE"
    DERIVED = "DERIVED"
    CONVERSION = "CONVERSION"


class DbtQueryStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPILED = "COMPILED"
    SUCCESSFUL = "SUCCESSFUL"
    FAILED = "FAILED"


@dataclass(frozen=True)
class SemanticModelDTO:
    name: str
    label: Optional[str]
    description: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "description": self.description,
        }


@dataclass(frozen=True)
class DimensionDTO:
    name: str
    description: Optional[str]
    label: Optional[str]
    type: DbtDimensionType
    queryable_granularities: List[DbtTimeGranularity]
    semantic_model: Optional[SemanticModelDTO]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "label": self.label,
            "type": self.type.value,
            "queryableGranularities": [g.value for g in self.queryable_granularities],
            "semanticModel": self.semantic_model.to_dict() if self.semantic_model else None,
        }


@dataclass(frozen=True)
class MetricDTO:
    name: str
    description: Optional[str]
    label: Optional[str]
    type: DbtMetricType
    queryable_granularities: List[DbtTimeGranularity]
    dimensions: List[DimensionDTO]
    semantic_models: List[SemanticModelDTO]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "label": self.label,
            "type": self.type.value,
            "queryableGranularities": [g.value for g in self.queryable_granularities],
            "dimensions": [dimension.to_dict() for dimension in self.dimensions],
            "semanticModels": [model.to_dict() for model in self.semantic_models],
        }


@dataclass(frozen=True)
class MetricSummaryDTO:
    name: str
    description: Optional[str]
    label: Optional[str]
    type: DbtMetricType

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "label": self.label,
            "type": self.type.value,
        }


@dataclass(frozen=True)
class SemanticModelDetailDTO:
    name: str
    label: Optional[str]
    description: Optional[str]
    metrics: List[MetricSummaryDTO]
    dimensions: List[DimensionDTO]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "description": self.description,
            "metrics": [metric.to_dict() for metric in self.metrics],
            "dimensions": [dimension.to_dict() for dimension in self.dimensions],
        }


@dataclass(frozen=True)
class QueryResultDTO:
    status: DbtQueryStatus
    sql: Optional[str]
    columns: Optional[List[Dict[str, Any]]]
    rows: Optional[List[Dict[str, Any]]]
    warnings: Optional[List[str]]
    total_pages: Optional[int]
    error: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "sql": self.sql,
            "columns": self.columns,
            "rows": self.rows,
            "warnings": self.warnings,
            "totalPages": self.total_pages,
            "error": self.error,
        }


@dataclass(frozen=True)
class StructuredFilterDTO:
    dimension: str
    operator: str
    values: List[Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dimension": self.dimension,
            "operator": self.operator,
            "values": self.values,
        }


@dataclass(frozen=True)
class MetricInputMetricDTO:
    name: str
    label: Optional[str]
    filter_raw: Optional[str]
    filter_structured: List[StructuredFilterDTO]
    alias: Optional[str]
    offset_window: Optional[str]
    offset_to_grain: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "filterRaw": self.filter_raw,
            "filterStructured": [item.to_dict() for item in self.filter_structured],
            "alias": self.alias,
            "offsetWindow": self.offset_window,
            "offsetToGrain": self.offset_to_grain,
        }


@dataclass(frozen=True)
class MetricInputMeasureDTO:
    name: str
    label: Optional[str]
    agg: Optional[str]
    expr: Optional[str]
    filter_raw: Optional[str]
    alias: Optional[str]
    semantic_model: Optional[SemanticModelDTO]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "agg": self.agg,
            "expr": self.expr,
            "filterRaw": self.filter_raw,
            "alias": self.alias,
            "semanticModel": self.semantic_model.to_dict() if self.semantic_model else None,
        }


@dataclass(frozen=True)
class MetricDefinitionDTO:
    name: str
    label: Optional[str]
    description: Optional[str]
    type: DbtMetricType
    formula_display: Optional[str]
    filter_raw: Optional[str]
    filter_structured: List[StructuredFilterDTO]
    input_metrics: List[MetricInputMetricDTO]
    input_measures: List[MetricInputMeasureDTO]
    dimensions: List[DimensionDTO]
    semantic_models: List[SemanticModelDTO]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "description": self.description,
            "type": self.type.value,
            "formulaDisplay": self.formula_display,
            "filterRaw": self.filter_raw,
            "filterStructured": [item.to_dict() for item in self.filter_structured],
            "inputs": {
                "inputMetrics": [item.to_dict() for item in self.input_metrics],
                "inputMeasures": [item.to_dict() for item in self.input_measures],
            },
            "dimensions": [dimension.to_dict() for dimension in self.dimensions],
            "semanticModels": [model.to_dict() for model in self.semantic_models],
        }

