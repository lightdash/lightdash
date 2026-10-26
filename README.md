# Analytics query history backfill QA

Isolated local Lightdash instance with seeded Jaffle Shop data and a dedicated test bucket; no production data or production changes.

- UI trigger imported retained terminal query history; coverage controls action visibility after completion and Settings revisit.
- A real failed worker job was manually retried through the UI. Its previous failure was shown safely and published data remained intact.
- Final Query Events Explore: 6 unique query IDs; captured and historical provenance distinguishable. A captured query arriving on another date superseded its fallback, preserving authoritative timings.
- Identical sequential and concurrent POST reruns did not add rows. Final rerun preserved the canonical history object's ETag exactly.
- Existing compacted queries and recent pending raw events were skipped; raw events outside the nightly processing window could recover a retained DB fallback.
- Missing actor, warehouse error, database retention and additive Parquet schema cases were checked. Preview, current-day, other-org, in-progress and pre-execution-error records were excluded.
- Viewer GET/POST 403; another organization's admin could not access this backfill.
- Storage failure failed closed; safe manual retry succeeded after storage recovery.

Checks: 128 backend tests, 20 frontend tests, 167 warehouse reader tests; affected package typechecks, changed-file lint and formatting. Only focused suites were run.

Scope: retained Query Events plus current dimensions. Historical People activity summaries, legacy views, AI/token/export reconstruction and SQL/error exposure are excluded.
