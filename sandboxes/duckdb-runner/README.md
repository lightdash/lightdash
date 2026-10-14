# duckdb-runner sandbox

Image for composer and merge DuckDB queries: `python:3.12-slim` plus the
`duckdb` wheel pinned in `requirements.txt`, and nothing else. No Lightdash
code is installed; the sandbox has no egress and no credentials.

The DuckDB nodes of one submission share a sandbox (`DuckdbSandboxLease`);
each node gets its own directory `/work/<queryUuid>`, and the sandbox is
destroyed when the last node releases it. Per node the backend
(`DuckdbSandboxRunner`) writes, in one batched upload:

| Path under `/work/<queryUuid>` | Contents |
|---|---|
| `runner.py` | the runner (`DUCKDB_RUNNER_SOURCE` in `duckdbSandboxHarness.ts`); its hash is part of the results cache key |
| `settings.json` | `{ "memoryLimit": "1GB", "threads": 2 }` |
| `probe.sql`, `run.sql` | one SELECT each; `probe.sql` only for discovered columns |
| `in/<table>.jsonl` | referenced results |
| `tmp/` | DuckDB spill (created by the runner) |

and runs `python3 -I /work/<queryUuid>/runner.py probe|run /work/<queryUuid>`.
The runner prints `{ fields }` (probe) or `{ fields, rowCount }` (run) to
stdout, so the command result carries the metadata; only `out/result.jsonl`
is read back. A failure exits 1 with the DuckDB message on stderr.

The runner opens an in-memory DuckDB and, before any user SQL, sets
`allowed_directories=['<workDir>/in']`, `temp_directory`, `memory_limit`,
`threads`, the server client's hardening settings, `TimeZone='UTC'`,
`enable_external_access=false` and `lock_configuration=true`. It refuses
anything but a single SELECT. Rows are written exactly as the server's DuckDB
client (`@duckdb/node-api` JSON values, `JSON.stringify` bytes) wrote them:
BIGINT/HUGEINT/DECIMAL as strings, dates and times as DuckDB prints them,
intervals as `{months, days, micros}`. Zero-row results still report fields.
`duckdbRunnerParity.test.ts` pins that against node-api for every DuckDB type.

Keep `requirements.txt` on the same minor as `@duckdb/node-api` in
`packages/backend/package.json`; `DuckdbSandboxRunner.test.ts` fails when they
disagree.

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

## Tests

Backend tests run the real `runner.py` as a local process
(`LocalProcessSandboxProvider`), so the host needs a `python3` that can
`import duckdb` at the pinned version. The provider puts the repo's
`venv/bin` first on `PATH`:

```bash
venv/bin/pip install -r sandboxes/duckdb-runner/requirements.txt
```

CI installs the same file with `actions/setup-python` (Python 3.12) before
`pnpm test` in the `build-and-test` job of `.github/workflows/pr.yml`.

## Publishing

Every release publishes the template to both E2B regions through the
`e2b-templates` matrix in `.github/workflows/post-release.yml`. It builds
`lightdash-duckdb-runner:<version>` (and moves `:latest`) when this directory
changed since the previous release, otherwise it retags `:latest` with the
release version. The runner script ships with the backend, so a runner change
needs no new template. Manual build:

```bash
sfw pnpm install --frozen-lockfile
E2B_API_KEY=... E2B_DUCKDB_TEMPLATE_TAG=<tag> pnpm run build   # add --no-cache to bypass the E2B cache
```

## Verifying locally

Build the image, write the real runner and a JSONL fixture into a directory,
and run a probe and a run as the image's `user` with no network:

```bash
./build-local-image.sh            # -> lightdash-duckdb-runner:local

mkdir -p /tmp/duckdb-proof/in && cd /tmp/duckdb-proof   # stands in for /work/<queryUuid>
pnpm -s -F backend exec tsx -e "process.stdout.write(require('./src/services/AsyncQueryService/duckdb/duckdbSandboxHarness').DUCKDB_RUNNER_SOURCE)" > runner.py   # from the repo root
printf '{"customer":"ann","amount":"10"}\n{"customer":"bob","amount":"5"}\n{"customer":"ann","amount":"7"}\n' > in/orders.jsonl
echo '{"memoryLimit":"1GB","threads":2}' > settings.json
cat > probe.sql <<'SQL'
WITH orders AS (SELECT * FROM read_json('/work/in/orders.jsonl', columns={"customer": 'VARCHAR', "amount": 'BIGINT'}, format='newline_delimited')) SELECT customer, SUM(amount) AS total, AVG(amount) AS mean FROM orders GROUP BY customer LIMIT 1
SQL
sed 's/ LIMIT 1$/ ORDER BY customer/' probe.sql > run.sql
echo "SELECT * FROM read_text('/etc/hosts')" > escape.sql

docker run --rm --network none -v /tmp/duckdb-proof:/fixture:ro lightdash-duckdb-runner:local sh -c '
  id && python3 -c "import duckdb; print(duckdb.__version__)" &&
  cp -r /fixture/. /work/ &&
  python3 -I /work/runner.py probe /work && echo &&
  python3 -I /work/runner.py run /work && cat /work/out/result.jsonl && echo &&
  cp /work/escape.sql /work/run.sql && python3 -I /work/runner.py run /work; echo "exit $?"'
```

Expected: `id` shows `user`, the version matches `requirements.txt`, then the
output below, recorded from the container (image size 198 MB on arm64).

```console
{"fields":{"customer":{"type":"string"},"total":{"type":"number","numericKind":{"kind":"integer"}},"mean":{"type":"number","numericKind":{"kind":"float"}}}}
{"customer":"ann","total":"17","mean":8.5}
{"customer":"bob","total":"5","mean":5}
{"fields":{"customer":{"type":"string"},"total":{"type":"number","numericKind":{"kind":"integer"}},"mean":{"type":"number","numericKind":{"kind":"float"}}},"rowCount":2}
Permission Error: Cannot access file "/etc/hosts" - file system operations are disabled by configuration
exit 1
```
