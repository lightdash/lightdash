# MetricFlow Explore 适配设计说明

## 背景
当前 MetricFlow 已有独立页面与 API 逻辑，但与 Explore（dbt explore）是分离的。
需要把 MetricFlow 的数据结构接入现有 Explore 页面，以便统一入口、统一交互。

## 目标
- 在 Explore 列表中展示 MetricFlow 的 explore（语义层）。
- 能在 Explore 页面执行 MetricFlow 查询并渲染结果与图表。
- Filters 能基于 MetricFlow 维度工作（含 autocomplete）。
- 对不支持的功能做降级处理，避免错误。

## 现有实现概览

### 1) Explore 类型与命名（已完成）
- 新增 `ExploreType.SEMANTIC_LAYER`。
- MetricFlow explore 命名统一使用前缀：`mf__${semanticModelName}`。
- 无所属语义模型的字段统一放入 `mf__unassigned` explore。
- groupLabel 统一为 `Semantic layer`。

相关代码：
- `packages/common/src/types/explore.ts`
- `packages/frontend/src/features/metricFlow/utils/metricFlowExplore.ts`

### 2) Explore 列表与详情加载（已完成）
- `useExplores` 在 health 指示 `hasDbtSemanticLayer` 时，合并 MetricFlow explores。
- `useExplore` 当 `tableName` 以 `mf__` 开头时，改为调用 MetricFlow GraphQL 获取字段并构建 Explore。

相关代码：
- `packages/frontend/src/hooks/useExplores.tsx`
- `packages/frontend/src/hooks/useExplore.tsx`

### 3) Explore 数据结构映射（已完成）
- 使用 `convertMetricFlowFieldsToExplore` 将 MetricFlow fields 映射为 Explore 中的 dimension/metric。
- 时间维度会生成 interval 维度（`__day/__week/...`），并保留 base time dimension（hidden）。

相关代码：
- `packages/frontend/src/features/metricFlow/utils/convertMetricFlowFieldsToExplore.ts`

### 4) Query 执行链路（Explorer）（已完成）
- 新增 `useMetricFlowQueryExecutor`，用于替代 dbt query executor。
- `useExplorerQueryManager` 根据 `explore.type` 分流，语义层走 MetricFlow executor。
- `useExplorerQueryEffects` 禁用 unpivot 逻辑。
- `useExplorerQuery` 禁用下载、取消请求等不支持的入口。

相关代码：
- `packages/frontend/src/features/metricFlow/hooks/useMetricFlowQueryExecutor.ts`
- `packages/frontend/src/hooks/useExplorerQueryManager.ts`
- `packages/frontend/src/hooks/useExplorerQueryEffects.ts`
- `packages/frontend/src/hooks/useExplorerQuery.ts`

### 5) MetricQuery -> MetricFlow Query 转换（已完成）
- metrics/dimensions 映射为 MetricFlow query 的 `metrics` / `dimensions`。
- timeInterval -> grain（DAY/WEEK/MONTH/QUARTER/YEAR）。
- filters 仅保留 dimensions，并将 target.fieldId 映射为 field.name。

相关代码：
- `packages/frontend/src/features/metricFlow/utils/convertMetricQueryToMetricFlowQuery.ts`

### 6) 结果集转换（已完成）
- `convertMetricFlowQueryResultsToResultsData` 将 MetricFlow JSON results 转为 Lightdash `ApiQueryResults` 形态。
- columns/rows 使用 explore fields 进行映射。

相关代码：
- `packages/frontend/src/features/metricFlow/utils/convertMetricFlowQueryResultsToResultsData.ts`

### 7) Filters 适配（已完成）
- 语义层仅使用维度作为过滤字段（排除 base time dimension，要求 timeInterval）。
- Filters 的 fieldId 改用 MetricFlow field.name（而非 `table_field` 形式）。
- Autocomplete 使用 `getMetricFlowDimensionValues`，并基于 metrics 列表作为检索上下文。

相关代码：
- `packages/frontend/src/components/Explorer/FiltersCard/FiltersCard.tsx`

### 8) UI 降级（不支持功能）（部分完成）
- 隐藏/禁用 SQL、Underlying data、Drill down、Custom metrics/dimensions、Writeback、Download/Export 等入口。
- 这些功能依赖 dbt explore 或 SQL 编译，不支持语义层。

相关代码：
- `packages/frontend/src/components/Explorer/index.tsx`
- `packages/frontend/src/components/Explorer/ResultsCard/ResultsCard.tsx`
- `packages/frontend/src/components/Explorer/VisualizationCard/VisualizationCard.tsx`
- `packages/frontend/src/components/Explorer/ExploreTree/TableTree/Virtualization/VirtualSectionHeader.tsx`

## 已知问题与待处理（待办）

### A) Totals/Subtotals 适配（待办）
现状：
- dbt Explore 的 totals/subtotals 依赖后端 `/calculate-total` 和 `/calculate-subtotals`，该 API 仅识别 dbt explore。
- MetricFlow explore 发送到该 API 会触发 `Explore "mf__..." does not exist`。

更详细方案（推荐前端先行，后端可迭代）：

#### 方案 A：前端计算 MetricFlow subtotals
目标：不走 `/calculate-subtotals`，改用 MetricFlow 查询结果拼出 `groupedSubtotals` 结构。

1) 维度分组策略（与后端 SubtotalsCalculator 保持一致）
- 输入：`metricQuery.dimensions`、`columnOrder`、`pivotDimensions`。
- 先按 `columnOrder` 排序维度。
- 移除 `pivotDimensions`（pivot 始终要保留在 query 中，但不参与 subtotal key）。
- 去掉最后一个维度（最细粒度不需要 subtotal）。
- 生成维度组列表：`[d1]`, `[d1,d2]`, `[d1,d2,d3]`...
- subtotalKey 使用 `getSubtotalKey`（`dimA:dimB`）。

2) 生成每组的 MetricFlow query
- 基于当前 `metricQuery` 复制一份：
  - `dimensions = subtotalGroup + pivotDimensions`。
  - `sorts = []`（保持与后端一致）。
  - `metrics` 保持原有 `metricQuery.metrics`。
  - `filters` 保留（仅维度过滤），现有 `convertMetricQueryToMetricFlowQuery` 已处理 fieldId->name 的映射。
- 时间维度处理：
  - 如果维度字段有 `timeIntervalBaseDimensionName` + `timeInterval`，用 base name + grain 生成 MetricFlow groupBy。
  - grain 映射沿用 `TimeFrames -> TimeGranularity`。

3) 执行与并发
- 对每个维度组发起 `createMetricFlowQuery` + `getMetricFlowQueryResults`。
- 可并发执行，建议限定并发数（避免过载），并缓存 queryKey：
  - `metric_flow_subtotals:{projectUuid}:{metrics}:{filters}:{group}:{pivot}`。

4) 转换为 groupedSubtotals 结构
- MetricFlow 结果先用 `convertMetricFlowQueryResultsToResultsData` 得到 `rows`（ResultRow）。
- 需映射为 raw 结构（与后端格式一致）：
  - 对每行取 `row[fieldId].value.raw`。
  - 生成 `Record<string, unknown>`，key 为 **Lightdash fieldId**（如 `mf__xxx_metric_time__day`）。
- 结果输出：
  - `{ subtotalKey: [ { dimFieldId: raw, metricFieldId: raw }, ... ] }`。
- 注意：Pivot 场景需要保留 pivot 维度字段的 raw 值，便于前端匹配 pivot header。

5) 与现有 UI 对接
- `getDataAndColumns` 与 `PivotTable` 依赖 `groupedSubtotals`：
  - 通过 `groupingValues[key].value.raw === subtotal[key]` 匹配。
  - 所以 subtotal 中的 key 必须是 **fieldId**，值必须是 raw。

6) Totals（可顺便实现）
- totals = 维度为空的 MetricFlow query（只保留 metrics）。
- 输出 `Record<metricFieldId, number>`，与现有 `totals` 结构一致。

#### 方案 B：后端新增 MetricFlow subtotals API
目标：前端仍走统一接口，但后端在 semantic layer 分支走 MetricFlow。

1) 新增接口（示例）
- `POST /projects/:projectUuid/dbtsemanticlayer/calculate-subtotals`
- 入参与现有 `CalculateSubtotalsFromQuery` 类似，但 explore 为 `mf__...`。

2) 复用 SubtotalsCalculator
- 保持 `prepareDimensionGroups` 与 `createSubtotalQueryConfig`。
- 执行层改为调用 MetricFlow API（GraphQL），并转换为 raw rows。

3) 输出结构保持一致
- `results` 与现有 `ApiCalculateSubtotalsResponse` 同格式。

优先级建议：
- 先做方案 A（前端不改后端），验证逻辑与性能；
- 稳定后再做方案 B（后端集中计算、减少前端并发与请求次数）。

## ExploreTree 展示与筛选规则（SEMANTIC_LAYER）（待办）

### 展示层级（待办）
- ExploreTree 顶层直接显示 **semantic model**（作为 table header 展示，可展开）。
- 不再使用 `groupLabel=Semantic layer` 作为分组折叠。
- 任一语义模型 explore 中，**展示所有语义模型的字段**（支持跨模型分析）。

### 维度/指标分组与时间维度（待办）
- 语义层的维度与指标仍使用 Dimensions / Metrics 分区。
- 时间维度需要可展开：
  - base time dimension 作为分组名（groupLabel），粒度维度作为子项。
  - 参考 dbt explore 的时间维度分组交互。

### 动态字段筛选（核心规则）（待办）
- 选择了指标后：只展示该指标支持的维度。
  - 使用 `getSemanticLayerDimensions(projectUuid, metrics)` 获取可用维度集合。
- 选择了维度后：只展示与维度组合兼容的指标。
  - 使用 `getSemanticLayerMetrics(projectUuid, dimensions)` 获取可用指标集合。
- 两者应形成联动：
  - MetricQuery 变化 -> 重新请求 MetricFlow API -> 刷新 ExploreTree 字段集合。
  - ExploreTree 只展示「当前可用」维度与指标，但不隐藏其它语义模型本身。

### SQL 展示（待办）
- SEMANTIC_LAYER 同样提供 SQL 生成能力，SQL Card 不需要隐藏。
- SQL 应来自 MetricFlow query results（`query.sql`），无需使用 dbt compile SQL。

## 项目级策略约束（待办）
- Explore 数据源为项目级**永久设置**（`exploreSource`），不可随意切换。
- 若项目内已有任意 Saved Chart（或 Dashboard 引用），**拒绝切换**数据源，避免历史内容失效。

### B) Save Chart（待办）
语义层的保存逻辑尚未适配（ChartSourceType、payload 结构与后端存储逻辑仍基于 dbt explore）。

## 后续计划（建议顺序）
1) 实现 MetricFlow subtotals（前端或后端新增 API）。
2) 实现 totals（比 subtotals 更简单，去掉所有 groupBy 即 totals）。
3) 适配 Save Chart（ChartSourceType 统一为 SEMANTIC_LAYER）。
