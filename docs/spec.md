# Lightdash × MetricFlow 深度集成

## 语义建模可视化编辑能力

### 需求分析 & 设计文档

---

## 1. 背景与目标

### 1.1 背景

当前 Lightdash 的核心架构基于 **dbt manifest**，其语义能力（维度 / 指标 / 表关系）本质上是 dbt 模型的投影。这种架构存在以下问题：

* **指标语义不集中**

  * dbt 模型 ≠ 业务指标
  * 指标逻辑分散在 SQL / YAML / Explore 即席计算中
* **SQL 生成耦合在 Lightdash**

  * Explore → SQL AST → Warehouse
  * 难以复用、难以治理
* **语义编辑能力割裂**

  * YAML 编辑偏工程
  * UI 只读，无法形成“语义 IDE”

随着 MetricFlow（MF）作为独立语义层引入，我们需要完成一次**架构级升级**：

> **将 Lightdash 从「dbt 前端 BI」升级为「MetricFlow 驱动的语义 IDE + BI」**

---

### 1.2 总体目标

1. **完全下放 SQL 生成到 MetricFlow**
2. **以 MetricFlow 语义模型为唯一真理源**
3. **在 Lightdash 内深度集成语义建模能力**
4. **支持以下对象的可视化编辑**

   * 实体（Entity：主键 / 外键）
   * 维度（Dimension）
   * 度量（Measure）
   * 指标（Metric）
5. **保留并增强现有能力**

   * YAML Editor
   * Git 集成
   * Explore / Dashboard / Chart

---

## 2. 核心设计原则

### 2.1 语义优先（Semantic First）

* UI、Explore、Catalog **只认语义对象**
* 禁止直接依赖 dbt model / column

### 2.2 编译器分层

| 层级         | 职责            |
| ---------- | ------------- |
| Lightdash  | 语义 IDE + 查询构建 |
| MetricFlow | 语义校验 + SQL 编译 |
| Warehouse  | 执行            |

Lightdash **不再生成 SQL**。

### 2.3 可视化优先，YAML 兜底

* 可视化编辑 = 默认路径
* YAML Editor = 高级模式
* 二者**共享同一语义模型**

---

## 3. 核心对象模型（语义内核）

### 3.1 SemanticObjectGraph（全局语义图）

```ts
SemanticObjectGraph {
  models: SemanticModel[]
  entities: Entity[]
  dimensions: Dimension[]
  measures: Measure[]
  metrics: Metric[]
}
```

> 所有 UI / 查询 / 编辑行为只依赖此结构

---

### 3.2 对象职责边界（强约束）

| 对象        | 职责             | UI 是否直接可见  |
| --------- | -------------- | ---------- |
| Entity    | Join 路径        | ❌          |
| Dimension | Group / Filter | ✅          |
| Measure   | 指标原料           | ⚠️（不可直接展示） |
| Metric    | 业务指标           | ✅          |

---

## 4. 功能需求分析

### 4.1 实体（Entity）管理

#### 功能需求

* 新增 / 编辑 / 删除 Entity
* 支持 Primary / Foreign
* Foreign Entity 可视化选择目标模型

#### 约束

* 每个 Semantic Model 只能有一个 Primary Entity
* Foreign Entity 必须能解析到目标 Primary Entity

#### UI 归属

* **Project Settings → Semantic Models → Entities**

---

### 4.2 维度（Dimension）管理

#### 功能需求

* 新增 / 编辑 / 删除维度
* 支持类型：

  * time（含粒度）
  * categorical
  * number / boolean
* 支持默认时间维度

#### UI 入口

* Explore 左侧字段树（快捷编辑）
* Semantic Model 页面（完整编辑）

---

### 4.3 度量（Measure）管理

#### 功能需求

* 新建度量

  * 聚合函数（sum / count / avg 等）
  * 表达式（expr）
* 编辑 / 删除度量

#### 关键约束

* Measure **不能直接用于图表**
* 只能被 Metric 引用

#### UI 入口

* Semantic Model 页面
* YAML Editor（高级）

---

### 4.4 指标（Metric）管理

#### 支持类型

* Simple
* Ratio
* Derived
* Cumulative

#### 功能需求

* 指标定义可视化编辑
* 指标依赖分析
* 指标可用维度自动计算
* 指标来源 YAML 定位（source_ref）

#### UI 入口

* Catalog → Metrics
* Explore → Promote to Metric

---

### 4.5 指标组合与 Promote 能力（核心）

#### 功能描述

* 用户在 Explore 中：

  * 组合指标
  * 添加过滤
  * 添加计算
* 系统识别为合法 Metric AST
* 一键「Save as Metric」
* 自动生成：

  * MetricFlow YAML
  * Git commit / PR

> Explore = 临时语义编辑器
> Promote = 语义固化

---

## 5. Explore 查询模型重构

### 5.1 MetricQuery AST（替代 SQL）

```ts
MetricQuery {
  metrics: MetricId[]
  dimensions: DimensionId[]
  filters: Filter[]
  time: { grain, range }
}
```

### 5.2 执行流程

```
Explore UI
  ↓
MetricQuery AST
  ↓
MetricFlow API
  ↓
SQL
  ↓
Warehouse
```

---

## 6. UI 深度集成设计

### 6.1 Explore 左侧字段树

重构为：

```
Semantic Models
 └─ orders
    ├─ Entities
    ├─ Dimensions
    ├─ Measures
    └─ Metrics
```

支持：

* Hover → Edit
* Open in YAML
* 来源标注（MF）

---

### 6.2 Catalog 页面增强

#### Metrics

* 详情页展示：

  * 定义
  * 依赖
  * 可用维度
  * Source YAML

#### Dimensions

* 显示归属模型
* 表达式 & 类型

---

### 6.3 YAML Editor 增强（不替代）

* Semantic Outline
* Source Ref 跳转
* MetricFlow 校验错误行内展示

---

## 7. 后端与接口设计

### 7.1 新增 ProjectAdapter

```
MetricFlowProjectAdapter
```

职责：

* 构建 SemanticObjectGraph
* 执行 MetricQuery
* 校验语义模型

---

### 7.2 MetricFlow API 最小接口集

* `GET /semantic/models`
* `GET /semantic/metrics`
* `POST /query`
* `POST /validate`
* `POST /compile_sql`（可选）

---

## 8. YAML / Git 工作流

### 8.1 编辑路径

```
UI 编辑
 → Semantic AST
 → YAML Patch
 → Git Commit / PR
```

### 8.2 Source Ref

每个语义对象记录：

```json
{
  "path": "semantic/orders.yml",
  "startLine": 42,
  "endLine": 58
}
```

---

## 9. 非功能性需求

### 9.1 安全与权限

* 指标级权限
* 编辑 / 审批角色分离

### 9.2 可审计性

* Git 全量审计
* 指标变更历史

### 9.3 性能

* 语义图缓存
* 查询结果缓存（可选）

---

## 10. 风险与应对

| 风险       | 应对                 |
| -------- | ------------------ |
| UI 改造范围大 | 分阶段切换（dbt / MF 并行） |
| 指标语义错误   | 强校验 + CI           |
| 用户学习成本   | Explore Promote 引导 |

---

## 11. 里程碑建议

1. 语义图 & MF Adapter
2. Explore Query 重构
3. Catalog + YAML Editor 增强
4. Promote to Metric
5. 实体关系 UI

---

## 12. 总结

本设计并非“给 Lightdash 增加 MetricFlow 支持”，
而是一次**语义内核升级**：

> **Lightdash = MetricFlow 的可视化 IDE**

一旦完成：

* 指标成为一等公民
* SQL 完全解耦
* 语义治理成为可能

---

**本设计可直接进入评审与开发阶段。**
