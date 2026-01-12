from __future__ import annotations

import threading
from typing import Dict

from dbt.adapters.factory import get_adapter_by_type
from dbt_metricflow.cli.dbt_connectors.adapter_backed_client import AdapterBackedSqlClient
from dbt_metricflow.cli.dbt_connectors.dbt_config_accessor import dbtProjectMetadata
from metricflow.engine.metricflow_engine import MetricFlowEngine
from metricflow_semantics.model.semantic_manifest_lookup import SemanticManifestLookup
from metricflow_semantics.model.dbt_manifest_parser import parse_manifest_from_dbt_generated_manifest

from .environment_registry import EnvironmentConfig, get_environment
from .errors import APIError, ErrorCode


def _load_manifest(env: EnvironmentConfig):
    manifest_path = env.semantic_manifest_path
    if manifest_path:
        if not manifest_path.exists():
            raise APIError(
                code=ErrorCode.MANIFEST_NOT_FOUND,
                message=f"找不到 semantic_manifest: {manifest_path}",
                status_code=500,
            )
        try:
            return parse_manifest_from_dbt_generated_manifest(manifest_path.read_text())
        except Exception as exc:
            raise APIError(
                code=ErrorCode.MANIFEST_INVALID,
                message="semantic_manifest 解析失败",
                status_code=500,
                details={"error": str(exc)},
            ) from exc
    return None


def _build_engine(env: EnvironmentConfig) -> MetricFlowEngine:
    try:
        project_metadata = dbtProjectMetadata.load_from_paths(
            profiles_path=env.profiles_dir,
            project_path=env.project_dir,
        )
    except APIError:
        raise
    except Exception as exc:
        raise APIError(
            code=ErrorCode.ENGINE_INIT_FAILED,
            message="加载 dbt 项目失败",
            status_code=500,
            details={"error": str(exc)},
        ) from exc

    adapter = get_adapter_by_type(project_metadata.profile.credentials.type)
    semantic_manifest = _load_manifest(env)
    if semantic_manifest is None:
        from dbt_metricflow.cli.dbt_connectors.dbt_config_accessor import dbtArtifacts

        try:
            artifacts = dbtArtifacts.load_from_project_metadata(project_metadata)
            semantic_manifest = artifacts.semantic_manifest
        except Exception as exc:
            raise APIError(
                code=ErrorCode.MANIFEST_INVALID,
                message="semantic_manifest 加载失败",
                status_code=500,
                details={"error": str(exc)},
            ) from exc

    sql_client = AdapterBackedSqlClient(adapter)
    semantic_manifest_lookup = SemanticManifestLookup(semantic_manifest)
    return MetricFlowEngine(semantic_manifest_lookup=semantic_manifest_lookup, sql_client=sql_client)


class EngineProvider:
    def __init__(self):
        self._cache: Dict[str, MetricFlowEngine] = {}
        self._lock = threading.Lock()

    def get_engine(self, project_id: str) -> MetricFlowEngine:
        env = get_environment(project_id)
        if project_id in self._cache:
            return self._cache[project_id]

        with self._lock:
            if project_id in self._cache:
                return self._cache[project_id]
            engine = _build_engine(env)
            self._cache[project_id] = engine
            return engine

    def rebuild_engine(self, project_id: str, force_recompile: bool = False) -> MetricFlowEngine:
        env = get_environment(project_id)
        with self._lock:
            if project_id in self._cache:
                if not force_recompile:
                    return self._cache[project_id]
                self._cache.pop(project_id, None)
            engine = _build_engine(env)
            self._cache[project_id] = engine
            return engine


_DEFAULT_ENGINE_PROVIDER = EngineProvider()


def get_engine(project_id: str) -> MetricFlowEngine:
    return _DEFAULT_ENGINE_PROVIDER.get_engine(project_id)


def rebuild_engine(project_id: str, force_recompile: bool = False) -> MetricFlowEngine:
    return _DEFAULT_ENGINE_PROVIDER.rebuild_engine(project_id, force_recompile=force_recompile)
