# Managed pre-aggregate refresh lifecycle

Managed pre-aggregates keep a compatible, usable active materialization across
project deploys. This avoids running the same warehouse aggregation after an
unrelated model or presentation change. External pre-aggregates remain managed by
the customer and never enter this lifecycle.

## Refresh behavior

| Event                                                                                   | Materialize against the warehouse?                                                                     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| First compile, changed effective definition, missing or unusable active materialization | Yes                                                                                                    |
| Unchanged compile with a verified compatible, usable active materialization             | No, whether or not `refresh.cron` is configured                                                        |
| Cron or manual refresh                                                                  | Yes, even when the definition is unchanged                                                             |
| A prior refresh failed, but a compatible active materialization remains usable          | Skip the unchanged compile; retain the active materialization and report the failed attempt separately |
| Invalid definition or preview project                                                   | No automatic materialization or scheduled refresh                                                      |

Without a cron schedule, source-data updates need an explicit manual or API
refresh. An unchanged deploy no longer refreshes those data. Definition
compatibility does not prove data freshness: warehouse tables can change without
changing the query. A relative-date definition likewise keeps its current data
until a forced refresh evaluates it at the real execution time.

No new YAML option, refresh endpoint, or CLI upgrade is required. The existing
project-wide and named-definition refresh APIs remain forced refreshes. Their
response contains scheduler job IDs and acknowledges scheduling, not completed
materialization. This feature does not add model-scoped orchestration or a new
webhook integration.

## Compatibility and publication

The desired compatibility metadata is prepared before publishing the compiled
explores. The aggregation query uses the same compiler as warehouse execution,
with a fixed reference clock and canonical effective relative-date descriptors
for comparison. The comparison also includes the effective execution context and
physical output contract. Presentation metadata and the refresh schedule are not
part of compatibility.

The ordinary query-history cache key remains unchanged. It represents an exact
query execution and its cache lifetime, which is distinct from long-lived
materialization compatibility. Compact provenance is retained on the
materialization so query-history cleanup cannot erase this decision evidence.

Full, streamed, and partial publication preserve a definition's stable logical
identity and compatible active materialization. The worker checks the current
definition and active materialization before warehouse execution; an enqueue-time
check alone is insufficient. Promotion and serving validate the current
definition contract so a result from an older publication cannot become active
for a changed definition.

## Authentication modes without a verifiable principal

Cross-deployment reuse requires a verifiable warehouse identity. When an adapter
only exposes opaque credentials, refreshes remain supported but the compatibility
hash stays null. Every deploy therefore materializes again, and serving and
promotion are restricted to the publication that produced the output.

Where available, a server-keyed digest binds the actual configured refresh grant
to the actor and selected credential source. BigQuery ADC reads that grant from
the actual SDK-loaded credentials, and checks the actual execution client again
before submission. A digest is internal execution metadata; it is never a
compatibility fingerprint and never exposes raw credentials.

Some ambient identity providers expose neither a principal nor a stable grant,
including direct Google federation without service-account impersonation and
some default credential chains. Those retain their existing adapter authorization
and refresh behavior. A separately domain-tagged digest checks the actor and
configured connection only; it does not claim to detect an ambient principal
changing behind that configuration. These modes cannot reuse materializations
across deployments. Requiring verifiable identity for these existing modes would
be a separate behavior change.

## Scheduling and overlapping work

Cron refreshes run as the Lightdash project creator, including jobs reconciled
after deployments or scheduler-timezone changes. A project without a creator has
no cron execution account, so these jobs are not enqueued. Deploy-triggered
refreshes use the deploying account; manual/API refreshes use the caller.
Warehouse credentials follow the normal project/organization and personal
credential selection rules for that account. `materializationRole` changes
Lightdash email/user-attribute evaluation, not the warehouse login.

`SchedulerClient` sends all triggers for one definition to the named Graphile
queue `preagg:<definition UUID>`. Existing coalescing is preserved: compile,
manual, and webhook jobs use a key per trigger; cron jobs use a key per scheduled
timestamp. Jobs retain one attempt.

The named queue reduces overlap but is not a correctness lock. The scheduler's
timeout does not cancel an already-running warehouse request, so publication and
promotion checks must also handle work that finishes after a timeout.

Cron payloads carry a schedule revision. A change or removal of cron, scheduler
timezone, or automatic eligibility reconciles pending cron jobs independently of
compile materialization. `reconcilePreAggregateCronSchedule` cancels unlocked
pending cron jobs, then schedules remaining occurrences for the current day when
the definition remains eligible. Locked work checks its revision before warehouse
execution. After activation, obsolete revisions, including legacy cron payloads without a
revision, are skipped. The compatibility phase still accepts unstamped cron jobs
from older schedulers while checking that the definition remains eligible. Daily generation selects valid managed definitions in non-preview
projects and ignores definitions without an initialized schedule revision.

Removing cron does not force materialization after an unchanged deploy. It stops
future scheduled refreshes; subsequent data freshness depends on manual/API
refreshes. Changing cron or scheduler timezone does not invalidate an otherwise
compatible active materialization.

## Monitoring

Project Settings shows the current compatible materialization separately from the
latest materialization attempt. A failed latest attempt can coexist with an older
usable active materialization. The active timestamp, row count, columns, and file
size describe the current materialization. The detail drawer reports the latest
attempt's trigger and error separately.

A skipped scheduler check does not create a materialization record. Its scheduler
log is `COMPLETED` with `materializationStatus: skipped` and a `skipReason`, such as
`unchanged_active` or `obsolete_schedule`. Real attempts preserve the existing
`materializationStatus` and materialization/query UUIDs. Consumers of scheduler
status must inspect the materialization outcome: a completed scheduler job can
contain a failed materialization result.

## Phased rollout and rollback

This change affects persisted identity, query execution, and upgrade
compatibility. It requires human peer review and the normal approved deployment
workflow.

The beta behavior change does not need a deprecation period, customer opt-in
setting, or separate customer-facing compatibility release. The steps below
protect database state and in-flight work during an upgrade. A controlled upgrade
with old processes stopped can install the final code in one release.

1. Apply the additive schema migration in `compatibility` phase. Deploy the new
   API and scheduler code while compile materialization continues on every deploy.
   Do not activate reuse while old API or worker processes can still publish
   definitions or materializations.
2. Drain or stop old writers and in-flight jobs. Run the explicit activation
   operation after all API and worker instances run the compatible release. The
   activation operation verifies the contract and switches the persisted reuse
   phase to `active`; it is not an automatic schema migration. The operator
   command is shown below. It records the attributed operator or deployment
   identity. The confirmation is an explicit assertion about stopped old
   writers, not an automatic discovery of running application versions.
3. Reconcile schedules and validate in an isolated deployment before enabling a
   shared installation. Activation applies to the database, not one project.
   A legacy materialization with
   unknown compatibility requires one verified materialization on the next
   compile. Do not invent a hash from an old query-history row or accept unknown
   provenance as a match.
4. Check a second unchanged deploy produces a completed `unchanged_active`
   scheduler outcome without a warehouse aggregation, and matching queries still
   serve the active materialization immediately. Exercise both scheduled and
   unscheduled definitions. Verify manual refresh and the next cron occurrence
   still create new materializations.
5. Change a definition and confirm its older materialization cannot serve the new
   contract. Exercise a failed refresh while a compatible active materialization
   remains, a removed schedule, a timezone change, and a preview project. Watch
   materialization failures, execution fallbacks, skipped outcomes, and warehouse
   query volume before expanding rollout.

Run the activation command through the approved deployment workflow, using the
release's normal database configuration. From the repository root with built
production packages:

```sh
NODE_ENV=production node packages/backend/dist/scripts/activate-pre-aggregate-reuse.js \
  --actor "<operator-or-deployment-identity>" --compatible-writers-confirmed
```

For local development verification:

```sh
pnpm -F backend exec tsx src/scripts/activate-pre-aggregate-reuse.ts \
  --actor "<operator>" --compatible-writers-confirmed
```

The command delegates to `activatePreAggregateReuse` in
`packages/backend/src/ee/database/activatePreAggregateReuse.ts`. It is safe to
retry after an interrupted activation. The expand migration refuses a destructive
down migration after activation.

For a forward rollback, disable reuse with the operator command:

```sh
NODE_ENV=production node packages/backend/dist/scripts/activate-pre-aggregate-reuse.js \
  --actor "<operator-or-deployment-identity>" --disable-reuse
```

This sets `reuse_enabled` to false, restoring compile materialization on every
deploy while preserving `phase: active`, stable identity, schedule revision
checks, and serving/promotion guards. Never reset the phase to `compatibility`
after activation: that phase exists only for the initial mixed-version rollout.
Do not roll back to old writers or destructively remove provenance to recover
service. Existing cron and manual refreshes remain available while investigating.
After verification, use the same operator command with `--enable-reuse` to
resume compile skipping. Both switches require an attributed `--actor` and an
already activated schema; neither changes the schema phase.

## Main implementation locations

- `packages/backend/src/services/ProjectService/ProjectService.ts`: publication
  and independent schedule reconciliation.
- `packages/backend/src/ee/models/PreAggregateModel.ts`: durable identity,
  provenance, current materialization selection, and rollout phase.
- `packages/backend/src/ee/services/PreAggregateMaterializationService/PreAggregateMaterializationService.ts`:
  authoritative worker checks and forced refresh execution.
- `packages/backend/src/scheduler/SchedulerClient.ts` and `SchedulerTask.ts`:
  queue keys, schedule reconciliation, revision payloads, and outcomes.
- `packages/frontend/src/components/PreAggregateMaterializations/`: current
  materialization and latest-attempt monitoring.
