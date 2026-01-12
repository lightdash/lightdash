from __future__ import annotations

import os
import threading
import logging
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from .engine_manager import _DEFAULT_ENGINE_PROVIDER
from .environment_registry import get_environment
from .errors import APIError, ErrorCode
from infra.command_runner import CommandRunner
from infra.git_client import GitClient


logger = logging.getLogger(__name__)


class BuildStatus(str):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


@dataclass
class BuildRecord:
    build_id: str
    project_id: str
    status: str
    git_ref: Optional[str] = None
    commit: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    log_tail: Optional[str] = None

    def to_dict(self):
        return {
            "buildId": self.build_id,
            "projectId": self.project_id,
            "status": self.status,
            "gitRef": self.git_ref,
            "commit": self.commit,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "finishedAt": self.finished_at.isoformat() if self.finished_at else None,
            "errors": self.errors,
            "warnings": self.warnings,
            "logTail": self.log_tail,
        }


class BuildStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._items: Dict[str, BuildRecord] = {}

    def set(self, record: BuildRecord):
        with self._lock:
            self._items[record.build_id] = record
            self._persist(record)

    def update(self, build_id: str, **changes) -> Optional[BuildRecord]:
        with self._lock:
            record = self._items.get(build_id)
            if not record:
                return None
            for key, value in changes.items():
                setattr(record, key, value)
            self._persist(record)
            return record

    def get(self, build_id: str) -> Optional[BuildRecord]:
        with self._lock:
            return self._items.get(build_id)

    def delete(self, build_id: str) -> None:
        with self._lock:
            self._items.pop(build_id, None)
            self._remove(build_id)

    # 持久化钩子，默认内存实现 no-op，子类可覆盖。
    def _persist(self, record: BuildRecord):  # pragma: no cover
        return

    def _remove(self, build_id: str):  # pragma: no cover
        return


_DEFAULT_BUILD_STORE = BuildStore()
_DEFAULT_GIT_CLIENT = GitClient()
_DEFAULT_COMMAND_RUNNER = CommandRunner()
_BUILD_LOCKS: Dict[str, threading.Lock] = {}
_LOCK = threading.Lock()


def _log_tail_from_output(output: bytes, max_lines: int = 200) -> str:
    lines = output.decode(errors="ignore").splitlines()
    return "\n".join(lines[-max_lines:])


def _get_project_lock(project_id: str) -> threading.Lock:
    with _LOCK:
        if project_id not in _BUILD_LOCKS:
            _BUILD_LOCKS[project_id] = threading.Lock()
        return _BUILD_LOCKS[project_id]


def _compile(project_dir: Path, profiles_dir: Path, timeout: int, runner: CommandRunner) -> bytes:
    # 默认使用 dbt deps + dbt build 生成 semantic manifest；可通过环境变量覆盖。
    custom_cmd = (Path(project_dir) / ".metricflow_build_cmd").read_text().strip() if (Path(project_dir) / ".metricflow_build_cmd").exists() else None
    env_cmd = os.getenv("METRICFLOW_BUILD_CMD")
    if env_cmd:
        cmd = env_cmd.split()
    elif custom_cmd:
        cmd = custom_cmd.split()
    else:
        cmd = [
            "dbt",
            "build",
            "--project-dir",
            str(project_dir),
            "--profiles-dir",
            str(profiles_dir),
        ]
    if env_cmd or custom_cmd:
        logger.info("compile command: %s", " ".join(cmd))
        return runner.run(cmd=cmd, cwd=project_dir, timeout=timeout).output
    # 默认流程：先 deps 再 build
    deps_cmd = [
        "dbt",
        "deps",
        "--project-dir",
        str(project_dir),
        "--profiles-dir",
        str(profiles_dir),
    ]
    logger.info("compile command: %s && %s", " ".join(deps_cmd), " ".join(cmd))
    deps_out = runner.run(cmd=deps_cmd, cwd=project_dir, timeout=timeout).output
    build_out = runner.run(cmd=cmd, cwd=project_dir, timeout=timeout).output
    return deps_out + b"\n" + build_out


class BuildManager:
    def __init__(
        self,
        store: BuildStore = _DEFAULT_BUILD_STORE,
        git_client: GitClient = _DEFAULT_GIT_CLIENT,
        command_runner: CommandRunner = _DEFAULT_COMMAND_RUNNER,
        engine_rebuilder=_DEFAULT_ENGINE_PROVIDER.rebuild_engine,
    ):
        self.store = store
        self.git_client = git_client
        self.command_runner = command_runner
        self.engine_rebuilder = engine_rebuilder

    def _run_build(self, project_id: str, build_id: str, git_ref: Optional[str], force_recompile: bool):
        lock = _get_project_lock(project_id)
        if not lock.acquire(blocking=False):
            self.store.update(
                build_id,
                status=BuildStatus.FAILED,
                finished_at=datetime.utcnow(),
                errors=["Another build is running for this project"],
            )
            logger.warning("build %s rejected due to running build for project %s", build_id, project_id)
            return
        ref = git_ref  # may be None, will resolve after lock
        _ = self.store.update(build_id, status=BuildStatus.RUNNING, started_at=datetime.utcnow(), git_ref=ref)
        logger.info("build %s started project=%s gitRef=%s", build_id, project_id, ref)
        log_tail: Optional[str] = None
        try:
            env = get_environment(project_id)
            ref = git_ref or env.default_ref
            self.store.update(build_id, git_ref=ref)
            try:
                self.git_client.ensure_repo(env.project_dir, repo_url=env.repo_url, ref=ref)
                self.git_client.safe_update(env.project_dir, ref)
            except subprocess.CalledProcessError as exc:
                log_tail = _log_tail_from_output(exc.output or b"")
                self.store.update(
                    build_id,
                    status=BuildStatus.FAILED,
                    finished_at=datetime.utcnow(),
                    errors=[f"git pull failed: {exc}"],
                    log_tail=log_tail,
                )
                return
            except APIError as exc:
                self.store.update(
                    build_id,
                    status=BuildStatus.FAILED,
                    finished_at=datetime.utcnow(),
                    errors=[exc.message],
                    log_tail=log_tail,
                )
                return

            try:
                output = _compile(
                    env.project_dir,
                    env.profiles_dir,
                    timeout=int(os.getenv("METRICFLOW_BUILD_TIMEOUT", "600")),
                    runner=self.command_runner,
                )
                log_tail = _log_tail_from_output(output)
            except subprocess.CalledProcessError as exc:
                log_tail = _log_tail_from_output(exc.output or b"")
                self.store.update(
                    build_id,
                    status=BuildStatus.FAILED,
                    finished_at=datetime.utcnow(),
                    errors=[f"compile failed: {exc}"],
                    log_tail=log_tail,
                )
                return
            except Exception as exc:
                self.store.update(
                    build_id,
                    status=BuildStatus.FAILED,
                    finished_at=datetime.utcnow(),
                    errors=[f"compile error: {exc}"],
                    log_tail=log_tail,
                )
                return

            commit = self.git_client.head_commit(env.project_dir)
            self.engine_rebuilder(project_id, force_recompile=force_recompile)
            self.store.update(
                build_id,
                status=BuildStatus.SUCCEEDED,
                finished_at=datetime.utcnow(),
                warnings=[],
                errors=[],
                commit=commit,
                log_tail=log_tail,
            )
            logger.info("build %s succeeded project=%s commit=%s", build_id, project_id, commit)
        except APIError as exc:
            self.store.update(
                build_id,
                status=BuildStatus.FAILED,
                finished_at=datetime.utcnow(),
                errors=[exc.message],
                log_tail=log_tail,
            )
            logger.exception("build %s failed (APIError): %s", build_id, exc)
        except Exception as exc:
            self.store.update(
                build_id,
                status=BuildStatus.FAILED,
                finished_at=datetime.utcnow(),
                errors=[str(exc)],
                log_tail=log_tail,
            )
            logger.exception("build %s failed: %s", build_id, exc)
        finally:
            lock.release()

    def trigger_build(self, project_id: str, git_ref: Optional[str], force_recompile: bool) -> str:
        build_id = str(uuid4())
        record = BuildRecord(
            build_id=build_id,
            project_id=project_id,
            status=BuildStatus.PENDING,
            git_ref=git_ref,
            started_at=None,
            finished_at=None,
            errors=[],
            warnings=[],
        )
        self.store.set(record)
        thread = threading.Thread(
            target=self._run_build,
            args=(project_id, build_id, git_ref, force_recompile),
            daemon=True,
        )
        thread.start()
        logger.info("build %s enqueued for project=%s gitRef=%s", build_id, project_id, git_ref)
        return build_id

    def get_build_status(self, build_id: str) -> BuildRecord:
        record = self.store.get(build_id)
        if not record:
            raise APIError(
                code=ErrorCode.CONFIG_NOT_FOUND,
                message=f"buildId={build_id} 未找到",
                status_code=404,
            )
        return record


_DEFAULT_BUILD_MANAGER = BuildManager()


def trigger_build(project_id: str, git_ref: Optional[str], force_recompile: bool) -> str:
    return _DEFAULT_BUILD_MANAGER.trigger_build(project_id, git_ref, force_recompile)


def get_build_status(build_id: str) -> BuildRecord:
    return _DEFAULT_BUILD_MANAGER.get_build_status(build_id)
