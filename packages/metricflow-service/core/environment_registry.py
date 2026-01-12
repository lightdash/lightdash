from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import threading
from typing import Dict, Optional

import yaml

from .errors import APIError, ErrorCode


@dataclass(frozen=True)
class EnvironmentConfig:
    project_id: str
    name: Optional[str]
    project_dir: Path  # 代码目录（git 工作区）
    profiles_dir: Path  # dbt profiles 目录
    semantic_manifest_path: Path  # 编译产物路径，默认 <project_dir>/target/semantic_manifest.json
    repo_url: Optional[str]  # 可选，便于首次 clone
    default_ref: Optional[str]  # 可选，默认 git 分支/提交
    tokens: list[str]  # 允许访问的 token 列表


_ENV_CACHE: Optional[Dict[str, EnvironmentConfig]] = None
_ENV_LOCK = threading.Lock()


def _default_config_path() -> Path:
    override = os.getenv("ENVIRONMENTS_CONFIG")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "environments.yml"


def _resolve_path(base_dir: Path, raw_path: Optional[str]) -> Optional[Path]:
    if not raw_path:
        return None
    candidate = Path(raw_path)
    if candidate.is_absolute():
        return candidate
    return (base_dir / candidate).resolve()


def _resolve_base_dir(config_dir: Path) -> Path:
    override = os.getenv("ENVIRONMENTS_BASE_DIR")
    if not override:
        return config_dir
    candidate = Path(override)
    if candidate.is_absolute():
        return candidate
    return (config_dir / candidate).resolve()


def _default_manifest_path(project_dir: Path) -> Path:
    return (project_dir / "target" / "semantic_manifest.json").resolve()


def _load_config_file(path: Path) -> Dict[str, EnvironmentConfig]:
    if not path.exists():
        raise APIError(
            code=ErrorCode.CONFIG_NOT_FOUND,
            message=f"找不到环境配置文件: {path}",
            status_code=500,
        )
    try:
        raw = yaml.safe_load(path.read_text()) or {}
    except Exception as exc:
        raise APIError(
            code=ErrorCode.CONFIG_INVALID,
            message="环境配置文件解析失败",
            status_code=500,
            details={"error": str(exc)},
        ) from exc

    env_list = raw.get("environments", [])
    if not isinstance(env_list, list):
        raise APIError(
            code=ErrorCode.CONFIG_INVALID,
            message="environments 字段必须是列表",
            status_code=500,
        )

    base_dir = _resolve_base_dir(path.parent)
    envs: Dict[str, EnvironmentConfig] = {}
    for item in env_list:
        if not isinstance(item, dict):
            continue
        project_id = str(item.get("project_id") or item.get("projectId") or item.get("id") or "").strip()
        if not project_id:
            continue
        project_dir = _resolve_path(base_dir, item.get("project_dir"))
        profiles_dir = _resolve_path(base_dir, item.get("profiles_dir")) or project_dir
        if not project_dir:
            continue
        manifest_path = _resolve_path(base_dir, item.get("semantic_manifest_path")) or _default_manifest_path(project_dir)
        repo_url = item.get("repo") or item.get("repo_url") or item.get("git")
        default_ref = item.get("default_ref") or item.get("branch") or item.get("defaultRef")
        tokens = item.get("tokens") or []
        if isinstance(tokens, str):
            tokens = [tokens]
        if not isinstance(tokens, list):
            tokens = []
        envs[project_id] = EnvironmentConfig(
            project_id=project_id,
            name=item.get("name"),
            project_dir=project_dir,
            profiles_dir=profiles_dir,
            semantic_manifest_path=manifest_path,
            repo_url=str(repo_url) if repo_url else None,
            default_ref=str(default_ref) if default_ref else None,
            tokens=[str(token) for token in tokens],
        )
    return envs


def get_environment(project_id: str | int) -> EnvironmentConfig:
    global _ENV_CACHE
    if _ENV_CACHE is None:
        with _ENV_LOCK:
            if _ENV_CACHE is None:
                _ENV_CACHE = _load_config_file(_default_config_path())

    key = str(project_id)
    if key not in _ENV_CACHE:
        raise APIError(
            code=ErrorCode.ENVIRONMENT_NOT_FOUND,
            message=f"projectId={project_id} 未找到配置",
            status_code=404,
        )
    env = _ENV_CACHE[key]
    # 基础路径校验
    if not env.project_dir:
        raise APIError(
            code=ErrorCode.CONFIG_INVALID,
            message=f"projectId={project_id} 未配置 project_dir",
            status_code=500,
        )
    return env
