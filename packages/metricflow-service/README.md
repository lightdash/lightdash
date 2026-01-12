# MetricFlow Service 运行指南（Postgres 示例）

## 环境配置
`ENVIRONMENTS_CONFIG` 指向的 `environments.yml` 示例：
```yaml
environments:
  - projectId: mf_local
    name: mf_local
    project_dir: /data/mf_repo              # Git 工作区挂载路径
    profiles_dir: /root/.dbt                # profiles.yml 挂载路径
    semantic_manifest_path: /data/mf_repo/target/semantic_manifest.json
    repo: http://host.docker.internal:3030/simon/M1
    default_ref: main
    tokens:
      - test-token
```

Postgres profiles（挂载到 `profiles_dir`，如 `/root/.dbt/profiles.yml`）：
```yaml
medical:
  target: dev
  outputs:
    dev:
      type: postgres
      host: "{{ env_var('DBT_HOST', 'localhost') }}"
      port: "{{ env_var('DBT_PORT', 5433) | int }}"
      user: admin
      password: admin
      dbname: medical
      schema: mdr
      threads: 4
      keepalives_idle: 0
      connect_timeout: 10
      search_path: public
```

确保容器内能访问 Postgres（若在宿主运行，常用 `host.docker.internal` 作为 host）。

## 运行示例（Docker）
```bash
# 准备环境文件
cat > /tmp/mf_env.yml <<'EOF'
environments:
  - projectId: mf_local
    project_dir: /data/mf_repo
    profiles_dir: /root/.dbt
    semantic_manifest_path: /data/mf_repo/target/semantic_manifest.json
    repo: http://host.docker.internal:3030/simon/M1
    default_ref: main
    tokens: [test-token]
EOF

cat > /tmp/mf_profile.yml <<'EOF'
# 填入上面的 Postgres profiles 配置
medical:
  target: dev
  outputs:
    dev:
      type: postgres
      host: "{{ env_var('DBT_HOST', 'host.docker.internal') }}"
      port: "{{ env_var('DBT_PORT', 5433) | int }}"
      user: admin
      password: admin
      dbname: medical
      schema: mdr
      threads: 4
      keepalives_idle: 0
      connect_timeout: 10
      search_path: public
EOF

# 启动服务
docker run --rm -d -p 8069:8069 \
  -v /path/to/mf_repo:/data/mf_repo \            # Git 工作区
  -v /tmp/mf_profile.yml:/root/.dbt/profiles.yml \  # profiles
  -v /tmp/mf_env.yml:/opt/config/env.yml \          # environments.yml
  -e ENVIRONMENTS_CONFIG=/opt/config/env.yml \
  -e DBT_HOST=host.docker.internal \
  -e DBT_PORT=5433 \
  local/metricflow-service:dev

# 若希望容器启动时自动 clone repo（project_dir 为空时），可以覆盖命令：
docker run --rm -d -p 8069:8069 \
  -v /path/to/mf_repo:/data/mf_repo \
  -v /tmp/mf_profile.yml:/root/.dbt/profiles.yml \
  -v /tmp/mf_env.yml:/opt/config/env.yml \
  -e ENVIRONMENTS_CONFIG=/opt/config/env.yml \
  -e DBT_HOST=host.docker.internal \
  -e DBT_PORT=5433 \
  local/metricflow-service:dev \
  sh -c "if [ ! -d /data/mf_repo/.git ]; then git clone --depth 1 http://host.docker.internal:3030/simon/M1 /data/mf_repo; fi && cd /data/mf_repo && dbt deps && dbt build --target dev && cd /opt/app && uvicorn api.app:app --host 0.0.0.0 --port 8069"
```

## 构建接口调用
```bash
curl -X POST http://localhost:8069/api/build \
  -H 'Authorization: Bearer test-token' \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"mf_local","gitRef":"main","forceRecompile":true}'
```
然后查询状态：
```bash
curl 'http://localhost:8069/api/build/<buildId>?projectId=mf_local' \
  -H 'Authorization: Bearer test-token'
```

## 常见问题
- `git pull failed`: 确认 `project_dir` 已是 git 仓库，或先手动 clone；`repo/default_ref` 需要在 environments.yml 配置。
- `adapter not found`: 安装了 dbt-duckdb/postgres；确保 profiles 中的 adapter 与依赖一致，Postgres 场景需容器能连上 DB。
- `source table not exist`: 数据库缺少原始表，需准备数据或调整模型。

## 本仓库 dev 快速体验（docker-compose.dev）
仓库已内置示例配置与仓库快照：
- dbt 仓库：`docker/dev-configs/dbt_repo`（已包含 target/manifest & semantic_manifest，可直接 build）
- 环境配置：`docker/dev-configs/mf_env.yml`
- profiles：`docker/dev-configs/mf_profile.yml`

快速启动（默认映射端口 8070）：
```bash
# 可选：若想指向其它 dbt 仓库或 profiles，可修改 docker-compose.dev.yml 对应 volumes
docker compose -f docker/docker-compose.dev.yml up -d --remove-orphans

# 健康检查
curl -s http://localhost:8070/health

# 触发编译（git 拉取 + dbt deps/build）
curl -s -X POST http://localhost:8070/api/build \
  -H 'Authorization: Bearer test-token' \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"mf_local","gitRef":"main","forceRecompile":true}'

# 查询指标（示例：ba100 按月、按院区）
curl -s -X POST http://localhost:8070/api/queries \
  -H 'Authorization: Bearer test-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId":"mf_local",
    "metrics":[{"name":"ba100"}],
    "groupBy":[{"name":"metric_time","grain":"MONTH"},{"name":"department__area_desc"}],
    "orderBy":[{"metric":{"name":"ba100"},"descending":true}],
    "limit":20
  }'
# 返回 queryId 后，用 GET /api/queries/{queryId}?projectId=mf_local 查看 rows/columns
```

## 常用环境变量与挂载
- `ENVIRONMENTS_CONFIG`：指向 environments.yml（如 `/opt/config/env.yml`），声明 projectId、项目路径、repo/default_ref、token。
- `DBT_HOST` / `DBT_PORT`：profiles.yml 中引用的数据库地址（默认 `host.docker.internal:5433`）。
- 挂载：
  - `/data/mf_repo`：dbt 仓库（包含 target/manifest/semantic_manifest）
  - `/root/.dbt/profiles.yml`：dbt 连接信息
  - `/opt/config/env.yml`：服务的环境/项目配置

## 后续优化项（建议）
- git 访问白名单与固定 ref（tag/commit），禁止任意仓库/分支；clone 失败或 ref 不存在时直接失败。
- 构建流水线：fetch/reset → dbt deps → dbt build/test → 生成/校验 semantic_manifest，任一步失败不切换引擎。
- 维持“上一次成功构建”的引擎快照，最新构建失败时自动回退/继续使用旧版本。
- 构建记录包含 gitRef/commit、开始结束时间、logTail、warnings；日志持久化便于排查。
- 兼容 PR/CI：可在外部 CI（dbt test/metricflow validate）通过后再触发构建，降低坏代码进入服务的概率。
