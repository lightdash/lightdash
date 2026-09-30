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
  'dbt-core==1.10.0' 'dbt-duckdb==1.10.0' 'duckdb==1.5.6'
ln -sf dbt scripts/playground-bundle/.venv/bin/dbt1.10
```

CI uses Python 3.12 and these versions. Use the same versions locally.

## Build

From the repository root, with `origin/main` fetched:

```sh
pnpm build:playground-bundle
```

The command replaces these build outputs:

- `packages/backend/assets/playground/jaffle_shop.duckdb`
- `packages/backend/assets/playground/explores.json`
- `packages/backend/assets/playground/content.json`
- `packages/backend/assets/playground/SHA256SUMS`
- `packages/backend/assets/playground/previous/`

The JSON files are emitted as single-line JSON. `content.json` carries a schema
version and definitions for the editable charts and dashboard created during
playground provisioning. The build checks every referenced explore and field
against the explores it just compiled.

The build is reproducible, and the `Playground bundle check` workflow rebuilds
it on every pull request that can change it. The workflow fails when the
committed files differ from the rebuild. Two steps make the output stable:

- DuckDB does not write identical bytes for identical content. The build
  compares the new database with the committed one by schema, table rows and
  view definitions, and keeps the committed file when they match.
- The compiler gives filters random ids. The build sorts the explores and
  derives each id from where it appears.

The build writes every file to a staging directory first and then renames the
files into place, with `SHA256SUMS` last. A build that stops midway leaves
files that fail verification.

## Versions and rolling deploys

`SHA256SUMS` lists a SHA-256 digest for each payload. The bundle version is
derived from the `explores.json` and `jaffle_shop.duckdb` digests, so a change
to either gives a new version. `content.json` does not affect the version.

At runtime:

- Provisioning verifies every payload against `SHA256SUMS`, validates
  `explores.json` against a schema, and checks that the database has every
  table the explores use. It refuses to create a project when a check fails.
- Each playground and training project stores the version its cached explores
  came from. Queries open the database of that version and fail with a message
  that names both versions when this server does not have it.
- The image also ships the bundle from the previous release in `previous/`.
  The build copies it from `PLAYGROUND_BUNDLE_BASE_REF` (default
  `origin/main`) when the version changes, and keeps the base ref's `previous/`
  when it does not. `previous/` holds a database only when its bytes differ
  from the current one.
- A scheduled job moves projects to the current version 30 minutes after any
  server first reports it. By then no server from the previous release is
  left, so every server can serve the new version. A project on a version the
  server cannot serve at all moves at once.

## Teaching content

Edit chart, dashboard, and metrics-tree definitions in `content.ts`. The extra
University samples — pins, comments, categories, the prebuilt app, agent, and
completed research report — live in `teachingContent.ts` and are included by
the same build. Update the source and shipped bundle together.

Check the complete content definition against the shipped bundle without
rebuilding the warehouse or changing any assets:

```sh
pnpm test:playground-content
```

The parity test covers every field, including the app's built/source files and
research Markdown, so a rebuild cannot silently drop teaching samples.
