# PROD-12592 live QA

Isolated local Lightdash instance, 26 October 2026. Synthetic fixtures only.

## Combined history backfill

- 13: Existing project before backfill: 26 missing, 8 existing, 11 pending records across queries, AI usage and historical activity.
- 14: After the single action: 0 missing, 34 existing, 11 pending; the Settings card disappears.
- 15–16: Historical activity is immediately queryable: 24 records, including AI/tool/app facts, legacy views, download requests and export jobs.
- 17: AI usage after importing retained records and receiving a late native event: 3 distinct calls, 1,524 tokens. Captured event replaces the imported copy.

Sequential and concurrent reruns preserved AI/history object bytes. Changing one retained app-version snapshot produced exactly one missing record; rerun updated it without increasing the 24-row total. Cross-organization fixtures were excluded and private payload sentinel values were absent.

Fresh third organization: creating Analytics automatically ran compaction and the combined backfill on the same queue. Coverage reached 0 missing / 3 existing in 8.31 seconds; query, AI usage and app history were immediately queryable without manual backfill or nightly processing.

Screenshots 04–12 are earlier query-specific QA, retained for the failure/retry and existing-project history checks. The implementation now imports all supported sources through one operation; see docs/usage-analytics/history-backfill.md in the PR for the source inventory and limitations.

## 27 October: lightweight Settings status

Screenshots18–19 show the current simplified UI: no exact-count/date scan, one action while the current completion marker is absent, then hidden after successful backfill and a full page reload. Earlier screenshots are retained as historical test evidence; their live-count UI is superseded.

The status endpoint now checks job state and at most one org-scoped S3 HEAD. Five isolated API requests produced exactly five HEAD200s and zero LIST/GET/Parquet reads. Warm local responses took18–21ms; this is a local measurement, not a cloud benchmark. The expensive reconciliation runs only in the worker. A successful versioned marker does not imply continuous coverage of future database changes; direct reruns remain safe.
