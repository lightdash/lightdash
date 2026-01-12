import json
import os
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional

LOG_PATH = os.getenv("METRICFLOW_PERF_LOG_PATH", "/tmp/metricflow-perf.log")


def _write_entry(entry: Dict[str, Any]) -> None:
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        # Avoid crashing request on logging errors
        pass


@dataclass
class PerfSpan:
    label: str
    start: float
    context: Dict[str, Any]

    def finish(self, extra: Optional[Dict[str, Any]] = None) -> None:
        entry = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "label": self.label,
            "duration_ms": round((time.perf_counter() - self.start) * 1000),
            **self.context,
        }
        if extra:
            entry.update(extra)
        _write_entry(entry)


def log_perf(label: str, request=None, context: Optional[Dict[str, Any]] = None) -> PerfSpan:
    ctx: Dict[str, Any] = context.copy() if context else {}
    if request is not None:
        try:
            ctx.update(
                {
                    "method": request.method,
                    "path": str(request.url.path),
                    "query": str(request.url.query),
                    "client": request.client.host if request.client else None,
                    "explore_perf_id": request.headers.get("x-explore-perf-id"),
                }
            )
        except Exception:
            pass
    return PerfSpan(label=label, start=time.perf_counter(), context=ctx)
