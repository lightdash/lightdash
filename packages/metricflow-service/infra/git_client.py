from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from core.errors import APIError, ErrorCode


class GitClient:
    """封装 git 操作，便于后续替换/测试。"""

    def ensure_repo(self, project_dir: Path, repo_url: Optional[str] = None, ref: Optional[str] = None):
        if (project_dir / ".git").exists():
            return
        if not repo_url:
            raise APIError(
                code=ErrorCode.CONFIG_INVALID,
                message=f"project_dir={project_dir} 不是 git 仓库，且未提供 repo",
                status_code=500,
            )
        project_dir.mkdir(parents=True, exist_ok=True)
        clone_ref = ["--branch", ref] if ref else []
        subprocess.check_call(["git", "clone", *clone_ref, repo_url, str(project_dir)])

    def safe_update(self, project_dir: Path, git_ref: Optional[str]):
        if not (project_dir / ".git").exists():
            raise APIError(
                code=ErrorCode.CONFIG_INVALID,
                message=f"project_dir={project_dir} 不是 git 仓库",
                status_code=500,
            )
        if git_ref:
            subprocess.check_call(["git", "fetch", "--all", "--prune"], cwd=project_dir)
            subprocess.check_call(["git", "checkout", git_ref], cwd=project_dir)
            subprocess.check_call(["git", "reset", "--hard", f"origin/{git_ref}"], cwd=project_dir)
            subprocess.check_call(["git", "clean", "-fd"], cwd=project_dir)
        else:
            subprocess.check_call(["git", "pull"], cwd=project_dir)

    def head_commit(self, project_dir: Path) -> Optional[str]:
        try:
            return (
                subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=project_dir)
                .decode()
                .strip()
            )
        except Exception:
            return None
