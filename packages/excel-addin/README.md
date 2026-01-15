## Excel Add-in (React + Vite)

最小的 Excel TaskPane 脚手架，配合 Lightdash API 调用。默认端口 `3500`，支持本地 https 调试。

### 环境要求

- Node 20.19（见仓库根目录 `.nvmrc`）
- pnpm

### 快速开始

1. 安装依赖（在仓库根目录）：
   ```bash
   pnpm install
   ```
2. 确保 Lightdash 后端可用（默认 `http://localhost:8080`）。如需改地址，更新 `packages/excel-addin/vite.config.ts` 的 proxy target。
3. 本地开发（HTTP）：
   ```bash
   pnpm --filter excel-addin dev
   ```
4. 本地 https（Office Online/某些 Mac 环境要求）：先用 `npx office-addin-dev-certs install` 生成/信任证书（或自备证书并通过 `SSL_CRT_FILE`、`SSL_KEY_FILE` 环境变量指定），再运行：
   ```bash
   pnpm --filter excel-addin dev:https
   ```
   `dev:https` 通过 `HTTPS=true` 触发 Vite 的 https；如果提供 `SSL_CRT_FILE`/`SSL_KEY_FILE` 会使用指定证书，否则退回自签。
5. 侧载到 Excel 桌面版：Excel → 插件 → 管理我的加载项 → 上传自定义加载项 → 选择 `packages/excel-addin/manifest.xml`。
6. Office Online 或公网：把 `manifest.xml` 中的 SourceLocation 域名改为你的 https 隧道地址。

### Lightdash 后端与 CORS

- 开发时 add-in 通过 Vite 代理 `/api` 到 `http://localhost:8080`，因此无需额外 CORS 配置。
- 若使用 Office Online/远程域名直接请求后端，请在 Lightdash 中开启 CORS：
  - `LIGHTDASH_CORS_ENABLED=true`
  - `LIGHTDASH_CORS_ALLOWED_DOMAINS=https://localhost:3500,https://<你的隧道域名>`

### 说明

- 启动后先调用 `/api/v1/user` 校验登录；未登录时走 `/api/v1/login`（cookie 模式）。
- 进入 Explore 后，通过 `/api/v1/projects/:projectUuid/explores` 拉取 Explore 列表，再请求 `/api/v1/projects/:projectUuid/explores/:exploreName` 获取字段元数据。
- 查询使用 `/api/v2/projects/:projectUuid/query/metric-query` 并轮询 `/api/v2/projects/:projectUuid/query/:queryUuid`，写入当前选中单元格。
- 查询配置与写入位置保存至 `Office.context.document.settings`，支持跨会话刷新。
- Office.js 通过 CDN (`https://appsforoffice.microsoft.com/lib/1/hosted/office.js`) 加载，无需本地安装包。
