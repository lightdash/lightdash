# Trino dev warehouse

A local Trino with no authentication, plus a small dbt-trino project that
Lightdash can compile. Use it to test Trino projects and mixed warehouse
connections (a Trino extra connection on a Postgres project).

Trino serves two built-in catalogs:

- `tpch`: read-only TPC-H data, generated on the fly.
- `memory`: a writable in-memory catalog. dbt builds its tables here. The data
  is lost when the container stops, so run `dbt run` again after a restart.

## 1. Start Trino

```bash
cd examples/trino-dev
docker compose -p ld-trino-dev up -d
until curl -sf localhost:8080/v1/info | grep -q '"starting":false'; do sleep 3; done
```

Set `TRINO_PORT` to use a port other than 8080. The container uses about 1 GB
of memory.

Check it:

```bash
docker exec ld-trino-dev trino --execute "select count(*) from tpch.tiny.orders"
```

## 2. Build the dbt models

dbt-trino is not in the Lightdash dev venvs, so install it into its own venv.

```bash
python3.12 -m venv ~/.lightdash/dev-venv-trino
sfw ~/.lightdash/dev-venv-trino/bin/pip install "dbt-core~=1.10.0" "dbt-trino~=1.10.0"

cd examples/trino-dev/dbt
~/.lightdash/dev-venv-trino/bin/dbt run --profiles-dir .
~/.lightdash/dev-venv-trino/bin/dbt compile --profiles-dir .
```

This creates `memory.tpch_dev.trino_orders` (15,000 rows) and
`memory.tpch_dev.trino_customers` (1,500 rows), and writes
`target/manifest.json`.

## 3. Connection settings in Lightdash

| Field | Value |
| --- | --- |
| Type | Trino |
| Host | `localhost` (the API runs on the host; use `host.docker.internal` from a container) |
| Port | `8080` |
| User | `lightdash` |
| Password | empty |
| DB name (catalog) | `memory` |
| Schema | `tpch_dev` |
| HTTP scheme | `http` |

Trino with no authenticator rejects any password over HTTP
(`Password not allowed for insecure authentication`), so leave it empty. With an
empty password, Lightdash runs dbt with the `none` method instead of `ldap`,
because dbt-trino refuses authentication over HTTP. Queries send the user with
an empty Basic password, which Trino accepts. The connection form still marks
the password as required, so use the API for an empty password.

## 4. Add Trino as an extra connection on a Postgres project

This needs an Enterprise licence key and these flags:

```bash
LIGHTDASH_ENABLE_FEATURE_FLAGS=multi-connection-projects,mixed-warehouse-connections
```

Restart the API after you change the env file.

Then, with a session cookie (`POST /api/v1/login`):

1. `POST /api/v1/projects/{projectUuid}/warehouse-connection-mode/preview` with
   `{ original: { name, listAllDatabases: false, additionalDatabases: [] }, connection: { name, warehouseConnection: <Trino credentials> } }`.
2. `POST .../warehouse-connection-mode/switch` with the same body plus
   `planHash` from the preview and an `idempotencyKey`.
3. Add a dbt source for the Trino project
   (`POST /api/v1/projects/{projectUuid}/dbt-sources`).
4. Bind the source to the Trino connection:
   `PUT /api/v1/projects/{projectUuid}/warehouse-connections/dbt-sources/{sourceUuid}`
   with `{ warehouseConnectionUuid }`.
5. `POST /api/v1/projects/{projectUuid}/refresh`.

The project's own connection form also adds connections ("Add connection").

### dbt source type

Additional dbt sources accept GitHub connections only. To use a GitHub source,
push `examples/trino-dev/dbt` to a repository. The server then runs dbt with
the Trino target, which needs dbt-trino in the server's dbt environment. The
production images include it. The local dev venvs do not.

For a quick local test, a `manifest` source with the contents of
`target/manifest.json` avoids the dbt run. That needs a local edit that
allows `DbtProjectType.MANIFEST` in the two GitHub-only checks in
`packages/backend/src/services/ProjectDbtSourcesService.ts`. Do not commit that
edit.

## Stop

```bash
docker compose -p ld-trino-dev down
```
