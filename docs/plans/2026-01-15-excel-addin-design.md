# Excel 插件 MVP 设计（Lightdash Explore 简化构建）

## 背景与目标
面向内部分析团队与业务用户，在 Excel 插件中提供简化的 Query Builder，复用 Lightdash Explore 元数据与 MetricQuery 结构，实现从登录到查询、结果写入 Excel 的闭环。MVP 强调“查询即写入 Excel”、跨会话刷新能力与可靠的基础体验。

## MVP 范围
- 登录：邮箱/密码登录，使用 session cookie。
- 项目：登录后确认单一项目；固定单 Explore。
- 查询构建：维度/指标选择、筛选、排序（多字段），limit 固定（如 10k）。
- 结果写入：以当前选中单元格为左上角，写入二维表格（含表头）。
- 刷新：跨会话保存 MetricQuery 到工作簿 settings，一键刷新覆盖同一位置。

## 非目标
- 自动创建 PivotTable。
- SSO/PAT 登录。
- 多项目/多 Explore 选择。
- 下钻与复杂明细查询。

## 设计约束与假设
- 可复用 Lightdash Explore 的元数据结构与 MetricQuery schema。
- 结果行数上限固定，避免 Excel 性能问题。
- Office.js 可获取当前选中单元格并写入范围。

## 架构与组件
- **Login**：负责邮箱/密码登录与会话管理。
- **ExploreMetaLoader**：拉取 Explore 元数据（字段、类型、label、time intervals）。
- **QueryBuilder**：字段树 + 选择列表 + 筛选器编辑器 + 排序列表。
- **ResultWriter**：执行查询、写入 Excel、保存映射与查询配置。

## 数据流
1) 登录成功后确定 projectUuid 与固定 exploreName。
2) 拉取 Explore 元数据并生成字段树。
3) 用户选择维度/指标/筛选/排序，组装 MetricQuery。
4) 点击“查询”触发 API 执行，得到 rows。
5) 以当前选中单元格为起点写入表头+数据。
6) 保存 MetricQuery 与字段映射到工作簿 settings 以便刷新。

## MetricQuery 组装规则
- `metrics`/`dimensions` 取 Explore 字段 id。
- `filters` 支持等于/包含/范围等常见操作符。
- `sorts` 支持多字段升/降序。
- `limit` 固定上限（如 10k）。

## Excel 写入策略
- 使用当前选中单元格作为左上角起点。
- 写入前检查目标区域是否存在非空内容，必要时提示覆盖。
- 表头使用字段 label，并维护 `label -> fieldId` 映射。

## 刷新与跨会话保存
- 将 MetricQuery 与写入起点、字段映射保存在工作簿 settings。
- 刷新时读取 settings，重新执行查询并覆盖原区域。
- 若 Explore 字段发生变化导致映射失效，提示用户重新选择。

## 错误处理
- 登录失败、元数据失败、查询失败均给出明确提示并保留用户配置。
- 查询返回空集时仍写入表头并提示“无数据”。
- 网络异常可重试，不清空已选配置。

## 测试建议
- 单元测试覆盖 MetricQuery 组装（filters/sorts/limit）。
- 单元测试覆盖字段映射序列化/反序列化。
- 集成测试使用 mock API 验证写入二维数组逻辑。

## 里程碑建议
- M1：登录 + 元数据加载 + QueryBuilder 基础交互。
- M2：查询执行 + Excel 写入 + 基础错误提示。
- M3：跨会话刷新 + 覆盖写入处理 + 完整测试。
