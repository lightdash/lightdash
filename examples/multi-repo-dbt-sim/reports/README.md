# Observed results

These runs use the product code at main revision `b7dd419f98`, seed 42,
on a local ldenv instance with Postgres. The CLI is built from that checkout.
The normal server runs use dbt 1.12.0. The dedicated 1.9 server project uses 1.9.10 for its whole graph. CLI dbt is 1.12.3 with dbt-loom 0.9.6. The older repo
uses a private dbt 1.9.10 environment. All inputs and returned rows are synthetic.

The [small JSON](main-small.json) and [small Markdown](main-small.md) preserve
source counts, config snapshots, operation timings, errors and warnings.
The [full JSON](main-full.json) and [full Markdown](main-full.md) record the
larger runs. Generated identifiers are redacted. Git discovery counts include
validation, failed attempts and retries; they are not completed-clone counts.

## Small matrix

| Scenario                                   | Expected on this baseline                                                                            | Observed                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Ring and stale-ref shape                   | Succeed after [#31313](https://github.com/lightdash/lightdash/pull/31313)                            | 19 explores; one resolver pass; seeded query returns three rows                                                                        |
| One-argument ambiguity control             | Fail clearly                                                                                         | Refresh fails with the ambiguous settlement ref; 19 last-good explores remain                                                          |
| Sequential CLI deploy                      | Replace sibling explores before reworked [#31326](https://github.com/lightdash/lightdash/pull/31326) | All six deploys succeed; totals 6 → 3 → 4 → 2 → 2 → 2                                                                                  |
| Explicit `--source` control                | Record the legacy flag's effect                                                                      | Same totals; each subsequent deploy with the flag still replaces the catalogue                                                         |
| Config absent                              | Parameters/categories can be lost                                                                    | Parameters 1 → 0 and tags 1 → 0; table groups and defaults stay                                                                        |
| Config partial                             | Parameters/categories can be lost                                                                    | Same loss when only spotlight visibility is supplied                                                                                   |
| Refresh after CLI                          | Remove CLI-only explores                                                                             | 19 → 7 after deploy → 19 after refresh; the local-only model disappears while the remote Git head stays unchanged                      |
| Unreadable repo                            | Fail the whole refresh before isolation work                                                         | 19 last-good explores remain; a healthy repo's new model is not published                                                              |
| Missing selector tag                       | Record behaviour before [#31283](https://github.com/lightdash/lightdash/pull/31283)                  | Refresh succeeds, removes the two marketing explores, and leaves 17                                                                    |
| Missing tag promoted to error              | Fail unless explicitly suppressed                                                                    | Refresh fails; the same checked-in flags succeed with `DBT_WARN_ERROR_OPTIONS={"error": []}` and leave 17 explores                     |
| Server collision                           | Rename both sides before naming work                                                                 | 17 → 20 explores; original ledger lookup returns HTTP 404 with two replacement names                                                   |
| CLI collision                              | Capture status before reworked [#31326](https://github.com/lightdash/lightdash/pull/31326)           | Both deploys succeed, without HTTP 409; the original ledger query returns the newcomer's rows                                          |
| Duplicate project names                    | Fail early in refresh; measure CLI inference                                                         | Refresh rejects the duplicate growth name; CLI deploy succeeds and campaign returns three marketing rows, but exposes no source marker |
| Versioned refs                             | Record extra parses if observed                                                                      | Consecutive cached runs take 22.3 s / 18.2 s, each with one pass and six dbt ls runs                                                   |
| Many sources                               | Record timing and Git pressure                                                                       | Six-source refresh succeeds; 11 Git discovery requests                                                                                 |
| dbt 1.9                                    | Execute both paths with the separate environment                                                     | CLI deploy returns two explores; dbt 1.9 refreshes the whole six-repo graph with 19 explores                                           |
| CLI join, upstream registered and deployed | Local compile may omit the external join                                                             | Compile/deploy succeed; join absent; the upstream explore is removed                                                                   |
| CLI join, upstream not registered          | Local compile may omit the external join                                                             | Compile/deploy succeed; join absent; upstream never becomes an explore                                                                 |
| Server join, both repos registered         | Resolve the same YAML join                                                                           | Refresh succeeds; join and upstream explore are present; the joined query returns three merchant rows                                  |

The legacy `cli-join` probe is retained alongside the three formal join cases.
The projects have one warehouse connection and database `connection_mode=single`.
Each scenario uses one project mode; the refresh-after-CLI case tests its named
crossover explicitly. No HTTP 409 is observed in these main runs. The records
also flag any message that recommends `--source`.

## Full matrix

The warehouse build completes in 11m 22s. Its final dbt run results contain
3,001 successful physical model nodes across 22 repos, matching the 3,000
logical models plus the additional versioned node. The canonical fixture has
177 duplicated names. All 22 seeds and every normal full-refresh run pass.

| Scenario              | Expected                        | Observed                                                                                                                                       |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold baseline         | Resolve the ring and mixed refs | 3,000 explores in 91.2 s; one pass; 22 dbt ls runs; zero cache rows loaded                                                                     |
| Many sources          | Compile all 22 sources          | 3,000 explores in 89.7 s; one pass; 43 Git discovery requests                                                                                  |
| Versioned refs        | Record resolver work and timing | 91.4 s cold / 82.7 s warm; one pass and 22 dbt ls runs each; cache rows 0 / 22                                                                 |
| Unreadable repo       | Record whole-refresh failure    | Refresh fails; all 3,000 last-good explores remain; the healthy addition is absent                                                             |
| Newcomer collision    | Record saved-chart behaviour    | 2,900 → 3,001 explores; the original saved chart returns HTTP 404                                                                              |
| Sequential CLI deploy | Record all 22 deploys           | All 22 succeed; totals 1,300 → 900 → 100 for each remaining consumer → 25 for each upstream; final catalogue has 25 explores, without HTTP 409 |

Times exclude load-gate waits and project setup. Resolver passes and dbt ls
counts do not instrument Python parser internals. No extra resolver pass is
observed in these literal versioned-ref cases. The seeded baseline query
returns three payments rows.

The compact JSON snapshots keep source counts, functional config, exact errors,
HTTP responses, passes and timings. They omit long explore-name lists, telemetry
context and redundant setup/build detail. Complete runtime records remain in
the ignored work directory. No global
`/tmp` peak is attributed to this fixture while other instances share the host.

## Findings

The CLI drops a valid cross-repo Lightdash join in both source-registration
cases. Run `run --skip-build --scenarios cli-join-connected cli-join-unconnected server-join`
after the warehouse build. Both downstream CLI manifests contain
`model.merchants.merchant`, and the payments node depends on it. Both deploys
report `ERRORS=0` and `PARTIAL_SUCCESS` for payments. The returned payments
explore has no merchant table or join. Server refresh contains both. This
verifies the runtime difference. It supports the external-node exclusion
explanation without proving the internal cause from the output alone.

Both CLI cases emit this exact warning for payments and ledger:

```text
Join "merchant" to table "merchant" was skipped because the model is not available in this project. Check that the model exists, is included by the project's tags/selector, and compiles successfully, then refresh the project.
```

The warning is misleading in the connected case: merchant is already a
registered and deployed explore before the downstream compile. The following
full deploy also removes that upstream explore. The server comparison emits
no join warning or error.

The CLI collision can silently change a chart's data. Run
`run --skip-build --scenarios cli-collision`. The saved ledger query returns
`payments_sample_1` through `payments_sample_3` before the newcomer deploy,
then `marketing_sample_1` through `marketing_sample_3`. Both deploys exit zero.
The query still resolves. This is more dangerous than a visible missing-explore
error. Reworked [#31326](https://github.com/lightdash/lightdash/pull/31326) should turn this into a conflict; the fixture records
the actual HTTP status and message rather than assuming that result.

Server collision is visible: the original ledger lookup returns:

```text
Explore "ledger" was split into "dbt_project__ledger" and "marketing__ledger". Pick one.
```

The source-isolation probe retains the whole last-good catalogue when one
remote is unreadable, but it also blocks a valid new model in a healthy repo.
The pending isolation work should retain the failed source's last-good
explores while publishing the healthy change and warning about the failure.

No-config and partial-config deploys erase parameters and YAML spotlight tags,
while the two table groups and project defaults stay unchanged. This remains
separate from deploy replacement and collision work.

The missing-tag case without warning promotion succeeds on this pinned build
and removes the selected repo's explores. Warning promotion changes it to a
failed refresh. The suppression control keeps the checked-in promotion active
and changes only its environment override.

No product changes are included. These are dev-only fixture, script and report
changes. The fixture does not ship in the production or preview images or in
published npm packages.

Refs #31323
Refs #31113
