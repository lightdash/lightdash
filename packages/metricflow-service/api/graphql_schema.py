from __future__ import annotations

from typing import Annotated, List, Optional
from datetime import datetime
from enum import Enum

import strawberry
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry.exceptions import GraphQLError

from core.auth import authorize_project
from core.errors import APIError, error_message
from core.input_mapper import (
    to_filters_input,
    to_group_by_input,
    to_metric_input,
    to_order_by_input,
)
from core.engine_manager import _DEFAULT_ENGINE_PROVIDER
from core.query_store import QueryStore
from core.query_service import QueryService, list_dimensions, list_metrics, list_semantic_models, metrics_for_dimensions
from core.perf_logger import log_perf
from core.types import (
    DimensionDTO,
    MetricDTO,
    MetricSummaryDTO,
    QueryResultDTO,
    SemanticModelDetailDTO,
    SemanticModelDTO,
)


@strawberry.enum(name="DbtTimeGranularity")
class DbtTimeGranularityEnum(str, Enum):
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


@strawberry.enum(name="DbtDimensionType")
class DbtDimensionTypeEnum(str, Enum):
    CATEGORICAL = "CATEGORICAL"
    TIME = "TIME"


@strawberry.enum(name="DbtMetricType")
class DbtMetricTypeEnum(str, Enum):
    SIMPLE = "SIMPLE"
    RATIO = "RATIO"
    CUMULATIVE = "CUMULATIVE"
    DERIVED = "DERIVED"
    CONVERSION = "CONVERSION"


@strawberry.enum(name="DbtQueryStatus")
class DbtQueryStatusEnum(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPILED = "COMPILED"
    SUCCESSFUL = "SUCCESSFUL"
    FAILED = "FAILED"


@strawberry.input(name="MetricInput")
class MetricInput:
    name: str


@strawberry.input(name="GroupByInput")
class GroupByInput:
    name: str
    grain: Optional[DbtTimeGranularityEnum] = None


@strawberry.input(name="OrderByInput")
class OrderByInput:
    descending: bool
    metric: Optional[MetricInput] = None
    group_by: Optional[GroupByInput] = strawberry.field(default=None, name="groupBy")


@strawberry.input(name="FilterTargetInput")
class FilterTargetInput:
    field_id: str = strawberry.field(name="fieldId")


@strawberry.input(name="FilterSettingsInput")
class FilterSettingsInput:
    unit_of_time: Optional[str] = strawberry.field(default=None, name="unitOfTime")
    completed: Optional[bool] = None
    group_by: Optional[List[str]] = strawberry.field(default=None, name="groupBy")


@strawberry.input(name="FilterRuleInput")
class FilterRuleInput:
    id: str
    target: FilterTargetInput
    operator: str
    values: Optional[List[JSON]] = None
    settings: Optional[FilterSettingsInput] = None
    disabled: Optional[bool] = False


@strawberry.input(name="FilterGroupItemInput")
class FilterGroupItemInput:
    rule: Optional[FilterRuleInput] = None
    group: Optional["FilterGroupInput"] = None


@strawberry.input(name="FilterGroupInput")
class FilterGroupInput:
    id: str
    and_items: Optional[List[FilterGroupItemInput]] = strawberry.field(default=None, name="and")
    or_items: Optional[List[FilterGroupItemInput]] = strawberry.field(default=None, name="or")


@strawberry.input(name="FiltersInput")
class FiltersInput:
    dimensions: Optional[FilterGroupInput] = None
    metrics: Optional[FilterGroupInput] = None
    table_calculations: Optional[FilterGroupInput] = strawberry.field(default=None, name="tableCalculations")


@strawberry.type(name="Dimension")
class Dimension:
    name: str
    description: Optional[str]
    label: Optional[str]
    type: DbtDimensionTypeEnum
    queryable_granularities: List[DbtTimeGranularityEnum] = strawberry.field(name="queryableGranularities")
    semantic_model: Optional["SemanticModel"] = strawberry.field(name="semanticModel")


@strawberry.type(name="Metric")
class Metric:
    name: str
    description: Optional[str]
    label: Optional[str]
    type: DbtMetricTypeEnum
    queryable_granularities: List[DbtTimeGranularityEnum] = strawberry.field(name="queryableGranularities")
    dimensions: List[Dimension]
    semantic_models: List["SemanticModel"] = strawberry.field(name="semanticModels")


@strawberry.type(name="MetricSummary")
class MetricSummary:
    name: str
    description: Optional[str]
    label: Optional[str]
    type: DbtMetricTypeEnum


@strawberry.type(name="SemanticModel")
class SemanticModel:
    name: str
    label: Optional[str]
    description: Optional[str]


@strawberry.type(name="SemanticModelDetail")
class SemanticModelDetail:
    name: str
    label: Optional[str]
    description: Optional[str]
    metrics: List[MetricSummary]
    dimensions: List[Dimension]


@strawberry.type(name="CreateQueryPayload")
class CreateQueryPayload:
    query_id: str = strawberry.field(name="queryId")


@strawberry.type(name="CompileSqlPayload")
class CompileSqlPayload:
    sql: str


@strawberry.type(name="QueryResult")
class QueryResult:
    status: DbtQueryStatusEnum
    sql: Optional[str]
    columns: Optional[JSON] = None
    rows: Optional[JSON] = None
    warnings: Optional[List[str]] = None
    total_pages: Optional[int] = strawberry.field(name="totalPages")
    error: Optional[str]


@strawberry.type(name="DimensionValuesPayload")
class DimensionValuesPayload:
    dimension: str
    values: List[str]
    total_count: int = strawberry.field(name="totalCount")


def _raise_graphql_error(exc: APIError):
    raise GraphQLError(error_message(exc))


def _require_auth(info: Info, project_id: str) -> None:
    token = info.context.get("token") if info.context else None
    if not token:
        raise GraphQLError("UNAUTHORIZED: 缺少 Authorization: Bearer <token>")
    try:
        authorize_project(project_id, token)
    except APIError as exc:
        _raise_graphql_error(exc)


def _map_semantic_model(dto: Optional[SemanticModelDTO]) -> Optional[SemanticModel]:
    if not dto:
        return None
    return SemanticModel(name=dto.name, label=dto.label, description=dto.description)


def _map_dimension(dto: DimensionDTO) -> Dimension:
    return Dimension(
        name=dto.name,
        description=dto.description,
        label=dto.label,
        type=DbtDimensionTypeEnum(dto.type.value),
        queryable_granularities=[DbtTimeGranularityEnum(g.value) for g in dto.queryable_granularities],
        semantic_model=_map_semantic_model(dto.semantic_model),
    )


def _map_metric(dto: MetricDTO) -> Metric:
    return Metric(
        name=dto.name,
        description=dto.description,
        label=dto.label,
        type=DbtMetricTypeEnum(dto.type.value),
        queryable_granularities=[DbtTimeGranularityEnum(g.value) for g in dto.queryable_granularities],
        dimensions=[_map_dimension(dim) for dim in dto.dimensions],
        semantic_models=[_map_semantic_model(model) for model in dto.semantic_models],
    )


def _map_metric_summary(dto: MetricSummaryDTO) -> MetricSummary:
    return MetricSummary(
        name=dto.name,
        description=dto.description,
        label=dto.label,
        type=DbtMetricTypeEnum(dto.type.value),
    )


def _map_semantic_model_detail(dto: SemanticModelDetailDTO) -> SemanticModelDetail:
    return SemanticModelDetail(
        name=dto.name,
        label=dto.label,
        description=dto.description,
        metrics=[_map_metric_summary(metric) for metric in dto.metrics],
        dimensions=[_map_dimension(dim) for dim in dto.dimensions],
    )


def _map_query_result(dto: QueryResultDTO) -> QueryResult:
    return QueryResult(
        status=DbtQueryStatusEnum(dto.status.value),
        sql=dto.sql,
        columns=dto.columns,
        rows=dto.rows,
        warnings=dto.warnings,
        total_pages=dto.total_pages,
        error=dto.error,
    )


@strawberry.type
class Query:
    @strawberry.field
    def metrics(self, info: Info, project_id: str = strawberry.argument(name="projectId")) -> List[Metric]:
        try:
            _require_auth(info, project_id)
            metrics = list_metrics(project_id)
            return [_map_metric(metric) for metric in metrics]
        except APIError as exc:
            _raise_graphql_error(exc)

    @strawberry.field(name="semanticModels")
    def semantic_models(
        self,
        info: Info,
        project_id: str = strawberry.argument(name="projectId"),
    ) -> List[SemanticModelDetail]:
        try:
            _require_auth(info, project_id)
            models = list_semantic_models(project_id)
            return [_map_semantic_model_detail(model) for model in models]
        except APIError as exc:
            _raise_graphql_error(exc)

    @strawberry.field
    def dimensions(
        self,
        info: Info,
        project_id: str = strawberry.argument(name="projectId"),
        metrics: Annotated[Optional[List[MetricInput]], strawberry.argument(name="metrics")] = None,
    ) -> List[Dimension]:
        try:
            _require_auth(info, project_id)
            metric_names = [metric.name for metric in metrics] if metrics else None
            dimensions = list_dimensions(project_id, metric_names)
            return [_map_dimension(dim) for dim in dimensions]
        except APIError as exc:
            _raise_graphql_error(exc)

    @strawberry.field(name="metricsForDimensions")
    def metrics_for_dimensions(
        self,
        info: Info,
        project_id: str = strawberry.argument(name="projectId"),
        dimensions: Annotated[Optional[List[GroupByInput]], strawberry.argument(name="dimensions")] = None,
    ) -> List[Metric]:
        try:
            _require_auth(info, project_id)
            service_dims = [to_group_by_input(item) for item in (dimensions or [])]
            metrics = metrics_for_dimensions(project_id, service_dims)
            return [_map_metric(metric) for metric in metrics]
        except APIError as exc:
            _raise_graphql_error(exc)

    @strawberry.field
    def query(
        self,
        info: Info,
        project_id: str = strawberry.argument(name="projectId"),
        query_id: str = strawberry.argument(name="queryId"),
        page_num: Annotated[Optional[int], strawberry.argument(name="pageNum")] = 1,
    ) -> QueryResult:
        _ = page_num
        perf = log_perf(
            "graphql:query",
            info.context.get("request"),
            {"query_id": query_id},
        )
        try:
            _require_auth(info, project_id)
            result = _GRAPHQL_QUERY_SERVICE.get_query_result(project_id, query_id)
            status = result.status.value if hasattr(result.status, "value") else str(result.status)
            perf.finish({"status": status})
            return _map_query_result(result)
        except APIError as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            _raise_graphql_error(exc)

    @strawberry.field(name="dimensionValues")
    def dimension_values(
        self,
        info: Info,
        project_id: str = strawberry.argument(name="projectId"),
        dimension: str = strawberry.argument(name="dimension"),
        metrics: Annotated[Optional[List[str]], strawberry.argument(name="metrics")] = None,
        start_time: Annotated[Optional[datetime], strawberry.argument(name="startTime")] = None,
        end_time: Annotated[Optional[datetime], strawberry.argument(name="endTime")] = None,
    ) -> DimensionValuesPayload:
        try:
            _require_auth(info, project_id)
            values = _GRAPHQL_QUERY_SERVICE.get_dimension_values(
                project_id=project_id,
                dimension=dimension,
                metrics=metrics or [],
                start_time=start_time,
                end_time=end_time,
            )
            return DimensionValuesPayload(dimension=dimension, values=values, total_count=len(values))
        except APIError as exc:
            _raise_graphql_error(exc)


@strawberry.type
class Mutation:
    @strawberry.mutation(name="createQuery")
    def create_query(
        self,
        info: Info,
        project_id: str = strawberry.argument(name="projectId"),
        metrics: Annotated[Optional[List[MetricInput]], strawberry.argument(name="metrics")] = None,
        group_by: Annotated[Optional[List[GroupByInput]], strawberry.argument(name="groupBy")] = None,
        limit: Optional[int] = None,
        filters: Annotated[Optional[FiltersInput], strawberry.argument(name="filters")] = None,
        order_by: Annotated[Optional[List[OrderByInput]], strawberry.argument(name="orderBy")] = None,
        async_run: Annotated[bool, strawberry.argument(name="async")] = False,
    ) -> CreateQueryPayload:
        perf = log_perf(
            "graphql:createQuery",
            info.context.get("request"),
            {
                "metrics": len(metrics or []),
                "group_by": len(group_by or []),
                "async": async_run,
            },
        )
        try:
            _require_auth(info, project_id)
            query_id = _GRAPHQL_QUERY_SERVICE.create_query(
                project_id=project_id,
                metrics=[to_metric_input(item) for item in (metrics or [])],
                group_by=[to_group_by_input(item) for item in (group_by or [])],
                filters=to_filters_input(filters),
                order_by=[to_order_by_input(item) for item in (order_by or [])],
                limit=limit,
                async_run=async_run,
            )
            perf.finish({"query_id": query_id})
            return CreateQueryPayload(query_id=query_id)
        except APIError as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            _raise_graphql_error(exc)

    @strawberry.mutation(name="compileSql")
    def compile_sql(
        self,
        info: Info,
        project_id: str = strawberry.argument(name="projectId"),
        metrics: Annotated[Optional[List[MetricInput]], strawberry.argument(name="metrics")] = None,
        group_by: Annotated[Optional[List[GroupByInput]], strawberry.argument(name="groupBy")] = None,
        limit: Optional[int] = None,
        filters: Annotated[Optional[FiltersInput], strawberry.argument(name="filters")] = None,
        order_by: Annotated[Optional[List[OrderByInput]], strawberry.argument(name="orderBy")] = None,
    ) -> CompileSqlPayload:
        perf = log_perf(
            "graphql:compileSql",
            info.context.get("request"),
            {
                "metrics": len(metrics or []),
                "group_by": len(group_by or []),
            },
        )
        try:
            _require_auth(info, project_id)
            sql = _GRAPHQL_QUERY_SERVICE.compile_sql(
                project_id=project_id,
                metrics=[to_metric_input(item) for item in (metrics or [])],
                group_by=[to_group_by_input(item) for item in (group_by or [])],
                filters=to_filters_input(filters),
                order_by=[to_order_by_input(item) for item in (order_by or [])],
                limit=limit,
            )
            perf.finish({"sql_length": len(sql)})
            return CompileSqlPayload(sql=sql)
        except APIError as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            _raise_graphql_error(exc)


_GRAPHQL_QUERY_STORE = QueryStore()
_GRAPHQL_QUERY_SERVICE = QueryService(store=_GRAPHQL_QUERY_STORE, engine_provider=_DEFAULT_ENGINE_PROVIDER.get_engine)
schema = strawberry.Schema(query=Query, mutation=Mutation)
