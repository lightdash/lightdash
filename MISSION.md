# Mission: Understand Lightdash Backend Query Generation

## Why
Irakli needs a durable mental model of Lightdash backend SQL/query-builder systems so he can safely reason about changes involving fanouts, period-over-period, pivot queries, distinct metrics, and CTE composition.

## Success looks like
- Explain the boundary between `MetricQueryBuilder`, `PivotQueryBuilder`, and `AsyncQueryService.runQueryAndTransformRows`.
- Predict when joins cause metric inflation and how Lightdash fanout protection responds.
- Trace one generated output alias through CTE scopes back to base SQL.
- Explain period-over-period as shifted metric computation joined back to current rows.
- Explain why pivot SQL stays long and how row/column indexes become wide pivot output.

## Constraints
- Teach from repository code and Lightdash documentation, not generic BI lore.
- Use small concrete datasets before abstract code.
- Keep each lesson printable, visual, and reviewable.
- Do not read `packages/formula-tests/`.

## Out of scope
- The current bug/PR except as motivation.
- Full frontend pivot rendering internals beyond backend query transformation.
- Warehouse optimizer deep dives unless required for conceptual correctness.
