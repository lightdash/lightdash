# MetricFlow Service REST API 契约（建议版）

## 0. 标识与鉴权
- 统一使用 `projectId`（string，对应 Lightdash `projectUuid`）作为项目/环境标识，不再使用 `environmentId`（int）。
- 鉴权：`Authorization: Bearer <token>`，服务端可按 `projectId` 校验/路由到对应环境。
- 所有响应均使用 envelope：`{ ok: boolean, data: any, error: { code, message, details? } | null }`。

## 1. 健康检查
**GET `/health`**  
Response:
```json
{ "ok": true, "data": { "status": "healthy" }, "error": null }
```

## 2. 语义模型与可用性
**GET `/api/semantic-models`**
- Query: `projectId`  
Response:
```json
{
  "ok": true,
  "data": {
    "semanticModels": [
      { "name": "orders", "entities": [...], "dimensions": [...], "measures": [...], "metrics": [...], "sourceRef": { "path": "semantic/orders.yml", "startLine": 10, "endLine": 80 } }
    ]
  },
  "error": null
}
```

**GET `/api/metrics`**
- Query: `projectId`
- Optional: `dimensions=dim_a,dim_b`（用于过滤可用指标）  
Response: `{"ok":true,"data":{"metrics":[{...}]}}`

**GET `/api/dimensions`**
- Query: `projectId`
- Optional: `metrics=metric_a,metric_b`（用于过滤可用维度）  
Response: `{"ok":true,"data":{"dimensions":[{...}]}}`

**POST `/api/metrics-for-dimensions`**
- Body:
```json
{
  "projectId": "proj-123",
  "dimensions": [{ "name": "order_date__day" }]
}
```
Response: `{"ok":true,"data":{"metricsForDimensions":[{...}]}}`

## 3. 查询/校验/SQL
### 公共 Query Payload
```json
{
  "projectId": "proj-123",
  "metrics": [{ "name": "revenue" }],
  "groupBy": [{ "name": "order_date", "grain": "DAY" }, { "name": "country" }],
  "filters": {
    "dimensions": {
      "and": [
        { "rule": { "id": "1", "target": { "fieldId": "country" }, "operator": "EQUALS", "values": ["US"] } }
      ]
    }
  },
  "orderBy": [{ "metric": { "name": "revenue" }, "descending": true }],
  "limit": 500
}
```

### 3.1 创建查询 / 运行
**POST `/api/queries`**
- Body: Query Payload + `async` (bool, default false)
- Response (同步):
```json
{
  "ok": true,
  "data": { "createQuery": { "queryId": "q_abc123" } },
  "error": null
}
```
**GET `/api/queries/{queryId}`**
- Query: `projectId`
- Response:
```json
{
  "ok": true,
  "data": {
    "query": {
      "status": "SUCCEEDED",
      "sql": "select ...",
      "columns": [
        { "name": "metric_time__month", "type": "string" },
        { "name": "department__area_desc", "type": "string" },
        { "name": "ba100", "type": "number" }
      ],
      "rows": [
        ["2024-01-01", "华西本部", 123],
        ["2024-01-01", "温江院区", 45]
      ],
      "warnings": []
    }
  }
}
```

### 3.2 校验（不执行）
**POST `/api/query/validate`**
- Body: Query Payload
- Response:
```json
{
  "ok": true,
  "data": {
    "warnings": [],
    "errors": [
      {
        "code": "INVALID_METRIC",
        "message": "Metric foo not found",
        "details": { "metric": "foo" }
      }
    ]
  },
  "error": null
}
```

### 3.3 仅编译 SQL
**POST `/api/compile-sql`**
- Body: Query Payload
- Response:
```json
{
  "ok": true,
  "data": { "compileSql": { "sql": "select ...", "warnings": [] } },
  "error": null
}
```

### 3.4 仅校验（无执行）
**POST `/api/validate`**
- Body: Query Payload
- Response:
```json
{
  "ok": true,
  "data": { "errors": [], "warnings": [] },
  "error": null
}
```

### 3.5 维度值（Autocomplete）
**POST `/api/dimension-values`**
- Body:
```json
{
  "projectId": "proj-123",
  "dimension": "country",
  "metrics": ["revenue"],
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-31T00:00:00Z"
}
```
- Response: `{"ok":true,"data":{"dimension":"country","values":["US","UK"],"totalCount":2}}`

## 4. 构建/刷新（编译）
**POST `/api/build`**
- Body:
```json
{
  "projectId": "proj-123",
  "gitRef": "main",          // 可选，默认远端主分支
  "forceRecompile": true     // 可选，是否忽略缓存
}
```
- Response: `{"ok":true,"data":{"buildId":"build_20240915_120000Z"},"error":null}`
- 说明：`projectDir`/repo 来源于 environments.yml，服务端使用请求的 `gitRef` 或配置的 `default_ref` 拉取；项目目录需为 git 仓库（或预先完成 clone）。

**GET `/api/build/{buildId}`**
- Query: `projectId`
- Response:
```json
{
  "ok": true,
  "data": {
    "build": {
      "status": "SUCCEEDED",   // PENDING|RUNNING|SUCCEEDED|FAILED
      "gitRef": "main",
      "commit": "abc123",
      "startedAt": "2024-01-01T00:00:00Z",
      "finishedAt": "2024-01-01T00:00:05Z",
      "errors": [],            // 失败时包含错误消息
      "warnings": [],
      "logTail": "dbt build ...\nDone"
    }
  },
  "error": null
}
```

## 5. 错误结构示例
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid token",
    "details": null
  }
}
```

## 6. 命名/兼容说明
- 统一参数名为 `projectId`（string）；历史 `environmentId` 将逐步淘汰，可在服务端做兼容解析。
- 时间粒度 `grain` 取值示例：`DAY|WEEK|MONTH|QUARTER|YEAR`（需与 MetricFlow/Lightdash 映射一致）。
- filters 结构与 Lightdash MetricQuery 的 FilterGroup 对齐（仅维度用于语义层）。
- `rows` 返回为二维数组，对应 `columns` 的顺序；前端可直接按索引渲染表格或透传为行列格式。***
