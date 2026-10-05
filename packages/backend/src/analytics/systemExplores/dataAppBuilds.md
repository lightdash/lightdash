# Data app builds

`data_app_builds` has one row per organization, project, app and version with an
observed build start or terminal outcome. It reads the existing `data_app_events`
and `ai_usage` partitions. There is no new compaction stage, backfill or schema
version bump. Late outcomes can join earlier starts on the next query.

Use **Apps → App name**, **Users → User name**, **Activity at → Week**, and
**Total builds / Completed builds / Failed builds / Total tokens used** to compare
build activity and captured consumption. Keep App UUID and Builder UUID when
identical names must remain separate. Names come from the current inventory.

For consumption by concrete model, use **AI usage** with App name, App version,
Model, and Total tokens used. Filter Feature to `data-app` and Function ID to
`appClaudeGeneration` / `appClaudeCompaction`. This detail can summarize several
coding-agent invocations for one model. The build's Requested model is the tier
or model requested, not necessarily every model used by subagents.

## Semantics and limits

- Repeated lifecycle delivery does not create another build. Token records are
  deduplicated by organization and event ID before joining, so multiple models
  do not multiply build counts. Existing AI usage metrics keep their raw-event
  meaning; duplicate delivery can therefore produce a different raw total.
- AI usage is the sole token source. The already-fixed resumed-session accounting
  emits deltas (ZAP-1156); terminal lifecycle token summaries are not added again.
  New app/version attribution is captured going forward, so old cumulative or
  unlinked AI usage cannot be attributed to builds by guesswork.
- Captured usage is not a billing completeness guarantee. Failed builds may emit
  partial usage; cancelled builds currently do not guarantee usage capture.
  No linked usage leaves tokens null, not zero. Cache reads/writes are included
  in input tokens; do not add them on top. No monetary cost is estimated.
- Activity at is the captured start, falling back to outcome time if the start
  is outside retained history. Start observed exposes that distinction. Pending
  means no retained outcome, not a claim that a worker is currently running.
- Duration measures recorded worker time for completed/failed builds; scheduler
  wait is separate. Cancellation elapsed time has different semantics and is not
  included. A cancellation actor is never used as a fallback builder.
- Restores, uploads, promotions and views alone do not create build rows.
  Older files have null newly-added fields and remain queryable without rebuild.
- Complete per-invocation and cancellation accounting remains on PROD-11658.
  Readership/preview classification and estimated spend are separate slices.

Example request body for `POST /api/v2/projects/{analyticsProjectUuid}/query/metric-query`:

```json
{
    "context": "api",
    "query": {
        "exploreName": "data_app_builds",
        "dimensions": [
            "lightdash_users_name",
            "lightdash_apps_name",
            "data_app_builds_activity_at_week"
        ],
        "metrics": [
            "data_app_builds_total_builds",
            "data_app_builds_total_tokens_used"
        ],
        "filters": {},
        "sorts": [],
        "limit": 500,
        "tableCalculations": []
    }
}
```

Poll the returned query UUID through the normal query results endpoint. The
Explore expands its read-time model SQL automatically.
