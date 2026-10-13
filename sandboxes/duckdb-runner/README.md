# duckdb-runner sandbox

Image for composer and merge DuckDB queries. Per run the backend writes the
referenced result files into `/work/in/<table>.jsonl`, a runner script to
`/work/runner.mjs` plus `probe.sql` / `run.sql` / `settings.json`, then runs
`node /work/runner.mjs probe|run` and reads `/work/out/probe.json`,
`/work/out/result.jsonl` and `/work/out/meta.json` back. DuckDB spills to
`/work/tmp`. The sandbox has no egress and no credentials.

The runner loads the same DuckDB warehouse client the server uses:

```js
createRequire(import.meta.url)(
    '@lightdash/warehouses/dist/warehouseClients/DuckdbWarehouseClient',
);
```

It resolves through `NODE_PATH=/opt/lightdash/node_modules`.

- Production: `SANDBOX_PROVIDER=e2b`, template `E2B_DUCKDB_TEMPLATE_NAME` at tag
  `E2B_DUCKDB_TEMPLATE_TAG`. Sized at 2 vCPU / 2 GB (`build-sandbox.ts`).
- Local: `SANDBOX_PROVIDER=docker`, image `SANDBOX_DUCKDB_DOCKER_IMAGE`, built
  with `./build-local-image.sh`.

## Environment variables (backend)

| Variable | Default | Purpose |
|---|---|---|
| `E2B_DUCKDB_TEMPLATE_NAME` | `lightdash-duckdb-runner` | E2B template name |
| `E2B_DUCKDB_TEMPLATE_TAG` | running Lightdash version | E2B template tag |
| `SANDBOX_DUCKDB_DOCKER_IMAGE` | `lightdash-duckdb-runner:local` | Image for `SANDBOX_PROVIDER=docker` |
| `DUCKDB_SANDBOX_MEMORY_LIMIT` | `1GB` | DuckDB `memory_limit` inside the sandbox |
| `DUCKDB_SANDBOX_THREADS` | `2` | DuckDB `threads` inside the sandbox |
| `SANDBOX_INPUT_MAX_BYTES` | `67108864` (64 MiB) | Total input bytes pushed into one sandbox run (shared with python) |

Build-time variables: `E2B_DUCKDB_TEMPLATE_NAME`, `E2B_DUCKDB_TEMPLATE_TAG`,
`E2B_DUCKDB_TEMPLATE_EXTRA_TAGS` (`build-sandbox.ts`) and
`E2B_DUCKDB_TEMPLATE_SOURCE_TAG` (`assign-tag.ts`).

## Packaging

`pack-packages.sh` builds `packages/common` and `packages/warehouses` from the
workspace and `pnpm pack`s them here as `lightdash-common.tgz` and
`lightdash-warehouses.tgz` (gitignored). `build-sandbox.ts` and
`build-local-image.sh` both run it first, so the repo root needs `pnpm install`.
The image installs both tarballs together from `image-package.json`, whose
`overrides` pins `@lightdash/common` to the local tarball. Warehouses never
resolves common from the registry (`package-lock.json` in the image shows
`"resolved": "file:lightdash-common.tgz"`). Dependency install scripts are
skipped (`--ignore-scripts`); DuckDB's native binding is a prebuilt platform
package.

Chosen: the full warehouses install (every warehouse driver), not an esbuild
bundle of the DuckDB client. Measured on arm64 (Docker 29.4): image 748 MB
(`/opt/lightdash/node_modules` 445 MB; node:24-slim base ~250 MB). Image build
takes ~55 s after the packages are built. That is well under the 1.5 GB
threshold, so the bundle fallback was not needed.

## Publishing

Every release publishes the template to both E2B regions through the
`e2b-templates` matrix in `.github/workflows/post-release.yml`. It builds
`lightdash-duckdb-runner:<version>` (and moves `:latest`) when this directory,
`packages/common` or `packages/warehouses` changed since the previous release.
Otherwise it retags `:latest` with the release version. Builds install root deps
first (`install_root_deps: true`) for the pack step. Manual build:

```bash
sfw pnpm install --frozen-lockfile
E2B_API_KEY=... E2B_DUCKDB_TEMPLATE_TAG=<tag> pnpm run build   # add --no-cache to bypass the E2B cache
```

## Verifying locally

```bash
./build-local-image.sh            # -> lightdash-duckdb-runner:local
```

`proof.mjs` (fed through stdin, run as the image's `user`):

```js
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
fs.writeFileSync('/work/in/t.jsonl', '{"a":1}\n{"a":2}\n');

const { DuckdbWarehouseClient } = require('@lightdash/warehouses/dist/warehouseClients/DuckdbWarehouseClient');
const client = process.env.SKIP_CLIENT ? null : new DuckdbWarehouseClient();
if (client && process.env.NO_HTTPFS) client.loadExtension = async () => {};
if (client) await client.streamQuery('SELECT 1 AS x', ({ fields, rows }) => {
    console.log('client', JSON.stringify({ fields, rows }));
});

const { DuckDBInstance } = require('@duckdb/node-api');
const conn = await (await DuckDBInstance.create(':memory:')).connect();
const reader = await conn.runAndReadAll(
    "SELECT 1 AS one, sum(a) AS total FROM read_json('/work/in/t.jsonl')",
);
console.log('node-api', JSON.stringify(reader.getRowObjectsJson()));
```

```console
$ docker run --rm --network none --entrypoint sh lightdash-duckdb-runner:local -c \
    'id; node -e "require(\"@lightdash/warehouses/dist/warehouseClients/DuckdbWarehouseClient\"); console.log(\"require ok\")"'
uid=1001(user) gid=1001(user) groups=1001(user)
require ok

# No network: native binding loads and reads a JSONL input
$ docker run --rm -i --network none -e SKIP_CLIENT=1 --entrypoint node \
    lightdash-duckdb-runner:local --input-type=module < proof.mjs
node-api [{"one":1,"total":"3"}]

# No network: the warehouse client's streamQuery, with httpfs loading skipped
$ docker run --rm -i --network none -e NO_HTTPFS=1 --entrypoint node \
    lightdash-duckdb-runner:local --input-type=module < proof.mjs
client {"fields":{"x":{"type":"number","numericKind":{"kind":"integer"}}},"rows":[{"x":1}]}
node-api [{"one":1,"total":"3"}]

# With network: the default constructor, unmodified
$ docker run --rm -i --entrypoint node lightdash-duckdb-runner:local --input-type=module < proof.mjs
client {"fields":{"x":{"type":"number","numericKind":{"kind":"integer"}}},"rows":[{"x":1}]}
node-api [{"one":1,"total":"3"}]
```

The default `new DuckdbWarehouseClient()` always runs `INSTALL/LOAD httpfs` in
session bootstrap. With `--network none` that fails with `Failed to download
extension "httpfs"`, because the extension isn't baked into the image. Sandbox
runs must therefore use `DuckdbWarehouseClient.createForLocalFiles(...)`, which
never loads httpfs.
