# Analytics query history backfill QA

Isolated local Lightdash instance with seeded Jaffle Shop data and a dedicated test bucket; no production data or production changes.

- UI trigger imported retained terminal query history; coverage controls action visibility after completion and Settings revisit.
- A real failed worker job was manually retried through the UI. Its previous failure was shown safely and published data remained intact.
- Final Query Events Explore: 6 unique query IDs; captured and historical provenance distinguishable. A captured query arriving on another date superseded its fallback, preserving authoritative timings.
- Identical sequential and concurrent POST reruns did not add rows. Final rerun preserved the canonical history object's ETag exactly.
- Existing compacted queries and recent pending raw events were skipped; raw events outside the nightly processing window could recover a retained DB fallback.
- Missing actor, warehouse error, database retention and additive Parquet schema cases were checked. Preview, other-org, in-progress and pre-execution-error records were excluded.
- Viewer GET/POST 403; another organization's admin could not access this backfill.
- Storage failure failed closed; safe manual retry succeeded after storage recovery.

Checks: 137 backend tests, 21 frontend tests, 167 warehouse reader tests; affected package typechecks, changed-file lint and formatting. Only focused suites were run.

Scope: retained Query Events plus current dimensions. Historical People activity summaries, legacy views, AI/token/export reconstruction and SQL/error exposure are excluded.

## Full retained history and automatic onboarding

New Analytics creation now queues initial processing before history backfill, on the same serial queue. The live test used an existing local organization without an Analytics project, with one retained query from 2024-02-01, one completed query from today, and one captured query already in storage.

- Clicking only Create queued initial job 435 (667ms), then backfill job 436 (1246ms), with no overlapping locks.
- Before any manual backfill POST or nightly run: 2 imported rows + 1 unchanged captured row; Settings 0 missing/3 existing/0 pending and no backfill action.
- A real Analytics metric query immediately returned those 3 unique identities and expected timestamps/timings.
- Calling create-or-get again returned created:false and queued no automatic processing/backfill jobs.
- Existing project retained its manual action for 2 additional completed-today records. Its manual job 456 succeeded in 1172ms; final availability 0 missing/7 existing/9 pending. Captured bytes remained unchanged and prior history was preserved.
- Real-engine regressions additionally cover a month of captured partitions plus older database history and gaps within already populated dates. Imports cover all retained eligible history through the run-start instant, with no age floor or enablement cutoff.

Recent raw-only events still follow normal closed-day processing. The historical import writes Parquet and current dimensions directly; its imported rows require no additional compaction.
