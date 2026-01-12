# Explore 设计稿（草案）

## 背景
Explore 是用户选择字段、构建查询与分析图表的核心入口。本文补齐 Explore 入口与 ExploreTree 的信息架构与交互规则，便于后续实现与对齐。

## 目标
- 入口清晰：用户能快速找到可探索的数据源与创建分析。
- 结构清晰：ExploreTree 的分区、分组与字段命名一目了然。
- 行为一致：搜索、展开、选中、空态等交互保持一致的规则。
- 语义层项目有明确降噪策略，避免重复入口。

## 非目标
- 不定义具体视觉样式（颜色、尺寸、icon 细节）。
- 不覆盖 SQL、结果表、可视化卡片的完整交互规范。

## 入口与菜单路径
- 主导航：`Explore` → `Explore 列表` → `Explore 详情`。
- 新建入口：
  - 默认项目可展示 “New from table / New from semantic layer” 等入口（按项目能力显示）。
  - 若项目探索源为 MetricFlow（语义层），则不显示 “New from semantic layer / New from table” 两个入口，仅保留单一 Explore 入口，避免重复路径。

## Explore 列表页面

### 信息架构
- 顶部：搜索（按 label / name / groupLabel），可选 tag 过滤。
- 列表项展示：
  - Explore label（主标题）+ name（次级信息）。
  - groupLabel（若有）仅作为辅助识别，不用于分组。
  - 类型标识（dbt / semantic layer）。
  - 错误态标识（若 explore 编译失败）。

### 交互
- 搜索：支持模糊匹配 label 与 groupLabel。
- 点击列表项进入 Explore 详情页。
- 空状态：
  - 无 explores：提示配置数据源与编译。
  - 搜索无结果：提示清空搜索或调整关键词。

## Explore 页面结构（概要）
- 左侧：ExploreTree（字段选择 + 搜索）。
- 中部/右侧：Filters、Results、Visualization 等核心区域（保持现有布局即可）。

## ExploreTree 设计

### 结构与分区
ExploreTree 的展示层级：
1) 表/语义模型（当存在多个表时展示表头；语义层项目可视为单表）。
2) 分区：
   - Metrics
   - Dimensions
   - Custom Metrics（若支持）
   - Custom Dimensions（若支持）
3) 分组（可选）：
   - groupLabel / groups（字段配置定义）
   - 实体（entity）或业务域分组（若存在）
4) 字段项（最终叶子节点）

### 字段项展示
- 文案：优先展示 `label`，缺省时展示 `name`。
- 状态：
  - 已选中字段置顶或高亮（与现有交互一致）。
  - 缺失字段（missing field）以告警提示展示。

### 分组规则
- Metrics 与 Dimensions 分开分区展示。
- 优先使用 `groupLabel`/`groups` 进行分组，分组层级不宜过深（建议 <= 3 层）。
- 时间维度：
  - base time dimension 作为分组名（隐藏），其 interval 粒度作为子项展示。
  - 例：`order_date` → `order_date (Day/Week/Month/Year)`。

### 搜索
- 搜索范围：字段 label 与 groupLabel。
- 行为：
  - 仅保留匹配项及其父级分组。
  - 无匹配的表/分区隐藏。
  - 清空搜索后恢复原始结构与展开状态。

### 语义层（MetricFlow）特殊规则
- ExploreTree 仍按 Metrics / Dimensions 展示。
- 当用户已选择 Metrics：
  - 仅展示这些 Metrics 支持的 Dimensions。
- 当用户已选择 Dimensions：
  - 仅展示与这些 Dimensions 兼容的 Metrics。
- 兼容筛选为“动态联动”，但不需要显式展示语义模型标题。

#### 联动刷新策略
- 触发时机：仅在 Metrics / Dimensions 的“选中集合”发生变化时触发（新增/移除/清空）。
- 节流策略：短暂 debounce（建议 200-300ms）合并连续操作，避免频繁请求。
- 并发策略：若 Metrics 与 Dimensions 同时变化，可并发请求两端兼容集合；以最新请求结果为准。
- 空态策略：当 Metrics 与 Dimensions 都为空时，不发请求，展示全部字段。
- 缓存策略：基于 `projectUuid + 已选字段集合` 作为 key 缓存结果，避免重复请求。
- 体验策略：请求中保留旧集合以避免闪烁，可加轻量 loading 状态。

## 文案建议
- 搜索框 placeholder：`Search metrics + dimensions`（沿用现有文案）。

## 待确认
- 语义层联动筛选的具体 debounce 时间与并发上限。
