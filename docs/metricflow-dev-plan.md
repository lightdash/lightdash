# MetricFlow 深度集成开发方案（新项目）

## 1. 总体思路
- 项目默认以 MetricFlow 为主路径；dbt Explore 保留为 fallback/调试，但不承担主链路。
- MetricFlow API 采用独立 FastAPI 服务（已有实现），Lightdash 后端通过统一客户端访问；未来可平滑内嵌。
- 编译权归 FastAPI：负责从 Git 拉取/编译语义模型并产出 source_ref；Lightdash 负责语义编辑、Git 提交与 UI。
- 语义真源为 `SemanticObjectGraph`（entities/dimensions/measures/metrics/sourceRef）。前端通过 Explore 适配层复用现有 Explore 组件。

## 2. 服务与代码拓扑
- Lightdash 后端（Node）：新增 MetricFlow 客户端与 Adapter；Expose GraphQL/REST 统一接口给前端；提供权限/审计。
- MetricFlow FastAPI：提供语义模型/指标/查询/校验/SQL/编译触发接口，读取 Git 仓库（Gitea）。
- Git（Gitea）：Lightdash 用凭证推送分支 + PR；FastAPI 监听或被通知合并后拉取/编译。

## 3. 编译与同步链路（单一事实源）
1) Explore 生成 AST（Lightdash 前端）→ 调用 FastAPI `POST /query/validate` 校验。
2) 通过 AST 生成 MetricFlow YAML Patch（Lightdash）→ Git 提交/PR（Gitea）。
3) PR 合并后：Lightdash 通知 FastAPI 或 FastAPI 监听仓库 → FastAPI `git pull` → 编译语义模型，产出 `SemanticObjectGraph` + source_ref。
4) Lightdash 通过 FastAPI `GET /semantic/models`/`GET /semantic/metrics` 拉取最新语义图并刷新 Explore。
5) 查询执行：Lightdash 将 `MetricQuery` 映射为 MetricFlow query → FastAPI `/query` → 返回 rows + SQL。

## 4. API 契约（FastAPI ←→ Lightdash）
- 鉴权：项目级 token（在 Lightdash 配置），每次请求带上；可选用户态透传。
- 最小接口：
  - `GET /semantic/models`: 返回 SemanticObjectGraph 需要的模型/实体/维度/度量/指标 + source_ref。
  - `GET /semantic/metrics`: 指标列表/依赖/可用维度。
  - `POST /query`: 输入 metrics/dimensions/filters/time/orderBy/limit；输出 rows、schema、SQL、warnings。
  - `POST /query/validate`: 校验 AST，返回错误/警告。
  - `POST /compile_sql`（可选）: 仅生成 SQL。
  - `POST /build`（或 `POST /refresh`）: 触发 git pull + 编译，返回 buildId。
  - `GET /build/{id}/status`: 获取编译状态/错误。
- SourceRef: 每个语义对象附带 `{path,startLine,endLine}`，供 UI 跳转。

## 5. Lightdash 后端改动
- MetricFlow 客户端：封装上述接口，支持超时/重试/错误码标准化。
- Adapter/服务层：新增 `MetricFlowProjectAdapter`，负责：
  - 拉取 `SemanticObjectGraph` 并缓存（含失效策略）。
  - 代理查询执行/校验/SQL。
  - 触发 build 并暴露状态查询。
- MetricQuery 映射：保留现有 `MetricQuery` 类型，映射字段：
  - 直传给 MetricFlow：`metrics/dimensions/filters/time/orderBy/limit`.
  - 前端/后端降级或后处理：`tableCalculations/customDimensions/additionalMetrics/pivot/PoP/totals/subtotals`。
- 权限/审计：扩展 AllowedAction 为指标级；MetricFlow 请求前鉴权；记录查询/Promote/发布/审批事件。

## 6. 前端改动
- Explore 适配：继续使用 `ExploreType.SEMANTIC_LAYER`，由 `SemanticObjectGraph` → Explore 字段树（含实体层级、时间粒度展开、跨模型字段）。
- 查询链路：`convertMetricQueryToMetricFlowQuery` 补充 orderBy/limit/time grain 映射；SQL 卡片使用 MetricFlow 返回的 SQL。
- Totals/Subtotals：先实现前端方案 A（多次 MetricFlow query 拼装 groupedSubtotals）；视性能再切后端方案 B。
- 可用性联动：基于 FastAPI 可用维度/指标接口动态收敛字段；不支持的特性做 UI 降级提示。
- Promote 流程：Explore → AST → 校验 → YAML Patch 预览 → Git 提交/PR → 等待 build 状态 → 成功后刷新 Explore。

## 7. Git/PR 工作流
- Lightdash 侧：
  - 生成 MetricFlow YAML Patch（基于 AST → YAML）。
  - 使用 Gitea 凭证推送分支与 PR；提交信息模板包含指标名/变更摘要。
  - PR 合并回调：调用 FastAPI `/build` 并轮询 `/build/{id}/status`；失败在 UI 呈现。
- FastAPI 侧：
  - `build` 拉取最新提交，运行 MetricFlow 编译，生成 source_ref。
  - 编译结果/错误通过状态接口暴露；可写入日志供审计。

## 8. 权限与审计
- 权限：新增资源类型 `metric:*`（view/edit/approve）；Promote/修改前校验；查询执行可选检查指标级权限。
- 审计：记录查询、指标创建/修改/删除、Promote、PR 创建/合并、build 结果；绑定用户、项目、commit/PR 链接。

## 9. 测试计划
- 单元：MetricQuery ↔ MetricFlow query 映射；结果转换；可用维度/指标过滤；YAML Patch 生成。
- 集成：FastAPI 客户端超时/重试；Promote 全链路（校验→PR→build 状态）；权限拦截。
- E2E：MetricFlow Explore 查询与 SQL 展示；Promote 后编译成功刷新；Totals/Subtotals 正确；权限/审批场景。
- 性能：多指标/多维度并发查询与 subtotals 并发数限制；缓存命中率。

## 10. 里程碑与交付
1) 接入 FastAPI 客户端 + MetricFlow Adapter；健康检查通。
2) `SemanticObjectGraph` 类型与 Explore 适配层落地；前端可浏览字段。
3) 查询链路跑通（含 SQL 展示）；UI 降级到位。
4) Totals/Subtotals 前端方案 A；性能验证。
5) Promote → Git/PR → build 状态链路跑通；source_ref UI 跳转。
6) 权限/审计上线；E2E 覆盖关键场景。

## 11. 风险与缓解
- FastAPI 可用性/性能：增加超时/重试/熔断，限流并发；编译队列化。
- 语义与 Explore 映射差异：保留降级路径，UI 明示不支持的特性；逐步补齐。
- 编译等待体验：增加 build 状态轮询与错误提示，允许手动重试/回滚。 

## 12. 详细任务拆解（可直接开发）

### 12.1 后端 Node（Lightdash）
- 配置与客户端
  - 新增配置项：`METRICFLOW_BASE_URL`、`METRICFLOW_TOKEN`、请求超时/重试次数。
  - 实现 MetricFlowRestClient（Node），封装：getSemanticModels、getSemanticMetrics、createQuery、validateQuery、compileSql、triggerBuild、getBuildStatus。
  - 标准化错误码：连接超时、4xx/5xx、语义校验错误，映射为 ApiErrorPayload。
- Adapter/Service
  - 新增 `MetricFlowProjectAdapter`，实现接口：
    - `getSemanticObjectGraph(projectUuid)`：调用 `GET /semantic/models`，缓存，失效策略（TTL + 手动刷新）。
    - `executeMetricQuery(projectUuid, metricQuery)`：`MetricQuery -> MetricFlow query` → `POST /query` → 结果转换。
    - `validateMetricQuery(projectUuid, metricQuery)`：`POST /query/validate`，返回错误/警告。
    - `triggerBuild(projectUuid, sha?)`：`POST /build`，返回 buildId；`getBuildStatus(buildId)`。
  - 在现有控制器层新增路由前缀 `/api/v1/projects/:projectUuid/metricflow/*` 复用上述服务。
  - 权限钩子：执行/Promote 前检查 metric:* 权限，失败返回 403。
- MetricQuery 映射与结果
  - 补充 orderBy/limit/time grain 映射规则；filters 转换 fieldId -> semantic name。
  - 结果转换：MetricFlow rows → `ApiQueryResults`，携带 SQL、warnings。
  - Totals/Subtotals 后端方案 B 预留：`POST /dbtsemanticlayer/calculate-subtotals` 分支调用 MetricFlow。

### 12.2 前端
- Explore 列表与详情
  - `useExplores` / `useExplore` 改为从 `SemanticObjectGraph` 适配生成 Explore，支持跨模型字段合并。
  - ExploreTree：按语义模型为顶层，实体/维度/度量/指标分组；时间维度展开 base + 粒度；hover 编辑入口。
- 字段可用性联动
  - 选择 metrics 后调用 `GET /semantic/metrics?metrics=...` 获取可用维度；选择维度后获取可用指标，动态过滤树。
- 查询链路
  - `convertMetricQueryToMetricFlowQuery` 补充 orderBy/limit/time grain；filters 仅用维度（name）。
  - SQL 卡片展示 MetricFlow 返回的 SQL（不再隐藏）。
  - Totals/Subtotals 前端方案 A：复用现有 `useCalculateSubtotals`，在 MetricFlow 分支多发子查询并组装 groupedSubtotals；limit 并发。
- Promote 流程
  - 流程：AST → `validateQuery` → YAML Patch 预览 → 填写提交信息 → 触发后端 Git API → 返回 PR 链接 → 轮询 build 状态 → 成功后刷新 Explore。
  - 失败态：校验错误、Git 失败、build 失败分别提示；允许重试或撤销。
- YAML Editor 增强
  - Semantic Outline + source_ref 跳转；渲染 FastAPI 校验错误行内标注。

### 12.3 FastAPI（已有服务需要补全的接口）
- 新增/确认接口与负载
  - `GET /semantic/models`: 返回 `models/entities/dimensions/measures/metrics`，含 `sourceRef:{path,startLine,endLine}`。
  - `GET /semantic/metrics`: 可选参数 `metrics`/`dimensions`，返回可用维度/指标。
  - `POST /query`: 入参 `{metrics,dimensions,filters?,time?,orderBy?,limit?}`；出参 `{rows,columns,sql,warnings}`。
  - `POST /query/validate`: 入参同上，返回 `{errors?,warnings?}`。
  - `POST /build`: 入参 `{project,sha?}`，返回 `{buildId}`；`GET /build/{id}/status`: `{status,errors?,warnings?,duration,compiledAt}`。
  - `POST /compile_sql`（可选）。
- Git 集成
  - 支持通过 webhook/回调或轮询触发 `build`；确保能 `git pull` 最新合并代码。
  - 编译完成产出 source_ref 并缓存/暴露。

### 12.4 Git/PR 流程（Lightdash）
- 后端新增 Git API：基于 Gitea 凭证完成 create branch → commit YAML patch → open PR → 返回 PR URL/branch。
- 前端交互：提交表单收集 commit message/PR title；显示 PR 链接；在 PR 合并后调用后端触发 build。

### 12.5 权限与审计
- AllowedAction 增加 `metric:view|edit|approve`；绑定项目角色。
- 审计事件：查询执行、Promote 提交、PR 创建/合并、build 成功/失败；记录 user/project/metric/PR 链接。

### 12.6 测试用例要点
- 单元：查询映射、结果转换、可用维度/指标过滤、YAML Patch 生成、权限拦截。
- 集成：FastAPI 客户端超时/重试；Promote 全链路（校验→PR→build 状态）；Totals/Subtotals 结果正确。
- E2E：语义层 Explore 查询、SQL 展示、Promote 成功后刷新字段、权限阻断。

### 12.7 验收标准
- 能在新项目里仅依赖 MetricFlow 完成 Explore 查询、SQL 查看、Totals/Subtotals。
- 成功 Promote 一个指标：生成 PR → 合并 → build 成功 → Explore 中可见新指标与 source_ref。
- 权限：无 edit/approve 权限的用户无法 Promote；审计日志可查到操作轨迹。
