# Semantic Layer API v2 接口与数据结构规范

状态：Draft  
范围：MetricFlow REST v2 + JDBC/Flight SQL v2  
版本前缀：`/api/v2`

## 1. 版本与响应包裹

- REST v2 前缀：`/api/v2/projects/{projectUuid}/metricflow`
- 成功响应：`{ "status": "ok", "results": T }`
- 错误响应：`{ "status": "error", "error": { "name", "statusCode", "message", "data?" } }`
- `sql` 字段在查询类响应中必须保留（便于调试与可视化复用）。

## 2. 公共枚举

```ts
export enum MetricFlowDimensionType {
  CATEGORICAL = 'CATEGORICAL',
  TIME = 'TIME',
}

export enum MetricFlowMetricType {
  SIMPLE = 'SIMPLE',
  RATIO = 'RATIO',
  CUMULATIVE = 'CUMULATIVE',
  DERIVED = 'DERIVED',
  CONVERSION = 'CONVERSION',
}

export enum TimeGranularity {
  NANOSECOND = 'NANOSECOND',
  MICROSECOND = 'MICROSECOND',
  MILLISECOND = 'MILLISECOND',
  SECOND = 'SECOND',
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
  QUARTER = 'QUARTER',
  YEAR = 'YEAR',
}

export enum QueryStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPILED = 'COMPILED',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
}
```

## 3. 公共数据结构（REST 与 JDBC 共用）

```ts
export type SemanticModelRef = {
  name: string;
  label?: string | null;
  description?: string | null;
};

export type MetricDefinitionFilter = {
  dimension: string;
  operator: string;
  values?: Array<string | number | boolean | null>;
};

export type MetricFlowDimension = {
  name: string;
  label?: string | null;
  description?: string | null;
  type: MetricFlowDimensionType;
  queryableGranularities: TimeGranularity[];
  semanticModel?: SemanticModelRef | null;
};

// MetricFlowMetric 与 MetricDefinition 合并：用于“列表 + 详情”统一描述
export type MetricFlowMetric = {
  name: string;
  label?: string | null;
  description?: string | null;
  type?: MetricFlowMetricType | string;
  semanticModels?: SemanticModelRef[] | null;
  dimensions?: Array<{ name: string; label?: string | null }> | null;
  // 详情字段（definition）
  formulaDisplay?: string | null;
  filterRaw?: string | null;
  filterStructured?: MetricDefinitionFilter[] | null;
  filters?: MetricDefinitionFilter[] | null;
  inputs?: {
    inputMetrics?: Array<{
      name: string;
      label?: string | null;
      filterRaw?: string | null;
      filterStructured?: MetricDefinitionFilter[] | null;
    }>;
    inputMeasures?: Array<{
      name: string;
      label?: string | null;
      agg?: string | null;
      expr?: string | null;
      filterRaw?: string | null;
    }>;
  } | null;
};

export type MetricFlowMetricWithDimensions = MetricFlowMetric & {
  dimensions: MetricFlowDimension[];
};

export type MetricFlowFieldsResponse = {
  dimensions: MetricFlowDimension[];
  metricsForDimensions: MetricFlowMetricWithDimensions[];
};

export type MetricLineageNode = {
  id: string;
  type: string;
  label?: string | null;
  name?: string | null;
  description?: string | null;
  metricType?: string | null;
  formulaDisplay?: string | null;
  filterRaw?: string | null;
  filterStructured?: MetricDefinitionFilter[] | null;
  agg?: string | null;
  expr?: string | null;
  identifier?: string | null;
  alias?: string | null;
  semanticModel?: string | null;
  relationType?: string | null;
  resourceType?: string | null;
  schema?: string | null;
  database?: string | null;
};

export type MetricLineageEdge = {
  from: string;
  to: string;
  type?: string | null;
};

export type MetricLineage = {
  metricDefinition?: MetricFlowMetric | null;
  lineage?: {
    nodes: MetricLineageNode[];
    edges: MetricLineageEdge[];
  } | null;
};

export type MetricFlowOrderBy =
  | { metric: { name: string }; descending?: boolean }
  | { groupBy: { name: string; grain?: TimeGranularity | null }; descending?: boolean };

export type MetricFlowQueryRequest = {
  mode: 'execute' | 'compile';
  metrics: Array<{ name: string }>;
  groupBy?: Array<{ name: string; grain?: TimeGranularity | null }>;
  filters?: Filters; // 使用 Lightdash Filters 结构
  orderBy?: MetricFlowOrderBy[];
  limit?: number;
};

export type MetricFlowJsonResults = {
  schema: {
    fields: Array<{ name: string; type: string }>;
    primaryKey: string[];
    pandas_version: string;
  };
  data: Array<{ index: number; [key: string]: string | number | boolean | null }>;
};

export type MetricFlowQueryResult = {
  status: QueryStatus;
  sql: string | null;
  jsonResult: MetricFlowJsonResults | null;
  error: string | null;
};
```

## 4. REST v2 接口

### POST `/fields`
字段目录聚合接口（用于 Explore 字段树），**不是**模型/实体列表。

请求体：
```json
{
  "metrics": ["total_revenue"],
  "dimensions": [{ "name": "order_date", "grain": "MONTH" }],
  "include": ["dimensions", "metricsForDimensions"]
}
```

语义：
- `metrics` 仅用于计算 `dimensions`（可用于哪些维度切分）
- `dimensions` 仅用于计算 `metricsForDimensions`（这些维度下可选哪些指标）
- 两个结果段**独立计算**，不互相约束
- `include` 可选，默认两者都返回

响应：
```json
{
  "status": "ok",
  "results": {
    "dimensions": [],
    "metricsForDimensions": []
  }
}
```

### POST `/dimension-values`
维度值下拉/筛选查询。

请求体：
```json
{ "dimension": "order_status", "metrics": ["total_orders"], "search": "ret", "limit": 50 }
```

响应：`FieldValueSearchResult<string>`

### GET `/metrics/{metricName}/definition`
返回单个指标的完整定义（使用 `MetricFlowMetric` 类型，包含 definition 字段）。

### GET `/metrics/{metricName}/lineage`
返回血缘图（`MetricLineage`），无血缘时可返回 `null`。

### POST `/queries`
执行或编译 SQL，使用 `mode` 控制。

请求体：
```json
{
  "mode": "execute",
  "metrics": [{ "name": "total_revenue" }],
  "groupBy": [{ "name": "order_date", "grain": "MONTH" }],
  "filters": {},
  "orderBy": [{ "metric": { "name": "total_revenue" }, "descending": true }],
  "limit": 500
}
```

响应：
- `mode=execute`：`{ "status": "ok", "results": { "queryId": "..." } }`
- `mode=compile`：`{ "status": "ok", "results": { "sql": "...", "error": null } }`

### GET `/queries/{queryId}`
返回查询状态与结果：
```json
{
  "status": "ok",
  "results": {
    "query": {
      "status": "SUCCESSFUL",
      "sql": "SELECT ...",
      "jsonResult": { "schema": { "fields": [] }, "data": [] },
      "error": null
    }
  }
}
```

### GET `/semantic-models`（可选）
返回语义模型与实体关系，用于图谱展示或 JDBC catalog 构建。

## 5. JDBC/Flight SQL v2 映射

### 元数据映射
- Catalog：固定为 `lightdash`
- Schema：`projectUuid`（或项目 slug，需在配置中固定）
- Table：语义模型名或“指标视图名”
- Column：维度与指标字段，字段名与 REST 保持一致

### SQL → MetricFlowQueryRequest
- SELECT 中的指标列映射为 `metrics`
- SELECT/ GROUP BY 中的维度列映射为 `groupBy`
- WHERE 映射为 `filters`
- ORDER BY → `orderBy`
- LIMIT → `limit`

### 结果映射
Flight 结果集直接使用 `MetricFlowJsonResults` 的 `schema + data` 转为 Arrow RecordBatch 输出，`sql` 仍可在日志或扩展元信息中保留。
