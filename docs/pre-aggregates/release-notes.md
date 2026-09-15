# Pre-aggregate deployment reuse

Pre-aggregates are an Enterprise beta feature. This release changes deployment
refresh behavior without a deprecation period or a customer opt-in setting.

After the controlled reuse activation, deploying an unchanged managed pre-aggregate reuses its verified active materialization, with or without a cron schedule. New or changed definitions and missing or unusable materializations still build automatically.

An unchanged deployment no longer requests fresh warehouse data. Use an existing cron schedule, manual/API refresh, or an existing webhook refresh to fetch data changes. Changing rows or dbt transformations behind an unchanged warehouse relation does not change query compatibility.

Refresh history survives deployment. Monitoring shows the compatible active materialization separately from the latest refresh attempt, so a failed refresh does not hide an older usable result. Relative filters keep their logical compatibility as time advances; each refresh evaluates fresh dates.

There is no new YAML option, endpoint, or CLI refresh command. Older deployment payloads remain accepted; definitions without trustworthy compiler provenance are refreshed conservatively until recompiled. Authentication modes that cannot establish a verifiable principal keep refreshing on every deployment and retain their existing adapter authorization; they are excluded from cross-deployment reuse.

Upgrade all API, scheduler, and query workers before activating reuse. A rolling upgrade retains the existing refresh behavior while older writers are present. A controlled upgrade with old writers stopped can install the final code in one release. Disabling deployment reuse after activation keeps the final schema and serving/promotion guards. See [rollout and rollback](refresh-lifecycle.md#phased-rollout-and-rollback).
