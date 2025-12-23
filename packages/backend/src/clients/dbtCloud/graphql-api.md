# dbt Semantic Layer GraphQL API (Lightdash Compatibility, Full Spec)

This document defines the full GraphQL contract required by Lightdash's
MetricFlow/Semantic Layer integration. The client implementation lives at:
`packages/backend/src/clients/dbtCloud/DbtCloudGraphqlClient.ts`.

The goal of this contract is functional compatibility with Lightdash, not
perfect parity with any external dbt API. If you implement these operations
and types, Lightdash will work without additional changes.

---

## 1) Endpoint and Auth

### Endpoint
- Method: `POST`
- Path: `/api/graphql`

### Headers
- `Authorization: Bearer <token>`
- `X-dbt-partner-source: lightdash` (optional)

### Request Body
All requests are standard GraphQL JSON. The server must accept `environmentId`
as a GraphQL variable of type `BigInt!` for every operation.

```json
{
  "query": "...",
  "variables": {
    "environmentId": 123
  }
}
```

---

## 2) Operations (Queries & Mutations)

### 2.1 GetMetrics
Returns all metrics, including their dimensions.

```graphql
query GetMetrics($environmentId: BigInt!) {
  metrics(environmentId: $environmentId) {
    name
    description
    label
    type
    queryableGranularities
    dimensions {
      name
      description
      label
      type
      queryableGranularities
    }
  }
}
```

### 2.2 GetDimensions (filtered by metrics)
Returns dimensions for the provided metric list. When the `metrics` list is
empty, Lightdash expects **all dimensions**.

```graphql
query GetDimensions($environmentId: BigInt!) {
  dimensions(environmentId: $environmentId, metrics: [{ name: "metric_a" }]) {
    name
    description
    label
    type
    queryableGranularities
  }
}
```

### 2.3 GetMetricsForDimensions (filtered by dimensions)
Returns metrics valid for the provided dimensions. When the `dimensions` list
is empty, Lightdash expects **all metrics**.

```graphql
query GetMetricsForDimensions($environmentId: BigInt!) {
  metricsForDimensions(
    environmentId: $environmentId
    dimensions: [{ name: "dim_a", grain: DAY }]
  ) {
    name
    description
    label
    type
    queryableGranularities
    dimensions {
      name
      description
      label
      type
      queryableGranularities
    }
  }
}
```

### 2.4 CreateQuery
Creates a query and returns a `queryId`.

```graphql
mutation CreateQuery($environmentId: BigInt!) {
  createQuery(
    environmentId: $environmentId
    metrics: [{ name: "metric_a" }]
    groupBy: [{ name: "dim_a", grain: DAY }]
    limit: 500
    where: [{ sql: "dim_a = 'foo'" }]
    orderBy: [{ metric: { name: "metric_a" }, descending: true }]
  ) {
    queryId
  }
}
```

### 2.5 GetQueryResults
Fetches results for a `queryId`. `pageNum` is 1-based.

```graphql
query GetQueryResults($environmentId: BigInt!) {
  query(environmentId: $environmentId, queryId: "abc123", pageNum: 1) {
    status
    sql
    jsonResult
    totalPages
    error
  }
}
```

### 2.6 CompileSql
Compiles SQL for a query without executing it.

```graphql
mutation CompileSql($environmentId: BigInt!) {
  compileSql(
    environmentId: $environmentId
    metrics: [{ name: "metric_a" }]
    groupBy: [{ name: "dim_a", grain: DAY }]
    limit: 500
    where: [{ sql: "dim_a = 'foo'" }]
    orderBy: [{ groupBy: { name: "dim_a" }, descending: false }]
  ) {
    sql
  }
}
```

### 2.7 Responses (GraphQL JSON envelope)
All responses must follow the standard GraphQL JSON envelope:

```json
{
  "data": { "...": "..." },
  "errors": []
}
```

Notes:
- Use `errors` only for request/auth/schema failures. Query execution failures
  must be represented inside `QueryResult` with `status: FAILED` and `error`.
- If a list is empty, return `[]` (not `null`).

#### 2.7.1 GetMetrics response
```json
{
  "data": {
    "metrics": [
      {
        "name": "metric_a",
        "description": "Metric A",
        "label": "Metric A",
        "type": "SIMPLE",
        "queryableGranularities": ["DAY", "MONTH"],
        "dimensions": [
          {
            "name": "dim_a",
            "description": "Dim A",
            "label": "Dim A",
            "type": "CATEGORICAL",
            "queryableGranularities": []
          }
        ]
      }
    ]
  }
}
```

#### 2.7.2 GetDimensions response
```json
{
  "data": {
    "dimensions": [
      {
        "name": "dim_a",
        "description": "Dim A",
        "label": "Dim A",
        "type": "CATEGORICAL",
        "queryableGranularities": []
      }
    ]
  }
}
```

#### 2.7.3 GetMetricsForDimensions response
```json
{
  "data": {
    "metricsForDimensions": [
      {
        "name": "metric_a",
        "description": "Metric A",
        "label": "Metric A",
        "type": "SIMPLE",
        "queryableGranularities": ["DAY"],
        "dimensions": [
          {
            "name": "dim_a",
            "description": "Dim A",
            "label": "Dim A",
            "type": "CATEGORICAL",
            "queryableGranularities": []
          }
        ]
      }
    ]
  }
}
```

#### 2.7.4 CreateQuery response
```json
{
  "data": {
    "createQuery": {
      "queryId": "abc123"
    }
  }
}
```

#### 2.7.5 GetQueryResults response
```json
{
  "data": {
    "query": {
      "status": "SUCCESSFUL",
      "sql": "select ...",
      "jsonResult": "eyJzY2hlbWEiOns...",
      "totalPages": 1,
      "error": null
    }
  }
}
```

#### 2.7.6 CompileSql response
```json
{
  "data": {
    "compileSql": {
      "sql": "select ..."
    }
  }
}
```

---

## 3) Schema (Full)

```graphql
scalar BigInt

enum DbtTimeGranularity {
  NANOSECOND
  MICROSECOND
  MILLISECOND
  SECOND
  MINUTE
  HOUR
  DAY
  WEEK
  MONTH
  QUARTER
  YEAR
}

enum DbtDimensionType {
  CATEGORICAL
  TIME
}

enum DbtMetricType {
  SIMPLE
  RATIO
  CUMULATIVE
  DERIVED
  CONVERSION
}

enum DbtQueryStatus {
  PENDING
  RUNNING
  COMPILED
  SUCCESSFUL
  FAILED
}

input MetricInput {
  name: String!
}

input GroupByInput {
  name: String!
  grain: DbtTimeGranularity
}

input WhereInput {
  sql: String!
}

input OrderByInput {
  descending: Boolean!
  metric: MetricInput
  groupBy: GroupByInput
}

type Dimension {
  name: String!
  description: String
  label: String
  type: DbtDimensionType!
  queryableGranularities: [DbtTimeGranularity!]!
}

type Metric {
  name: String!
  description: String
  label: String
  type: DbtMetricType!
  queryableGranularities: [DbtTimeGranularity!]!
  dimensions: [Dimension!]!
}

type CreateQueryPayload {
  queryId: String!
}

type CompileSqlPayload {
  sql: String!
}

type QueryResult {
  status: DbtQueryStatus!
  sql: String
  jsonResult: String
  totalPages: Int
  error: String
}

type Query {
  metrics(environmentId: BigInt!): [Metric!]!
  dimensions(environmentId: BigInt!, metrics: [MetricInput!]!): [Dimension!]!
  metricsForDimensions(
    environmentId: BigInt!
    dimensions: [GroupByInput!]!
  ): [Metric!]!
  query(environmentId: BigInt!, queryId: String!, pageNum: Int): QueryResult!
}

type Mutation {
  createQuery(
    environmentId: BigInt!
    metrics: [MetricInput!]!
    groupBy: [GroupByInput!]!
    limit: Int
    where: [WhereInput!]!
    orderBy: [OrderByInput!]!
  ): CreateQueryPayload!
  compileSql(
    environmentId: BigInt!
    metrics: [MetricInput!]!
    groupBy: [GroupByInput!]!
    limit: Int
    where: [WhereInput!]!
    orderBy: [OrderByInput!]!
  ): CompileSqlPayload!
}
```

Notes:
- `OrderByInput` should set **either** `metric` or `groupBy` (not both).
- `metrics`, `groupBy`, `where`, and `orderBy` may be empty arrays.

---

## 4) Data Shapes and Examples

### 4.1 jsonResult (base64-encoded)
`jsonResult` must be a base64-encoded JSON string. When decoded, it should
conform to the following shape:

```json
{
  "schema": {
    "fields": [
      { "name": "field_a", "type": "string" }
    ],
    "primaryKey": ["id"],
    "pandas_version": "1.5.0"
  },
  "data": [
    { "index": 0, "field_a": "foo", "metric_x": 123 }
  ]
}
```

### 4.2 QueryResult status behavior
- `PENDING`, `RUNNING`, `COMPILED`: query is not ready; return
  `jsonResult: null`.
- `SUCCESSFUL`: query ready; return `jsonResult` (base64).
- `FAILED`: query failed; return `error` and `jsonResult: null`.

### 4.3 Pagination
- `pageNum` is 1-based.
- If you do not support pagination, ignore `pageNum` and always return
  `totalPages: 1`.
- If you support pagination, return `totalPages` and the `jsonResult`
  for the requested page only.

---

## 5) Filter SQL (WhereInput.sql)

Lightdash sends `where: [{ sql: "..." }]` with SQL snippets generated
from semantic-layer filters. The SQL uses dbt-style macros and should be
interpreted by your backend.

### 5.1 String filters
```
{{ Dimension('<fieldRef>') }} = 'value'
{{ Dimension('<fieldRef>') }} != 'value'
{{ Dimension('<fieldRef>') }} IN ('a', 'b')
{{ Dimension('<fieldRef>') }} NOT IN ('a', 'b')
```

### 5.2 Exact time filters
```
{{ TimeDimension('<fieldRef>', 'day') }} = 'YYYY-MM-DD'
{{ TimeDimension('<fieldRef>', 'day') }} != 'YYYY-MM-DD'
```

### 5.3 Relative time filters
```
{{ TimeDimension('<fieldRef>', 'day') }} = 'YYYY-MM-DD'           # TODAY, YESTERDAY
{{ TimeDimension('<fieldRef>', 'day') }} >= 'YYYY-MM-DD'
AND {{ TimeDimension('<fieldRef>', 'day') }} <= 'YYYY-MM-DD'      # LAST_7_DAYS, LAST_30_DAYS
```

### 5.4 Combined filters
Lightdash may embed `AND`/`OR` expressions inside a single `sql` string.
The server should treat each `WhereInput.sql` as an independent clause and
combine them with `AND` unless your execution engine supports otherwise.

---

## 6) Behavioral Constraints

- `environmentId` is required for all operations even if you do not use it.
- `metricsForDimensions` and `dimensions` must handle **empty input lists** by
  returning all metrics/dimensions.
- Field names in `jsonResult.data` may be upper-cased by the engine.
  Lightdash lower-cases keys when processing results.
- Time dimension result columns can include granularity suffixes; Lightdash
  maps time-dimension columns to the base time field name when possible.
- `limit` may be omitted. If you enforce a maximum, cap the value server-side.

---

## 7) Error Handling

- GraphQL transport errors should be reserved for invalid requests/auth.
- Query execution failures must be represented as
  `status: FAILED` plus a human-readable `error` string.
