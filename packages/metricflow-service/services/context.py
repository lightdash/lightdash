from dataclasses import dataclass
from typing import Any, Callable, Optional


@dataclass
class MetricflowServiceContext:
    """
    统一管理 metricflow-service 的依赖，便于后续做依赖注入与测试替换。

    当前字段使用 Any/Callable，占位后续正式类型或协议：
    - engine_provider: 提供 MetricFlow Engine（get/rebuild）
    - query_store/build_store: 存储查询/构建状态
    - git_client: 安全 git 操作封装
    - command_runner: 执行 dbt 等命令，支持超时/日志
    - perf_logger: 性能埋点记录器
    - sql_normalizer: SQL 适配器（如 Postgres 三段式降级）
    """

    engine_provider: Any
    query_store: Any
    build_store: Any
    git_client: Any
    command_runner: Any
    perf_logger: Any
    sql_normalizer: Callable[[Optional[str], Any], Optional[str]]
