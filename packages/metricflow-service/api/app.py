from __future__ import annotations

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from strawberry.fastapi import GraphQLRouter

from api.graphql_schema import schema
from api.rest_models import (
    CompileSqlRequest,
    CreateQueryRequest,
    DimensionValuesRequest,
    MetricsForDimensionsRequest,
    ValidateQueryRequest,
    BuildRequest,
)
from core.auth import authorize_project, extract_bearer_token, require_bearer_token
from core.errors import APIError, ErrorCode
from core.input_mapper import (
    to_group_by_input,
    to_metric_input,
    to_order_by_input,
    to_filters_input,
)
from core.engine_manager import _DEFAULT_ENGINE_PROVIDER
from core.build_manager import BuildManager
from core.query_store import QueryStore
from core.query_service import QueryService, list_dimensions, list_metrics, list_semantic_models, metrics_for_dimensions

app = FastAPI()
_QUERY_STORE = QueryStore()
_QUERY_SERVICE = QueryService(store=_QUERY_STORE, engine_provider=_DEFAULT_ENGINE_PROVIDER.get_engine)
_BUILD_MANAGER = BuildManager(engine_rebuilder=_DEFAULT_ENGINE_PROVIDER.rebuild_engine)


def _graphql_context_getter(request: Request):
    return {"request": request, "token": extract_bearer_token(request)}


graphql_app = GraphQLRouter(schema, context_getter=_graphql_context_getter)
app.include_router(graphql_app, prefix="/api/graphql")


def ok(data):
    return {"ok": True, "data": data, "error": None}


def _authorize(request: Request, project_id: str) -> None:
    token = require_bearer_token(request)
    authorize_project(project_id, token)


@app.exception_handler(APIError)
def handle_api_error(_: Request, exc: APIError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"ok": False, "data": None, "error": exc.to_dict()},
    )


@app.exception_handler(RequestValidationError)
def handle_validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "ok": False,
            "data": None,
            "error": {
                "code": ErrorCode.VALIDATION_ERROR.value,
                "message": "参数校验失败",
                "details": exc.errors(),
            },
        },
    )


@app.exception_handler(Exception)
def handle_unexpected_error(_: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "data": None,
            "error": {
                "code": ErrorCode.INTERNAL_ERROR.value,
                "message": "服务器内部错误",
                "details": {"error": str(exc)},
            },
        },
    )


@app.get("/health")
def health_check():
    return ok({"status": "healthy"})


@app.get("/api/metrics")
def api_metrics(
    request: Request,
    project_id: str = Query(..., alias="projectId"),
):
    _authorize(request, project_id)
    metrics = list_metrics(project_id)
    return ok({"metrics": [metric.to_dict() for metric in metrics]})


@app.get("/api/dimensions")
def api_dimensions(
    request: Request,
    project_id: str = Query(..., alias="projectId"),
    metrics: str | None = None,
):
    _authorize(request, project_id)
    metric_names = None
    if metrics:
        metric_names = [name.strip() for name in metrics.split(",") if name.strip()]
    dimensions = list_dimensions(project_id, metric_names)
    return ok({"dimensions": [dimension.to_dict() for dimension in dimensions]})


@app.get("/api/semantic-models")
def api_semantic_models(
    request: Request,
    project_id: str = Query(..., alias="projectId"),
):
    _authorize(request, project_id)
    models = list_semantic_models(project_id)
    return ok({"semanticModels": [model.to_dict() for model in models]})


@app.post("/api/metrics-for-dimensions")
def api_metrics_for_dimensions(request: Request, req: MetricsForDimensionsRequest):
    _authorize(request, req.project_id)
    dimensions = [to_group_by_input(item) for item in req.dimensions]
    metrics = metrics_for_dimensions(req.project_id, dimensions)
    return ok({"metricsForDimensions": [metric.to_dict() for metric in metrics]})


@app.post("/api/queries")
def api_create_query(request: Request, req: CreateQueryRequest):
    _authorize(request, req.project_id)
    query_id = _QUERY_SERVICE.create_query(
        project_id=req.project_id,
        metrics=[to_metric_input(item) for item in req.metrics],
        group_by=[to_group_by_input(item) for item in req.group_by],
        filters=to_filters_input(req.filters),
        order_by=[to_order_by_input(item) for item in req.order_by],
        limit=req.limit,
        async_run=req.async_run,
    )
    return ok({"createQuery": {"queryId": query_id}})


@app.get("/api/queries/{query_id}")
def api_query_result(
    request: Request,
    query_id: str,
    project_id: str = Query(..., alias="projectId"),
    page_num: int = Query(1, alias="pageNum"),
):
    _ = page_num
    _authorize(request, project_id)
    result = _QUERY_SERVICE.get_query_result(project_id, query_id)
    return ok({"query": result.to_dict()})


@app.post("/api/validate")
def api_validate_query(request: Request, req: ValidateQueryRequest):
    _authorize(request, req.project_id)
    result = _QUERY_SERVICE.validate_query(
        project_id=req.project_id,
        metrics=[to_metric_input(item) for item in req.metrics],
        group_by=[to_group_by_input(item) for item in req.group_by],
        filters=to_filters_input(req.filters),
        order_by=[to_order_by_input(item) for item in req.order_by],
        limit=req.limit,
    )
    return ok({"validate": result})


@app.post("/api/build")
def api_build(request: Request, req: BuildRequest):
    _authorize(request, req.project_id)
    build_id = _BUILD_MANAGER.trigger_build(req.project_id, req.git_ref, req.force_recompile)
    return ok({"buildId": build_id})


@app.get("/api/build/{build_id}")
def api_build_status(request: Request, build_id: str, project_id: str = Query(..., alias="projectId")):
    _authorize(request, project_id)
    record = _BUILD_MANAGER.get_build_status(build_id)
    if record.project_id != project_id:
        raise APIError(
            code=ErrorCode.FORBIDDEN,
            message="无权查看该 build",
            status_code=403,
        )
    return ok({"build": record.to_dict()})


@app.post("/api/compile-sql")
def api_compile_sql(request: Request, req: CompileSqlRequest):
    _authorize(request, req.project_id)
    sql = _QUERY_SERVICE.compile_sql(
        project_id=req.project_id,
        metrics=[to_metric_input(item) for item in req.metrics],
        group_by=[to_group_by_input(item) for item in req.group_by],
        filters=to_filters_input(req.filters),
        order_by=[to_order_by_input(item) for item in req.order_by],
        limit=req.limit,
    )
    return ok({"compileSql": {"sql": sql}})


@app.post("/api/dimension-values")
def api_dimension_values(request: Request, req: DimensionValuesRequest):
    _authorize(request, req.project_id)
    values = _QUERY_SERVICE.get_dimension_values(
        project_id=req.project_id,
        dimension=req.dimension,
        metrics=req.metrics,
        start_time=req.start_time,
        end_time=req.end_time,
    )
    return ok({"dimension": req.dimension, "values": values, "totalCount": len(values)})
