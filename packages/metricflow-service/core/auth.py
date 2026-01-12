from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Request

from .environment_registry import get_environment
from .errors import APIError, ErrorCode


def extract_bearer_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def require_bearer_token(request: Request) -> str:
    token = extract_bearer_token(request)
    if not token:
        raise APIError(
            code=ErrorCode.UNAUTHORIZED,
            message="缺少 Authorization: Bearer <token>",
            status_code=401,
        )
    return token


def authorize_project(project_id: str, token: str) -> None:
    env = get_environment(project_id)
    if not env.tokens:
        raise APIError(
            code=ErrorCode.CONFIG_INVALID,
            message=f"projectId={project_id} 未配置 token",
            status_code=500,
        )
    for allowed in env.tokens:
        if hmac.compare_digest(str(allowed), token):
            return
    raise APIError(
        code=ErrorCode.FORBIDDEN,
        message="token 无权限访问该环境",
        status_code=403,
    )
