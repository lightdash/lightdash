from __future__ import annotations

from typing import Any, List, Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from core.types import DbtTimeGranularity


class MetricInput(BaseModel):
    name: str


class GroupByInput(BaseModel):
    name: str
    grain: Optional[DbtTimeGranularity] = None


class OrderByInput(BaseModel):
    descending: bool
    metric: Optional[MetricInput] = None
    group_by: Optional[GroupByInput] = Field(default=None, alias="groupBy")

    model_config = ConfigDict(populate_by_name=True)


class FilterTarget(BaseModel):
    field_id: str = Field(..., alias="fieldId")

    model_config = ConfigDict(populate_by_name=True)


class FilterSettings(BaseModel):
    unit_of_time: Optional[str] = Field(default=None, alias="unitOfTime")
    completed: Optional[bool] = None
    group_by: Optional[List[str]] = Field(default=None, alias="groupBy")

    model_config = ConfigDict(populate_by_name=True)


class FilterRule(BaseModel):
    id: str
    target: FilterTarget
    operator: str
    values: Optional[List[Any]] = None
    settings: Optional[FilterSettings] = None
    disabled: Optional[bool] = False


class FilterGroupItem(BaseModel):
    rule: Optional[FilterRule] = None
    group: Optional["FilterGroup"] = None


class FilterGroup(BaseModel):
    id: str
    and_: Optional[List[FilterGroupItem]] = Field(default=None, alias="and")
    or_: Optional[List[FilterGroupItem]] = Field(default=None, alias="or")

    model_config = ConfigDict(populate_by_name=True)


class Filters(BaseModel):
    dimensions: Optional[FilterGroup] = None
    metrics: Optional[FilterGroup] = None
    table_calculations: Optional[FilterGroup] = Field(default=None, alias="tableCalculations")

    model_config = ConfigDict(populate_by_name=True)


class MetricsForDimensionsRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")
    dimensions: List[GroupByInput] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class CreateQueryRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")
    metrics: List[MetricInput] = Field(default_factory=list)
    group_by: List[GroupByInput] = Field(default_factory=list, alias="groupBy")
    filters: Optional[Filters] = None
    order_by: List[OrderByInput] = Field(default_factory=list, alias="orderBy")
    limit: Optional[int] = None
    async_run: bool = Field(default=False, alias="async")

    model_config = ConfigDict(populate_by_name=True)


class CompileSqlRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")
    metrics: List[MetricInput] = Field(default_factory=list)
    group_by: List[GroupByInput] = Field(default_factory=list, alias="groupBy")
    filters: Optional[Filters] = None
    order_by: List[OrderByInput] = Field(default_factory=list, alias="orderBy")
    limit: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True)


class ValidateQueryRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")
    metrics: List[MetricInput] = Field(default_factory=list)
    group_by: List[GroupByInput] = Field(default_factory=list, alias="groupBy")
    filters: Optional[Filters] = None
    order_by: List[OrderByInput] = Field(default_factory=list, alias="orderBy")
    limit: Optional[int] = None

    model_config = ConfigDict(populate_by_name=True)


class BuildRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")
    git_ref: Optional[str] = Field(default=None, alias="gitRef")
    force_recompile: bool = Field(default=False, alias="forceRecompile")

    model_config = ConfigDict(populate_by_name=True)


class DimensionValuesRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")
    dimension: str
    metrics: List[str] = Field(default_factory=list)
    start_time: Optional[datetime] = Field(default=None, alias="startTime")
    end_time: Optional[datetime] = Field(default=None, alias="endTime")

    model_config = ConfigDict(populate_by_name=True)


FilterGroupItem.model_rebuild()
FilterGroup.model_rebuild()
Filters.model_rebuild()
