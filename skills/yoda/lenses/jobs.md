# Jobs

## Review

- **Skip when:** schedule CRUD (API), or delivery rendering (Integrations).
- **Worst case:** a delivery sent twice or never, a job locked or silent for an hour, or a retry storm after a deploy.
- **idempotent:** a second or concurrent run does no harm.
  Check `jobKey` (delivery keys hash the payload; send-now has none) and `jobKeyMode` (`preserve_run_at` vs `unsafe_dedupe` on a locked or exhausted job).
  Reruns write the same output keys.
- **retries bounded:** `maxAttempts` defaults to 1 (`SCHEDULED_JOB_MAX_ATTEMPTS`); more needs a reason and must not repeat costly work.
  Retry layers (Graphile, client, a loop in the task) multiply; count them.
  Users hear only on `isFinalAttempt`.
- **error class:** a transient error (network, database, quota) is retried; a permanent one disables with a notice; a database error is never treated as a refusal.
- **failure visible:** a failure reaches the run history and any user waiting on it; daily generation never skips a day silently.
- **state and queue together:** the job change and the state change share a transaction, or the enqueue comes before marking done.
- **dead workers:** a restart, deploy or migration neither strands nor doubles a job: drain on shutdown, check `locked_at` age, give long single-attempt jobs a reaper.
- **timeouts:** `tryJobOrTimeout` stops the wait, not the task; a long task takes an abort signal and frees its slot and query.
- **pool:** a task holds at most one connection and no transaction across a warehouse or render wait.
- **scale:** fan-out uses a named queue (`delivery:<orgUuid>`) and bounded concurrency; a shared cron minute at the largest org must not starve alerts.
- **worker-only methods:** code that runs with no caller re-checks the user's permission and fails loudly on missing data.
- **payloads:** typed in `schedulerTaskList.ts`, plain JSON with dates as strings, registered in `SchedulerWorker` and gated by `scheduler.tasks`.

## Impact

- **breaking:** queued jobs can't use a removed/renamed task or changed payload.
- **notable:** new job or trigger.
- **minor:** retry count/delay.

## Diff

```ts
type JobDiff = Diff & {
    trigger: string;  // 15 min, hourly, daily, on <event>, self when it queues itself again, or none
    retries?: string;  // the attempt count (`maxAttempts`)
};
```

- **Name:** the exact task identifier (graphile `task_identifier`).
- **Granularity:** one diff per job and trigger: a job with two triggers gets two.
- Delays, payload fields or manual buttons go in the note or a finding.

```json
{ "lens": "Jobs", "change": "added", "impact": "notable", "name": "compactUsageEvents", "trigger": "self", "retries": "3", "note": "rolls raw usage events into daily totals" }
```
