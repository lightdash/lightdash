from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional


class ErrorCode(str, Enum):
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    BAD_REQUEST = "BAD_REQUEST"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    CONFIG_NOT_FOUND = "CONFIG_NOT_FOUND"
    CONFIG_INVALID = "CONFIG_INVALID"
    ENVIRONMENT_NOT_FOUND = "ENVIRONMENT_NOT_FOUND"
    ENGINE_INIT_FAILED = "ENGINE_INIT_FAILED"
    MANIFEST_NOT_FOUND = "MANIFEST_NOT_FOUND"
    MANIFEST_INVALID = "MANIFEST_INVALID"
    METRIC_NOT_FOUND = "METRIC_NOT_FOUND"
    DIMENSION_NOT_FOUND = "DIMENSION_NOT_FOUND"
    QUERY_NOT_FOUND = "QUERY_NOT_FOUND"
    QUERY_EXPIRED = "QUERY_EXPIRED"
    QUERY_EXECUTION_FAILED = "QUERY_EXECUTION_FAILED"
    QUERY_COMPILE_FAILED = "QUERY_COMPILE_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


@dataclass(frozen=True)
class APIError(Exception):
    code: ErrorCode
    message: str
    status_code: int = 500
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"code": self.code.value, "message": self.message}
        if self.details:
            payload["details"] = self.details
        return payload


def error_message(error: APIError) -> str:
    return f"{error.code.value}: {error.message}"
