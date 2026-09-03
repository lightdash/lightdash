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
one table. The first release creates one Google Sheets source for one selected
tab; multi-tab sources are not yet part of the API contract.
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

**Ingest attempt**:
A durable, generation-specific request to ingest one source table. The
scheduler payload names the attempt, not mutable source state. A lease and
execution token fence timed-out workers; retries resume publication or rebuild
into a new object without letting stale work publish.
_Avoid_: job (the scheduler job is only one delivery mechanism), run

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
  `external-sources/{projectUuid}/{sourceUuid}/…`. The compose engine reads
  it with a session built from that bucket's config (its endpoint, region and
  credentials, falling back to the base S3 values), because a DuckDB S3
  secret pins one endpoint and region; result files use the results session.
- Every raw/parquet object is registered before upload. Replaced, deleted,
  failed, and abandoned-stage objects become `pending_delete`; a five-minute
  maintenance task retries exact-key deletion. Manifests intentionally survive
  source deletion until collection succeeds.
- Google refresh tokens are encrypted and owned by the source, not looked up
  through its creator. A manager can explicitly reconnect to replace that
  credential with their current Google grant.
- External query DuckDB clients are isolated, resource-limited, and create an
  S3 secret scoped to the exact published object URI. User SQL remains
  SELECT-only and file-reading functions remain blocked.
- Customer rollout limits are configurable with `EXTERNAL_SOURCES_*`: upload
  bytes, organization storage bytes, rows, Sheets batch size, concurrent
  ingests, concurrent DuckDB queries, lease duration, stage TTL, and GC batch
  size. Defaults: 100 MB/file, 5 GB/org, 1M rows, two concurrent ingests and
  queries per organization.
- Preview projects copy source rows with fresh uuids; the ingested files are
  shared by URI, not duplicated.

## Operational caveats

- The DuckDB query concurrency budget is process-local. Deployments with many
  API workers should size the per-worker limit accordingly; ingest concurrency
  is database-coordinated and therefore cluster-wide.
- DuckDB `SCOPE` limits which URI receives the configured credential. Production
  should still use dedicated S3/IAM credentials restricted to the
  `external-sources/` prefix for defense in depth.
- Sheets paging bounds application memory and applies byte/row caps, but Google
  API rate limits still apply; scheduler retries use the same durable attempt.
