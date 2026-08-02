# Playground bundle

Builds the versioned jaffle-shop DuckDB warehouse and pre-compiled Lightdash
explores used by playground projects. The build loads every CSV seed with
`@duckdb/node-api`, materializes the dbt models with dbt-duckdb, then compiles
explores through Lightdash's backend project adapter.

To keep the shipped file small, the build uses a temporary copy of the dbt
project whose default model materialization is `view`. CSV seeds remain physical
tables and are deterministically capped at 5,000 rows each so high-volume demo
seeds do not inflate the bundled binary. No checked-in demo project files are
changed.

## Setup

Create the isolated, gitignored Python environment once:

```sh
python3 -m venv scripts/playground-bundle/.venv
scripts/playground-bundle/.venv/bin/pip install \
  'dbt-core==1.10.0' 'dbt-duckdb==1.10.0'
ln -sf dbt scripts/playground-bundle/.venv/bin/dbt1.10
```

## Build

From the repository root:

```sh
pnpm build:playground-bundle
```

The command replaces these deterministic build outputs:

- `packages/backend/assets/playground/jaffle_shop.duckdb`
- `packages/backend/assets/playground/explores.json`
- `packages/backend/assets/playground/SHA256SUMS`

`explores.json` is emitted as single-line JSON. `SHA256SUMS` records both
bundle payloads so a rebuild can be checked with
`sha256sum --check packages/backend/assets/playground/SHA256SUMS`; with the
pinned dbt versions and unchanged inputs, the committed checksums should remain
stable.

The checked-in Postgres profile under the example project is not modified. A
temporary dbt-duckdb profile points at the output database during the build.
