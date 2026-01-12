from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
import time
import os
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

from dbt_semantic_interfaces.type_enums.dimension_type import DimensionType
from metricflow.engine.metricflow_engine import MetricFlowQueryRequest
from metricflow_semantics.errors.error_classes import ExecutionException, InvalidQueryException, UnknownMetricError
try:
    from metricflow_semantics.experimental.metricflow_exception import MetricFlowInternalError
except ImportError:  # 兼容 MetricflowInternalError 命名差异
    from metricflow_semantics.experimental.metricflow_exception import MetricflowInternalError as MetricFlowInternalError

from .engine_manager import _DEFAULT_ENGINE_PROVIDER, get_engine
from .errors import APIError, ErrorCode, error_message
from .filters_compiler import Filters, filters_to_where
from .json_result_encoder import encode_rows_and_columns
from .query_store import QueryStore, StoredQuery
from .perf_logger import log_perf
from services.sql_normalizer import normalize_sql_for_adapter
from .types import (
    DbtDimensionType,
    DbtMetricType,
    DbtQueryStatus,
    DbtTimeGranularity,
    DimensionDTO,
    MetricDTO,
    MetricSummaryDTO,
    QueryResultDTO,
    SemanticModelDetailDTO,
    SemanticModelDTO,
)


@dataclass(frozen=True)
class MetricInput:
    name: str


@dataclass(frozen=True)
class GroupByInput:
    name: str
    grain: Optional[DbtTimeGranularity] = None


@dataclass(frozen=True)
class OrderByInput:
    descending: bool
    metric: Optional[MetricInput] = None
    group_by: Optional[GroupByInput] = None


QUERYABLE_GRANULARITIES = [
    DbtTimeGranularity.DAY,
    DbtTimeGranularity.WEEK,
    DbtTimeGranularity.MONTH,
    DbtTimeGranularity.QUARTER,
    DbtTimeGranularity.YEAR,
]
DEFAULT_METRIC_TIME_LABEL = "日期"
DEFAULT_METRIC_TIME_MODEL = SemanticModelDTO(
    name="日期维度",
    label="日期维度",
    description="时间脊柱",
)

_MAX_LIMIT = int(os.getenv("QUERY_MAX_LIMIT", "10000"))
_DEFAULT_QUERY_STORE = QueryStore(ttl_seconds=int(os.getenv("QUERY_TTL_SECONDS", "3600")))
_DEFAULT_EXECUTOR = ThreadPoolExecutor(max_workers=int(os.getenv("QUERY_ASYNC_WORKERS", "4")))

def _normalize_group_by(group_by: GroupByInput) -> str:
    if group_by.grain:
        grain_value = getattr(group_by.grain, "value", group_by.grain)
        return f"{group_by.name}__{str(grain_value).lower()}"
    return group_by.name


def _normalize_order_by(order_by: OrderByInput) -> str:
    if order_by.metric and order_by.group_by:
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message="orderBy 只能指定 metric 或 groupBy",
            status_code=422,
        )
    if not order_by.metric and not order_by.group_by:
        raise APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message="orderBy 必须指定 metric 或 groupBy",
            status_code=422,
        )
    target = order_by.metric.name if order_by.metric else _normalize_group_by(order_by.group_by)
    prefix = "-" if order_by.descending else ""
    return f"{prefix}{target}"


def _dimension_name(dim) -> str:
    raw_name, base_name = _dimension_names(dim)
    if getattr(dim, "type", None) == DimensionType.TIME:
        return base_name or raw_name or dim.name
    return raw_name or base_name or dim.name


def _dimension_names(dim) -> tuple[Optional[str], Optional[str]]:
    # 兼容不同版本的 MetricFlow Dimension 命名字段。
    base_name = None
    raw_name = None
    if hasattr(dim, "granularity_free_qualified_name"):
        base_name = getattr(dim, "granularity_free_qualified_name", None)
    elif hasattr(dim, "granularity_free_dunder_name"):
        base_name = getattr(dim, "granularity_free_dunder_name", None)

    if hasattr(dim, "qualified_name"):
        raw_name = getattr(dim, "qualified_name", None)
    elif hasattr(dim, "dunder_name"):
        raw_name = getattr(dim, "dunder_name", None)

    if raw_name is None:
        raw_name = getattr(dim, "name", None)
    if base_name is None:
        base_name = raw_name
    return raw_name, base_name


def _map_semantic_model(lookup, reference) -> Optional[SemanticModelDTO]:
    if not reference or not lookup:
        return None
    model = lookup.get_by_reference(reference)
    if not model:
        return None
    return SemanticModelDTO(
        name=model.name,
        label=getattr(model, "label", None),
        description=getattr(model, "description", None),
    )


def _get_semantic_models(lookup, semantic_model_lookup) -> List[Any]:
    if semantic_model_lookup and hasattr(semantic_model_lookup, "model_reference_to_model"):
        return list(semantic_model_lookup.model_reference_to_model.values())
    if semantic_model_lookup and hasattr(semantic_model_lookup, "_semantic_model_reference_to_semantic_model"):
        raw = getattr(semantic_model_lookup, "_semantic_model_reference_to_semantic_model", None)
        if isinstance(raw, dict):
            return list(raw.values())
    if lookup and hasattr(lookup, "semantic_manifest"):
        manifest = getattr(lookup, "semantic_manifest", None)
        if manifest and getattr(manifest, "semantic_models", None):
            return list(manifest.semantic_models)
    return []


def _map_dimension(dim, lookup) -> DimensionDTO:
    dim_type = DbtDimensionType[dim.type.name]
    name = _dimension_name(dim)
    queryable_granularities = QUERYABLE_GRANULARITIES if dim_type == DbtDimensionType.TIME else []
    label = getattr(dim, "label", None)
    semantic_model = _map_semantic_model(lookup, getattr(dim, "semantic_model_reference", None))
    if name == "metric_time":
        if not label:
            label = DEFAULT_METRIC_TIME_LABEL
        if not semantic_model:
            semantic_model = DEFAULT_METRIC_TIME_MODEL
    return DimensionDTO(
        name=name,
        description=getattr(dim, "description", None),
        label=label,
        type=dim_type,
        queryable_granularities=queryable_granularities,
        semantic_model=semantic_model,
    )


def _dedupe_dimensions(dimensions: Iterable[DimensionDTO]) -> List[DimensionDTO]:
    seen = set()
    ordered: List[DimensionDTO] = []
    for dim in dimensions:
        if dim.name in seen:
            continue
        seen.add(dim.name)
        ordered.append(dim)
    return ordered


def _dedupe_semantic_models(models: Iterable[SemanticModelDTO]) -> List[SemanticModelDTO]:
    seen = set()
    ordered: List[SemanticModelDTO] = []
    for model in models:
        if model.name in seen:
            continue
        seen.add(model.name)
        ordered.append(model)
    return ordered


def _map_metric_semantic_models(lookup, references) -> List[SemanticModelDTO]:
    if not references:
        return []
    models = []
    for reference in references:
        model = _map_semantic_model(lookup, reference)
        if model:
            models.append(model)
    return _dedupe_semantic_models(models)


def _dedupe_metric_summaries(metrics: Iterable[MetricSummaryDTO]) -> List[MetricSummaryDTO]:
    seen = set()
    ordered: List[MetricSummaryDTO] = []
    for metric in metrics:
        if metric.name in seen:
            continue
        seen.add(metric.name)
        ordered.append(metric)
    return ordered


def list_metrics(project_id: str) -> List[MetricDTO]:
    engine = get_engine(project_id)
    metrics = engine.list_metrics(include_dimensions=True)
    lookup = getattr(engine, "_semantic_manifest_lookup", None)
    semantic_model_lookup = lookup.semantic_model_lookup if lookup else None
    results: List[MetricDTO] = []
    for metric in metrics:
        metric_type = DbtMetricType[metric.type.name]
        dims = _dedupe_dimensions([_map_dimension(dim, semantic_model_lookup) for dim in metric.dimensions])
        semantic_models = _map_metric_semantic_models(semantic_model_lookup, getattr(metric, "semantic_models", None))
        results.append(
            MetricDTO(
                name=metric.name,
                description=getattr(metric, "description", None),
                label=getattr(metric, "label", None),
                type=metric_type,
                queryable_granularities=QUERYABLE_GRANULARITIES,
                dimensions=dims,
                semantic_models=semantic_models,
            )
        )
    return results


def list_dimensions(project_id: str, metric_names: Optional[List[str]]) -> List[DimensionDTO]:
    engine = get_engine(project_id)
    dims = engine.list_dimensions(metric_names=metric_names)
    lookup = getattr(engine, "_semantic_manifest_lookup", None)
    semantic_model_lookup = lookup.semantic_model_lookup if lookup else None
    return _dedupe_dimensions([_map_dimension(dim, semantic_model_lookup) for dim in dims])


def list_semantic_models(project_id: str) -> List[SemanticModelDetailDTO]:
    engine = get_engine(project_id)
    lookup = getattr(engine, "_semantic_manifest_lookup", None)
    semantic_model_lookup = lookup.semantic_model_lookup if lookup else None

    model_info: Dict[str, SemanticModelDTO] = {}
    models = _get_semantic_models(lookup, semantic_model_lookup)

    for model in models:
        model_info[model.name] = SemanticModelDTO(
            name=model.name,
            label=getattr(model, "label", None),
            description=getattr(model, "description", None),
        )

    metrics_by_model: Dict[str, List[MetricSummaryDTO]] = {}
    dimensions_by_model: Dict[str, List[DimensionDTO]] = {}

    metrics = engine.list_metrics(include_dimensions=False)
    for metric in metrics:
        summary = MetricSummaryDTO(
            name=metric.name,
            description=getattr(metric, "description", None),
            label=getattr(metric, "label", None),
            type=DbtMetricType[metric.type.name],
        )
        semantic_models = _map_metric_semantic_models(semantic_model_lookup, getattr(metric, "semantic_models", None))
        for model in semantic_models:
            model_info.setdefault(model.name, model)
            metrics_by_model.setdefault(model.name, []).append(summary)

    dims = engine.list_dimensions(metric_names=None)
    for dim in dims:
        dim_dto = _map_dimension(dim, semantic_model_lookup)
        model = dim_dto.semantic_model
        if not model:
            continue
        model_info.setdefault(model.name, model)
        dimensions_by_model.setdefault(model.name, []).append(dim_dto)

    results: List[SemanticModelDetailDTO] = []
    for name, model in model_info.items():
        results.append(
            SemanticModelDetailDTO(
                name=model.name,
                label=model.label,
                description=model.description,
                metrics=_dedupe_metric_summaries(metrics_by_model.get(name, [])),
                dimensions=_dedupe_dimensions(dimensions_by_model.get(name, [])),
            )
        )
    return sorted(results, key=lambda item: item.name)


def _list_entity_names(engine) -> set[str]:
    lookup = getattr(engine, "_semantic_manifest_lookup", None)
    semantic_model_lookup = lookup.semantic_model_lookup if lookup else None
    models = _get_semantic_models(lookup, semantic_model_lookup)

    entity_names: set[str] = set()
    for model in models:
        entities = getattr(model, "entities", None) or []
        for entity in entities:
            name = entity.get("name") if isinstance(entity, dict) else getattr(entity, "name", None)
            if name:
                entity_names.add(name)
    return entity_names


def metrics_for_dimensions(project_id: str, dimensions: List[GroupByInput]) -> List[MetricDTO]:
    engine = get_engine(project_id)
    metrics = engine.list_metrics(include_dimensions=True)
    lookup = getattr(engine, "_semantic_manifest_lookup", None)
    semantic_model_lookup = lookup.semantic_model_lookup if lookup else None
    if not dimensions:
        return list_metrics(project_id)

    requested_dims = dimensions

    matched: List[MetricDTO] = []
    for metric in metrics:
        raw_names = set()
        base_names = set()
        time_base_names = set()
        for dim in metric.dimensions:
            raw_name, base_name = _dimension_names(dim)
            if raw_name:
                raw_names.add(raw_name)
            if base_name:
                base_names.add(base_name)
                if getattr(dim, "type", None) == DimensionType.TIME:
                    time_base_names.add(base_name)

        has_all = True
        for dim in requested_dims:
            if dim.grain:
                normalized = _normalize_group_by(dim)
                if normalized not in raw_names and dim.name not in time_base_names:
                    has_all = False
                    break
            else:
                if dim.name not in base_names:
                    has_all = False
                    break
        if not has_all:
            continue
        dims = _dedupe_dimensions([_map_dimension(dim, semantic_model_lookup) for dim in metric.dimensions])
        semantic_models = _map_metric_semantic_models(semantic_model_lookup, getattr(metric, "semantic_models", None))
        matched.append(
            MetricDTO(
                name=metric.name,
                description=getattr(metric, "description", None),
                label=getattr(metric, "label", None),
                type=DbtMetricType[metric.type.name],
                queryable_granularities=QUERYABLE_GRANULARITIES,
                dimensions=dims,
                semantic_models=semantic_models,
            )
        )
    return matched


def _build_query_request(
    metrics: List[MetricInput],
    group_by: List[GroupByInput],
    where_constraints: List[str],
    order_by: List[OrderByInput],
    limit: Optional[int],
    metric_names: Optional[List[str]] = None,
    group_by_names: Optional[List[str]] = None,
    order_by_names: Optional[List[str]] = None,
    request_id: Optional[str] = None,
) -> MetricFlowQueryRequest:
    metric_names = metric_names or [metric.name for metric in metrics]
    group_by_names = group_by_names or [_normalize_group_by(item) for item in group_by]
    if order_by_names is None:
        order_by_names = [_normalize_order_by(item) for item in order_by] if order_by else []
    final_limit = min(limit, _MAX_LIMIT) if limit is not None else None
    request = MetricFlowQueryRequest.create_with_random_request_id(
        metric_names=metric_names,
        group_by_names=group_by_names,
        where_constraints=where_constraints,
        order_by_names=order_by_names,
        limit=final_limit,
    )
    if request_id:
        # MetricFlowQueryRequest 是 frozen dataclass，使用 replace 替换 request_id，方便与外部 query_id 对齐。
        request = replace(request, request_id=request_id)
    return request


def _prepare_query_request(
    project_id: str,
    metrics: List[MetricInput],
    group_by: List[GroupByInput],
    filters: Optional[Filters],
    order_by: List[OrderByInput],
    limit: Optional[int],
    request_id: Optional[str] = None,
    engine_provider=get_engine,
) -> tuple[Any, MetricFlowQueryRequest, List[str], List[str], List[str], int]:
    prep_start = time.perf_counter()
    metric_names = [metric.name for metric in metrics]
    group_by_names = [_normalize_group_by(item) for item in group_by]
    order_by_names = [_normalize_order_by(item) for item in order_by] if order_by else []
    engine = engine_provider(project_id)
    entity_names = _list_entity_names(engine)
    where_constraints = filters_to_where(
        filters,
        group_by_names,
        entity_names=entity_names if entity_names else None,
    )
    request = _build_query_request(
        metrics,
        group_by,
        where_constraints,
        order_by,
        limit,
        metric_names=metric_names,
        group_by_names=group_by_names,
        order_by_names=order_by_names,
        request_id=request_id,
    )
    prep_ms = round((time.perf_counter() - prep_start) * 1000)
    return engine, request, where_constraints, group_by_names, order_by_names, prep_ms


def _format_query_result(
    status: DbtQueryStatus,
    sql: Optional[str],
    columns: Optional[list],
    rows: Optional[list],
    warnings: Optional[list],
    error: Optional[str],
) -> QueryResultDTO:
    # TODO: 支持分页，当前 totalPages 固定为 1。
    return QueryResultDTO(
        status=status,
        sql=sql,
        columns=columns,
        rows=rows,
        warnings=warnings,
        total_pages=1,
        error=error,
    )


class QueryService:
    def __init__(
        self,
        store: QueryStore = _DEFAULT_QUERY_STORE,
        executor: ThreadPoolExecutor = _DEFAULT_EXECUTOR,
        engine_provider=_DEFAULT_ENGINE_PROVIDER.get_engine,
        sql_normalizer=normalize_sql_for_adapter,
        perf_logger=log_perf,
    ):
        self.store = store
        self.executor = executor
        self.engine_provider = engine_provider
        self.sql_normalizer = sql_normalizer
        self.perf_logger = perf_logger

    def _run_query(self, project_id: str, query_id: str, request: MetricFlowQueryRequest) -> None:
        perf = self.perf_logger(
            "query_service:run_query",
            None,
            {"query_id": query_id, "async": True},
        )
        self.store.update(query_id, status=DbtQueryStatus.RUNNING)
        try:
            engine = self.engine_provider(project_id)
            engine_start = time.perf_counter()
            result = engine.query(mf_request=request)
            engine_ms = round((time.perf_counter() - engine_start) * 1000)
            sql = self.sql_normalizer(result.sql, engine)
            columns, rows = encode_rows_and_columns(result.result_df) if result.result_df else ([], [])
            self.store.update(
                query_id,
                status=DbtQueryStatus.SUCCESSFUL,
                sql=sql,
                columns=columns,
                rows=rows,
                warnings=getattr(result, "warnings", None),
                total_pages=1,
                error=None,
            )
            perf.finish({"status": "SUCCESSFUL", "engine_ms": engine_ms})
        except ExecutionException as exc:
            perf.finish({"status": "FAILED", "error": str(exc)})
            self.store.update(
                query_id,
                status=DbtQueryStatus.FAILED,
                error=str(exc),
            )
        except Exception as exc:
            perf.finish({"status": "FAILED", "error": str(exc)})
            self.store.update(
                query_id,
                status=DbtQueryStatus.FAILED,
                error=str(exc),
            )

    def create_query(
        self,
        project_id: str,
        metrics: List[MetricInput],
        group_by: List[GroupByInput],
        filters: Optional[Filters],
        order_by: List[OrderByInput],
        limit: Optional[int],
        async_run: bool,
    ) -> str:
        query_id = str(uuid4())
        perf = self.perf_logger(
            "query_service:create_query",
            None,
            {
                "query_id": query_id,
                "metrics": len(metrics or []),
                "group_by": len(group_by or []),
                "async": async_run,
            },
        )
        try:
            engine, request, where_constraints, group_by_names, order_by_names, prep_ms = _prepare_query_request(
                project_id,
                metrics,
                group_by,
                filters,
                order_by,
                limit,
                request_id=query_id,
                engine_provider=self.engine_provider,
            )
        except APIError as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            raise

        stored = StoredQuery(
            query_id=query_id,
            project_id=project_id,
            status=DbtQueryStatus.PENDING if async_run else DbtQueryStatus.RUNNING,
            request_payload={
                "metrics": [m.name for m in metrics],
                "group_by": group_by_names,
                "where": where_constraints,
                "order_by": order_by_names,
                "limit": limit,
            },
        )
        self.store.set(stored)

        try:
            if async_run:
                self.executor.submit(self._run_query, project_id, query_id, request)
                perf.finish({"status": "PENDING", "prep_ms": prep_ms})
                return query_id

            engine_start = time.perf_counter()
            result = engine.query(mf_request=request)
            engine_ms = round((time.perf_counter() - engine_start) * 1000)
            sql = self.sql_normalizer(result.sql, engine)
            columns, rows = encode_rows_and_columns(result.result_df) if result.result_df else ([], [])
            self.store.update(
                query_id,
                status=DbtQueryStatus.SUCCESSFUL,
                sql=sql,
                columns=columns,
                rows=rows,
                warnings=getattr(result, "warnings", None),
                total_pages=1,
                error=None,
            )
            perf.finish({"status": "SUCCESSFUL", "prep_ms": prep_ms, "engine_ms": engine_ms})
            return query_id
        except UnknownMetricError as exc:
            perf.finish({"status": "ERROR", "prep_ms": prep_ms, "error": str(exc)})
            raise APIError(
                code=ErrorCode.METRIC_NOT_FOUND,
                message=str(exc),
                status_code=404,
            ) from exc
        except InvalidQueryException as exc:
            perf.finish({"status": "ERROR", "prep_ms": prep_ms, "error": str(exc)})
            raise APIError(
                code=ErrorCode.VALIDATION_ERROR,
                message=str(exc),
                status_code=422,
            ) from exc
        except ExecutionException as exc:
            perf.finish({"status": "ERROR", "prep_ms": prep_ms, "error": str(exc)})
            raise APIError(
                code=ErrorCode.QUERY_EXECUTION_FAILED,
                message=str(exc),
                status_code=500,
            ) from exc
        except MetricFlowInternalError as exc:
            perf.finish({"status": "ERROR", "prep_ms": prep_ms, "error": str(exc)})
            raise APIError(
                code=ErrorCode.QUERY_EXECUTION_FAILED,
                message=str(exc),
                status_code=500,
            ) from exc
        except Exception as exc:
            perf.finish({"status": "ERROR", "prep_ms": prep_ms, "error": str(exc)})
            raise APIError(
                code=ErrorCode.INTERNAL_ERROR,
                message=str(exc),
                status_code=500,
            ) from exc

    def get_query_result(self, project_id: str, query_id: str) -> QueryResultDTO:
        stored, expired = self.store.get(query_id)
        if expired:
            raise APIError(
                code=ErrorCode.QUERY_EXPIRED,
                message=f"queryId={query_id} 已过期",
                status_code=410,
            )
        if not stored or stored.project_id != project_id:
            raise APIError(
                code=ErrorCode.QUERY_NOT_FOUND,
                message=f"queryId={query_id} 不存在",
                status_code=404,
            )
        if stored.status in (DbtQueryStatus.PENDING, DbtQueryStatus.RUNNING, DbtQueryStatus.COMPILED):
            return _format_query_result(stored.status, stored.sql, None, None, None, stored.error)
        return stored.to_result()


    def compile_sql(
        self,
        project_id: str,
        metrics: List[MetricInput],
        group_by: List[GroupByInput],
        filters: Optional[Filters],
        order_by: List[OrderByInput],
        limit: Optional[int],
    ) -> str:
        perf = self.perf_logger(
            "query_service:compile_sql",
            None,
            {"metrics": len(metrics or []), "group_by": len(group_by or [])},
        )
        try:
            engine, request, _where_constraints, _group_by_names, _order_by_names, prep_ms = _prepare_query_request(
                project_id,
                metrics,
                group_by,
                filters,
                order_by,
                limit,
                engine_provider=self.engine_provider,
            )
            explain_start = time.perf_counter()
            explain = engine.explain(mf_request=request)
            engine_ms = round((time.perf_counter() - explain_start) * 1000)
            sql = self.sql_normalizer(explain.sql_statement.sql, engine)
            perf.finish(
                {
                    "status": "SUCCESSFUL",
                    "prep_ms": prep_ms,
                    "engine_ms": engine_ms,
                    "sql_length": len(sql),
                }
            )
            return sql
        except UnknownMetricError as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            raise APIError(
                code=ErrorCode.METRIC_NOT_FOUND,
                message=str(exc),
                status_code=404,
            ) from exc
        except InvalidQueryException as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            raise APIError(
                code=ErrorCode.VALIDATION_ERROR,
                message=str(exc),
                status_code=422,
            ) from exc
        except ExecutionException as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            raise APIError(
                code=ErrorCode.QUERY_COMPILE_FAILED,
                message=str(exc),
                status_code=500,
            ) from exc
        except MetricFlowInternalError as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            raise APIError(
                code=ErrorCode.QUERY_COMPILE_FAILED,
                message=str(exc),
                status_code=500,
            ) from exc
        except Exception as exc:
            perf.finish({"status": "ERROR", "error": str(exc)})
            raise APIError(
                code=ErrorCode.INTERNAL_ERROR,
                message=str(exc),
                status_code=500,
            ) from exc

    def validate_query(
        self,
        project_id: str,
        metrics: List[MetricInput],
        group_by: List[GroupByInput],
        filters: Optional[Filters],
        order_by: List[OrderByInput],
        limit: Optional[int],
    ) -> dict:
        try:
            _prepare_query_request(
                project_id,
                metrics,
                group_by,
                filters,
                order_by,
                limit,
                engine_provider=self.engine_provider,
            )
            return {"errors": [], "warnings": []}
        except APIError as exc:
            return {
                "errors": [
                    {
                        "code": exc.code.value if hasattr(exc.code, "value") else str(exc.code),
                        "message": exc.message,
                        "details": exc.details,
                    }
                ],
                "warnings": [],
            }

    def get_dimension_values(
        self,
        project_id: str,
        dimension: str,
        metrics: List[str],
        start_time: Optional[datetime],
        end_time: Optional[datetime],
    ) -> List[str]:
        try:
            engine = self.engine_provider(project_id)
            return engine.get_dimension_values(
                metric_names=metrics,
                get_group_by_values=dimension,
                time_constraint_start=start_time,
                time_constraint_end=end_time,
            )
        except UnknownMetricError as exc:
            raise APIError(
                code=ErrorCode.METRIC_NOT_FOUND,
                message=str(exc),
                status_code=404,
            ) from exc
        except InvalidQueryException as exc:
            raise APIError(
                code=ErrorCode.VALIDATION_ERROR,
                message=str(exc),
                status_code=422,
            ) from exc
        except ExecutionException as exc:
            raise APIError(
                code=ErrorCode.QUERY_EXECUTION_FAILED,
                message=str(exc),
                status_code=500,
            ) from exc
        except MetricFlowInternalError as exc:
            raise APIError(
                code=ErrorCode.QUERY_EXECUTION_FAILED,
                message=str(exc),
                status_code=500,
            ) from exc
        except Exception as exc:
            raise APIError(
                code=ErrorCode.INTERNAL_ERROR,
                message=str(exc),
                status_code=500,
            ) from exc


# 默认服务实例，保持现有 API 兼容
_DEFAULT_QUERY_SERVICE = QueryService()


def create_query(
    project_id: str,
    metrics: List[MetricInput],
    group_by: List[GroupByInput],
    filters: Optional[Filters],
    order_by: List[OrderByInput],
    limit: Optional[int],
    async_run: bool,
) -> str:
    return _DEFAULT_QUERY_SERVICE.create_query(
        project_id=project_id,
        metrics=metrics,
        group_by=group_by,
        filters=filters,
        order_by=order_by,
        limit=limit,
        async_run=async_run,
    )


def get_query_result(project_id: str, query_id: str) -> QueryResultDTO:
    return _DEFAULT_QUERY_SERVICE.get_query_result(project_id, query_id)


def compile_sql(
    project_id: str,
    metrics: List[MetricInput],
    group_by: List[GroupByInput],
    filters: Optional[Filters],
    order_by: List[OrderByInput],
    limit: Optional[int],
) -> str:
    return _DEFAULT_QUERY_SERVICE.compile_sql(
        project_id=project_id,
        metrics=metrics,
        group_by=group_by,
        filters=filters,
        order_by=order_by,
        limit=limit,
    )


def validate_query(
    project_id: str,
    metrics: List[MetricInput],
    group_by: List[GroupByInput],
    filters: Optional[Filters],
    order_by: List[OrderByInput],
    limit: Optional[int],
) -> dict:
    return _DEFAULT_QUERY_SERVICE.validate_query(
        project_id=project_id,
        metrics=metrics,
        group_by=group_by,
        filters=filters,
        order_by=order_by,
        limit=limit,
    )


def get_dimension_values(
    project_id: str,
    dimension: str,
    metrics: List[str],
    start_time: Optional[datetime],
    end_time: Optional[datetime],
) -> List[str]:
    return _DEFAULT_QUERY_SERVICE.get_dimension_values(
        project_id=project_id,
        dimension=dimension,
        metrics=metrics,
        start_time=start_time,
        end_time=end_time,
    )
