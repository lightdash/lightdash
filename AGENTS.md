/# Repository Guidelines

## 项目结构与模块组织

这是一个 pnpm workspace 的单体仓库，核心代码位于 `packages/`。`packages/frontend` 是 React 前端，`packages/backend` 是 Node.js API，`packages/common` 提供共享类型与工具，`packages/warehouses` 处理数据仓库连接，`packages/cli` 为命令行工具，`packages/e2e` 存放端到端测试。文档在 `docs/`，部署相关配置在 `docker/` 与根目录 `docker-compose.yml`，示例项目与演示资源位于 `examples/` 与 `static/`。

## 构建、测试与开发命令

- 安装依赖：`pnpm install`
- 启动开发模式：`pnpm dev`（并行启动前端与后端）
- 构建产物：`pnpm build`
- 全量测试：`pnpm test`
- 代码检查：`pnpm lint`，自动修复可用 `pnpm fix-lint`
- 格式化：`pnpm format` 或 `pnpm fix-format`
- 数据库初始化（本地开发）：`pnpm -F backend migrate`、`pnpm -F backend seed`

如果修改了共享包，请先运行 `pnpm common-build` 或 `pnpm warehouses-build` 再启动 `pnpm dev`。

## 编码风格与命名约定

项目主要使用 TypeScript。格式化由 Prettier 管理，默认 `tabWidth` 为 4，字符串使用单引号；Lint 使用 ESLint。提交前通常通过 husky + lint-staged 自动执行格式化与 lint。文件和导出命名遵循已有模块习惯：React 组件采用 PascalCase，函数/变量使用 camelCase。

## 测试指南

单元与集成测试以 Jest 为主（对应 `packages/*`），端到端测试使用 Cypress（`packages/e2e`）。本地可用 `pnpm -F backend test`、`pnpm -F frontend test` 或 `pnpm e2e-run` 运行指定范围。测试文件请遵循现有目录结构与命名（如 `*.test.ts`、`*.spec.ts`）。

## 提交与 PR 规范

提交信息遵循 Conventional Commits，例如：`feat: add warehouse connector`、`fix: handle null filters`。PR 建议聚焦单一问题，描述清楚变更、关联的 issue 链接与验证步骤；涉及 UI 变更请附截图。合并方式为 squash & merge，并以 CI 全绿为前提。

## 安全与配置提示

本地配置建议使用 `.env.development.local`，不要提交包含密钥的文件。涉及安全问题请参考 `SECURITY.md` 的反馈渠道。
