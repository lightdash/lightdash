# Daily job generation monitoring POC

`generateDailyJobs` exports two Prometheus metrics when
`LIGHTDASH_PROMETHEUS_ENABLED=true`:

| Metric                                                                      | Meaning                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lightdash_scheduler_daily_job_generation_last_completed_timestamp_seconds` | Unix time when the last pass reached the end, after scheduled-delivery generation and the pre-aggregate generation batch. Zero until this process completes a pass.                     |
| `lightdash_scheduler_daily_job_generation_errors_total{phase}`              | Errors during generation: one per failed scheduler (`scheduler`), one when loading schedulers fails (`load_schedulers`), or one when the pre-aggregate batch rejects (`pre_aggregate`). |

A completion is a heartbeat, **not a success guarantee**. Partial failures and
even a pass where all schedulers fail still update it after reaching the end;
the separate error counter detects these failures. An early scheduler-list
failure, a hung pass, or a process crash does not update it. An empty scheduler
list still produces a heartbeat. Existing job success/retry behavior is unchanged.

The counter counts failed scheduler generation after the built-in transient
retries are exhausted (or immediately for a non-retryable error). Transient
errors that recover within those retries do not increment it. Re-running the
whole daily task can count the same scheduler again; this is not a count of
unique schedulers or delivery execution failures.
Errors swallowed inside individual pre-aggregate definitions remain
in their existing logs; the batch error phase only counts errors propagated to
the worker. This POC does not implement the delivery-execution failure-spike
alert from PROD-11446.

## Per-instance collection

The cloud repository already enables Prometheus in
`customer-deployments/src/helmValues/defaults.ts`. Its CDKTF definition in
`customer-deployments/src/customer.ts` creates a `PodMonitoring` resource in each
instance namespace, scraping Lightdash API and worker pods on port 9090 every
30 seconds. No extra outbound HTTP call, credentials, instance identifier, or
Terraform resource is needed for these metrics in those deployments.

Use the collector's `project_id`, `location`, `cluster`, and `namespace` labels
to identify a Lightdash instance. The Prometheus `instance` label identifies a
scrape target, not a Lightdash deployment. Aggregate across pods: only the
process that executes the daily task updates its timestamp; other processes
export zero. Check deployments outside this CDKTF path separately.

## Proposed GCP alerts (not provisioned)

After deploying the instrumentation, confirm both metrics and their labels in
Cloud Monitoring Metrics Explorer. Create two PromQL alert policies per
instance in Monitoring → Alerting → Create policy → PromQL. Substitute all four
scope placeholders below with the observed labels. Use a 60-second evaluation
interval, a zero-second retest window, and the team's chosen notification
channel. Include the instance name in each policy's display name/documentation.

**Daily heartbeat overdue:** start with a 25-hour maximum age, allowing roughly
one hour beyond the daily cadence. This compares the timestamp's value with the
current time; it does not test whether scrapes are arriving.

```promql
time() - (
  max(max_over_time(
    lightdash_scheduler_daily_job_generation_last_completed_timestamp_seconds{
      project_id="PROJECT", location="LOCATION", cluster="CLUSTER", namespace="NAMESPACE"
    }[25h]
  )) or vector(0)
) > 25 * 60 * 60
```

The historical maximum retains a completion from a replaced pod. The zero
fallback also alerts when the instance has no samples at all. Keep this query
scoped to exactly one instance: replacing the scope with a fleet-wide sum/max
would let a healthy instance hide a failed one. Enable it after the instance's
first observed completion, or expect an initial incident before its first run.

**Generation errors:** initially alert on any error in the last 15 minutes.
The threshold is a proposed starting point, not an established production
baseline. Change `> 0` to an agreed count if only spikes should notify.

```promql
sum(increase(
  lightdash_scheduler_daily_job_generation_errors_total{
    project_id="PROJECT", location="LOCATION", cluster="CLUSTER", namespace="NAMESPACE"
  }[15m]
)) > 0
```

`increase` handles counter resets before aggregation and extrapolates between
scrapes, so its value is an estimate, not an audit count. Retries can count the
same scheduler again. Error alerts clear after the window; that does not prove
the affected scheduler was repaired.

GCP's standard metric-absence condition is limited to 23.5 hours. The timestamp
query above uses a 25-hour history with no retest window, within the documented
PromQL limit without relying on the longer-lookback preview:
[GCP metric absence](https://docs.cloud.google.com/monitoring/alerts/metric-absence),
[GCP PromQL alerting](https://docs.cloud.google.com/monitoring/alerts/using-promql),
[Prometheus query functions](https://prometheus.io/docs/prometheus/latest/querying/functions/).

## Cloud repository follow-up

No CDKTF changes are needed for deployments with the existing scraper. The
cloud repository manages alert policies separately as JSON under `gcp_alerts/`,
using the Monitoring API format and `managed_by` / `policy_key` user labels.
When approved, add the two policies there following its `CLAUDE.md`; merging
to main deploys policies to production and staging. The deploy script removes
notification channels in staging but does not rewrite project/cluster filters,
so ensure each policy's scope is appropriate for its target project.

The application change does not provision policies. Policies created separately
for validation should stay scoped to synthetic test metrics, with notifications
off, and be disabled after testing.

## Validation and limits

Run the documented PromQL expressions locally with simulated time:

```sh
node scripts/test-scheduler-monitoring-alerts.mjs
```

This requires Docker and runs `promtool` from `prom/prometheus:v3.14.0` in a
temporary container with networking disabled. The first run downloads the image.
It extracts the queries above and checks 14 scenarios, including the 25-hour
boundary, missing/zero metrics, instance isolation, pod replacement, recovery,
partial failures, counter resets, and errors leaving the alert window. Simulated
days take seconds; no Lightdash database or running application is required.
This verifies PromQL rule behavior, not GCP ingestion or notification delivery.

Before enabling notifications, observe a successful scheduled pass in a test
instance, a partial generation failure, and a worker restart after a completion
has been scraped. Confirm that the timestamp stays unchanged while idle, the
error counter increases, and the historical query retains the previous pod's
completion. Check the heartbeat expression with a deliberately nonexistent test
namespace to verify missing-series behavior.

The exact queries and incident open/close cycle were verified in GCP staging on
2026-09-23 using controlled Prometheus samples and no notification channels.
Both incidents opened and closed automatically; the test policies were then
disabled. Healthy-instance isolation and the missing-instance fallback were also
verified. Ingestion from deployed Lightdash workers and notification delivery
still need validation. Allow several minutes for GCP incident evaluation and
recovery, even with a 60-second evaluation interval.

These are in-memory metrics: if a process exits before the next scrape, its last
update can be lost. A counter increment before the first baseline scrape may
also be missed by `increase`. A durable database-backed heartbeat could remove
the restart gap later. This heartbeat verifies execution of generation, not the
expected number of jobs, successful delivery, worker capacity, or delivery
latency. Keep existing worker-health alerts and inspect generation/delivery logs
when either proposed policy fires.
