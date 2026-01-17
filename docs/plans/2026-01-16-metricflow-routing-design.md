# MetricFlow 集成与相关能力设计综述

## 背景与目标
本设计文档总结当前 MetricFlow 集成实现（前后端）与已接入的 Gitea 相关能力，并梳理待优化点。目标是：
- 复用 Lightdash 现有 Explore/MetricQuery/SavedChart/Dashboard 体系，避免引入独立语义层模型。
- 在不侵入核心编译器（`MetricQueryBuilder`）的前提下，引入 MetricFlow 执行链路。
- 明确 Explore 改造、Filters 自动填充、Subtotals/Total 的语义层适配现状与优化方向。
- 梳理 Gitea 集成（dbt 项目 Git 集成）在系统中的现状与潜在协同点。

## 现状实现总结

### 1) Explore 改造（语义层 Explore + MetricFlow Explore）
**实现路径**：
- 引入 `ExploreType.SEMANTIC_LAYER`（`packages/common/src/types/explore.ts`）。
- MetricFlow explore 命名采用前缀 `mf__`；无语义模型字段聚合到 `mf__unassigned`。
- 前端 `useExplores` 在检测到语义层能力时合并 MetricFlow explores。
- `useExplore` 在 `tableName` 以 `mf__` 开头时，通过 MetricFlow API 拉取字段并构建 Explore。
- `convertMetricFlowFieldsToExplore` 将 MetricFlow fields 映射到 Explore 的 dimensions/metrics，并生成时间粒度维度（interval）。

**参考代码**：
- `packages/frontend/src/hooks/useExplores.tsx`
- `packages/frontend/src/hooks/useExplore.tsx`
- `packages/frontend/src/features/metricFlow/utils/metricFlowExplore.ts`
- `packages/frontend/src/features/metricFlow/utils/convertMetricFlowFieldsToExplore.ts`

**设计意图**：
用 Explore 作为统一入口与 UI 模型，避免走独立语义层模型，从而最大化复用 SavedChart/Dashboard 权限与生命周期。

---

### 2) Filters 自动填充（Autocomplete）
**实现路径**：
- 语义层过滤器仅基于维度（含时间粒度维度），排除 base time dimension。
- Filters 结构与组合逻辑可复用，但标识符与取值来源不同：`fieldId` 已映射为 MetricFlow field `name`（非 Lightdash `table_field`），Autocomplete 改走 MetricFlow 维度取值接口。
- Autocomplete 通过 `getMetricFlowDimensionValues` 请求维度值，并携带当前 metrics 作为上下文。

**参考代码**：
- `packages/frontend/src/components/Explorer/FiltersCard/FiltersCard.tsx`
- `packages/frontend/src/features/metricFlow/utils/convertMetricQueryToMetricFlowQuery.ts`

**当前限制**：
- Filters 仅支持维度；不支持 metric filters/table calculations filters。
- 时间维度输入需规范化为 MetricFlow 期望格式（年/月/季度映射）。

**优化讨论**：
- 将 filter 映射逻辑迁入 common，以支持 Excel addin/其他客户端复用。
- 进一步明确 MetricFlow 支持的 operator 与前端过滤器类型映射。

---

### 3) Subtotals/Total（语义层适配）
**实现路径（前端）**：
- 现有 `calculate-subtotals`/`calculate-total` API 仅适用于 dbt Explore。
- 对 MetricFlow explore，前端改为多次请求 MetricFlow：
  - Subtotals：按维度分组生成多组 `MetricQuery`，转换为 MetricFlow query 执行。
  - Total：只保留 metrics，清空 dimensions/sorts，执行一次 MetricFlow query。
- 将 MetricFlow 结果映射回 Lightdash fieldId 结构，保持前端渲染逻辑不变。

**参考代码**：
- `packages/frontend/src/hooks/useCalculateSubtotals.ts`（`calculateMetricFlowSubtotals`）
- `packages/frontend/src/hooks/useCalculateTotal.ts`（`calculateMetricFlowTotal`）

**优化讨论**：
- 将 subtotals/total 的 MetricFlow 计算移至后端（统一 API），降低前端并发压力与重复逻辑。
- 引入并发控制与结果缓存（按 queryKey）。

---

### 4) MetricFlow 查询执行与结果转换
**实现路径（前端）**：
- `convertMetricQueryToMetricFlowQuery` 负责将 MetricQuery 映射为 MetricFlow query（metrics/dimensions/orderBy/filters）。
- `pollMetricFlowQueryResults` 等待结果并转换为 Lightdash `ResultsData` 结构。

**参考代码**：
- `packages/frontend/src/features/metricFlow/utils/convertMetricQueryToMetricFlowQuery.ts`
- `packages/frontend/src/features/metricFlow/utils/convertMetricFlowQueryResultsToResultsData.ts`

**优化讨论**：
- 迁移转换逻辑与 MetricFlow 类型到 common，后端执行器和 Excel addin 复用。
- 服务层引入 MetricFlow 执行器并在 `ProjectService` 路由分流，实现后端统一执行。

---

### 5) Gitea 集成（dbt 项目 Git 集成）
**实现路径**：
- Gitea 作为 dbt 项目 Git 连接类型（`DbtProjectType.GITEA`）。
- 前端配置入口：`ProjectConnection/DbtForms/GiteaForm`。
- 后端 Git 集成服务统一处理 GitHub/GitLab/Gitea：`GitIntegrationService` + `Gitea` client。
- dbt 项目拉取：`DbtGiteaProjectAdapter` 通过 token 拼接远程仓库地址。

**参考代码**：
- `packages/backend/src/clients/gitea/Gitea.ts`
- `packages/backend/src/services/GitIntegrationService/GitIntegrationService.ts`
- `packages/backend/src/projectAdapters/dbtGiteaProjectAdapter.ts`
- `packages/frontend/src/components/ProjectConnection/DbtForms/GiteaForm.tsx`

**与 MetricFlow 的关系**：
- 当前 Gitea 集成主要用于 dbt 项目拉取与写回，与 MetricFlow/semantic layer 直接关联较少。
- 未来若 MetricFlow build 需要读取 dbt repo，同样可复用 Gitea 连接配置。

---

## 与独立语义层模型的对比（历史经验）
过去 Cube/dbt Semantic Layer 采用独立模型与权限：
- 独立 `SemanticLayerQuery` 与 API（不复用 MetricQuery）。
- 独立 chart 表与 dashboard tile 类型（非 SavedChart）。
- 独立 `SemanticViewer` 权限域。

这套方案导致权限/保存/调度/导出/缓存等需要单独维护，侵入面更大。当前 MetricFlow Explore 方案通过复用 Explore + MetricQuery 规避了该问题。

---

## 已知问题与优化方向
- **表计算**：依赖结果集后处理，需确认 MetricFlow 输出字段与 ItemsMap 映射的一致性；对不支持的操作应显式降级。
- **Subtotals/Total**：现为前端多次调用，建议后端统一执行与缓存。
- **过滤器支持**：MetricFlow filters 仅维度，未来可评估支持 metric filters。
- **服务层路由**：计划在 `ProjectService` 统一入口以 `Explore.type` 分流执行器，避免 controller/builder 侵入。

---

## 推荐的后续落地顺序
1) 将 MetricFlow query 转换与类型迁入 common，前后端复用。
2) 后端新增 MetricFlow 执行器与 `ProjectService` 分流。
3) Subtotals/Total 后移到后端，统一缓存策略。
4) 梳理表计算可用性并补充降级策略。
