# External sources

Files and third-party apps connected to a project as queryable tables:
uploaded CSVs and connected Google Sheets, ingested to typed parquet in object
storage, generated as explores, and queried on the DuckDB compose engine.

## Language

**External source**:
A project-scoped connection to data that lives outside the warehouse — an
uploaded CSV file or a connected Google Sheet. Owns one or more source tables.
_Avoid_: connection (collides with data-app external connections), integration, upload (noun, for the entity)

**Source table**:
One queryable table belonging to an external source, backed by an ingested
parquet file in object storage and surfaced as an explore. A CSV source has
one table; a Google Sheets source can have one per tab.
_Avoid_: dataset, file, view

**Ingest**:
To parse a source's raw data, write it as a typed parquet file, and generate
or update the table's explore. Runs on the scheduler worker. Each successful
ingest bumps the table's version.
_Avoid_: materialize (reserved by pre-aggregates), sync, import, process

**Refresh**:
A user-initiated request to ingest a source's current data again — re-reading
the connected sheet, or replacing the uploaded file. Not dashboard
auto-refresh.
_Avoid_: sync, re-import, rebuild

**Staged upload**:
An uploaded file that has been stored and sniffed but not yet confirmed as a
table. The user names the table to commit it; abandoned stages are cleaned up.
_Avoid_: draft, pending upload

**External source explore**:
The generated explore for a source table (`ExploreType.EXTERNAL_SOURCE`):
dimensions from the inferred columns, auto-generated metrics (row count plus
sum/average per numeric column), executed on the DuckDB engine via a
late-bound file read. A user-managed explore — it survives dbt recompiles and
bypasses table selection, like virtual views.
_Avoid_: virtual view (a different user-managed explore type), file explore

**Locator**:
The backend-only pointer to a table's ingested file: storage, format, and URI.
Never exposed through the API; the explore's SQL never contains it — the
execution layer binds it as a CTE at run time.
_Avoid_: path, URL, link

## Notes

- Storage lives in the pre-aggregates S3 bucket under
  `external-sources/{projectUuid}/{sourceUuid}/…` because the shared DuckDB
  engine's S3 session is configured exclusively from that bucket's config.
- Rows are durable (no TTL), unlike query results. Deleting a source deletes
  its rows and explores; ingested files are currently left in object storage
  (cleanup is a follow-up).
- Preview projects copy source rows with fresh uuids; the ingested files are
  shared by URI, not duplicated.
