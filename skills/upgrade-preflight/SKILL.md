---
name: upgrade-preflight
description: Checks whether a self-hosted Lightdash upgrade is safe to run, and reads the tooling's answer without over-reading it. Use when upgrading a self-hosted instance, planning a maintenance window, answering "is this upgrade safe", or recovering a failed, hung, parked or lock-stuck migration — covers `lightdash upgrade-check` and `migrate preflight`, how to gate on their exit codes and JSON, and the readings that look calm but mean "could not check".
---

# Upgrade preflight

Decide whether a self-hosted Lightdash upgrade is safe to run, and report the answer accurately.

## Scope

**Use this when** helping an operator upgrade a self-hosted instance: choosing a target version, planning a window, gating a pipeline, or recovering a migration that failed or hung.

**Don't use this for** Lightdash Cloud (upgrades are managed), dbt or semantic-layer work, or developing Lightdash itself.

The human-facing references are [upgrade safety](https://docs.lightdash.com/self-host/upgrade-safety) (what the signals mean) and the [upgrade runbook](https://docs.lightdash.com/self-host/upgrade-runbook) (execution sequences, per-platform invocation, recovery, rollback). This skill is the agent-facing layer: what to run, what to branch on, and what not to conclude. Link the operator to those pages rather than paraphrasing them.

## Vocabulary

One term per concept, matching the docs: a **span** is a from-version to a to-version; **verdict** is `upgrade-check`'s answer about a span; a **check** is one item the preflight reports; **decision** is the preflight's overall answer; the **lease** is the row a migrating node holds while it works.

## Two layers, in this order

Two commands. They answer different questions and neither substitutes for the other.

|            | `lightdash upgrade-check`                                      | `migrate preflight`                                                          |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Question   | Is this **span** safe in principle?                            | Will **this database** take it right now?                                    |
| Where      | Anywhere — the `@lightdash/cli`, no login, no database         | Inside the image, with database env credentials                              |
| Reads      | The public release-safety index on GitHub                      | The live database + the artifact baked into the image                        |
| Invocation | `lightdash upgrade-check --from 1.130.0 --to 1.138.0 [--json]` | `pnpm -F backend migrate-production preflight [--json] [--strict] [--force]` |

**Run `upgrade-check` first.** It is the decision layer: it can tell the operator not to attempt the span at all, or that they must stop at an intermediate release, before anyone touches the instance. `migrate preflight` is the execution layer and cannot see the span — it knows only the image it runs in and the ledger in front of it. A preflight `decision` of `proceed` never licenses a span whose `verdict` was not `true`.

## Gate on exit codes and JSON

Both commands print human text by default and a machine payload under `--json`. Branch on the exit code, then read named fields — not the rendered text. The words `RED`, `UNSAFE` and `abort` all appear in the prose of runs that are fine, and the human renderer is not a contract.

**Exit codes are binary in both commands: `0` success, `1` everything else** — an unsafe verdict, an aborted decision, or an error such as an unreachable index or a rejected flag. There is no severity ladder in the exit code; the severity lives in the payload. A non-zero exit means "stop and read the payload", never "this specific thing went wrong".

**`upgrade-check`** — branch on `safe` (boolean). It is `true` only when `verdict` is `true`, `requiredStops` is empty, and the from-version is not below `minPreviousVersion`.

- `verdict` is tri-state: `true`, `false`, or `"unknown"`. **`"unknown"` is not a pass** — a release in the span is unindexed or indexed as unknown, so the command fails closed. Report it as **"cannot verify this span"**, never as "clear" or "probably fine". This is the output most likely to be mis-summarised into an all-clear.
- `requiredStops` non-empty means the span must be split into several upgrades, not that it is forbidden.
- A rollback span is rejected with an error rather than a verdict; rollback guidance is in the runbook.

**`migrate preflight`** — branch on `decision`: `proceed`, `proceed-with-warnings`, `abort`, or `force-proceed`. Equivalently, gate on `summary.red` and `summary.yellow`.

- `severity` is the **class of a check, not its result.** `postgres-version` is always a red-class check; on a healthy server it reports `{"severity": "red", "outcome": "pass"}` and renders as `[RED PASS]`. Only `severity: "red"` **with** `outcome: "fail"` is a failure — that pairing is what `summary.red` counts. Read `outcome`, or read `summary`.
- `summary.red > 0` ⇒ `abort` (or `force-proceed` if `--force` was passed). `summary.yellow > 0` alone ⇒ `proceed-with-warnings`; under `--strict` ⇒ `abort`. `info` checks never gate.
- The payload prints **before** the command exits, so on an `abort` you get the full JSON on stdout and the reason on stderr with exit 1. Parse the payload rather than treating the exit code as opaque.
- `migrate up` runs this same gate internally before claiming the lease, so a red check blocks the upgrade whether or not anyone ran preflight first. Running it separately buys the answer _before_ the window, not a different answer.

Full worked payloads for both commands, with every field annotated: [output reference](./resources/output-reference.md).

## The readings that look calm but are not

**`proceed-with-warnings` is not `proceed`.** It is a distinct decision and it exits 0. Every yellow check is something a human chose to be told about — surface each one with its `message`, rather than collapsing the run to "preflight passed".

**A `version-path` yellow means the image cannot verify its own upgrade path.** `{"id": "version-path", "severity": "yellow", "outcome": "warn"}` means no baked `release-safety.json` was found. Required-stop verification was _skipped_, not satisfied — and because that artifact is also what tells the preflight which tables the pending migrations touch, its absence blinds three more checks:

- `held-locks` and `long-transactions` get no table list, so they report **pass** — "No other sessions hold relation locks on pending-migration DDL tables" — having looked at nothing.
- `disk-headroom` reports pass with `data.applicable: false`.
- Every `pending-migrations` entry carries `metadataAvailable: false` and an empty `tables` array.

An artifact-less image therefore produces one yellow and three reassuring passes. **When `version-path` warns, describe the lock, transaction and disk checks as unverified rather than clear**, and rely on `upgrade-check` for the span question — it reads the public index and does not depend on the image. `metadataAvailable: false` on individual migrations means the same thing at a finer grain.

**A quiet activity reading can mean "could not look".** `held-locks` and `long-transactions` report `outcome: "warn"` with a non-null `data.probeError` when the probe itself failed — a restricted role, a dropped connection — and `data.locks` / `data.transactions` are empty in that case exactly as they are in a clean read. Check `probeError` before describing a table as quiet.

**A `disk-headroom` pass has three meanings.** Read `data`: `applicable: false` means no pending migration is known to scan or rewrite, so nothing was measured; `source: "unavailable"` means PostgreSQL cannot report free space and no external signal was configured (the operator sets `MIGRATION_PREFLIGHT_DISK_HEADROOM_BYTES` to give the check a number to compare against `data.minimumBytes`). Only `source: "configured"` with sufficient `availableBytes` is a measured pass.

**A fresh-install pass says nothing about upgrading.** An empty `knex_migrations` ledger makes `version-path` pass with "this is a fresh install rather than an upgrade path" — a statement about the ledger, not a verdict on a span.

**Severity encodes consequence, not size.** `pending-migrations` is `info` however many migrations it lists, and a single held `AccessExclusiveLock` on a small table is a yellow worth stopping for. Rank findings by what they do, never by counts in the payload — and note the preflight emits **no** timing or row-count figures at all, so any duration quoted for a migration window is invented. Describe the shape of the risk and let the operator time it.

## Decisions that belong to the operator

Four actions are deliberately reserved for a human. The agent's job in each is to produce the evidence and hand over.

- **`--force`** — report the failing checks from the `abort` payload and stop there. It is the operator's override: pass `--force` only when they instruct it after seeing those checks, and echo back which checks are being overridden first. It converts an `abort` into `force-proceed`, exits 0, and prints an override banner to stderr.
- **`--actor`** — `migrate unlock` requires an attribution string, and it is written into the lease and run history as the person who cleared it. Ask the operator for their identity and pass exactly that (`--actor "alex@example.com"`); a placeholder, a hostname or the agent's own name would attribute the unlock to someone who did not authorise it.
- **A parked lease** — `parked` means the migrator exhausted its retries and stopped on purpose, and it refuses to re-run the same app version. Report the parked state with its failing migration and error, and point to the runbook's recovery section. Retrying is the operator's call once the cause is fixed or a corrected version is deployed.
- **Remediation SQL** — the preflight reports conditions and emits no fix script. Hand each finding to the operator and their DBA rather than composing DDL from it.

The verdict is deterministic for a given index, so a re-run that disagrees means the span or the index changed — not that the first answer was noise.

## Upgrade checklist

Copy this into the working notes and tick as you go:

```markdown
- [ ] Operator has confirmed a database backup (there are no down-migrations)
- [ ] Span checked: `upgrade-check` returns `safe: true` (or every required stop planned as its own hop)
- [ ] Preflight run against the instance: `decision` is `proceed`, or every yellow check surfaced and accepted by the operator
- [ ] Upgrade executed per the runbook for this platform
- [ ] Migrations finished: `migrate status --json` shows `state: idle` with no pending migrations
- [ ] Readiness verified: `/api/v1/readyz` returns 200
```

## Running the commands

Run these exactly as written, substituting only the `<angle-bracket>` placeholders. `upgrade-check` runs anywhere the CLI is installed; the `migrate` commands must run **inside** the image, with the database environment present.

```bash
# 1. Check the span (no login, no database access needed)
lightdash upgrade-check --from <current-version> --to <target-version> --json

# 2. Preflight — Kubernetes, as a one-off run
kubectl exec deploy/<release>-lightdash -- \
  pnpm -F backend migrate-production preflight --json

# 2. Preflight — docker compose, in a throwaway container
docker compose run --rm --entrypoint pnpm lightdash \
  -F backend migrate-production preflight --json

# 3. Inspect state at any point
kubectl exec deploy/<release>-lightdash -- \
  pnpm -F backend migrate-production status --json

# 4. Verify readiness after the upgrade
curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/api/v1/readyz
```

**In CI, add `--strict`** so warnings block the pipeline rather than passing with a decision no one reads.

Preflight opens a database connection but changes nothing, so it is safe to run ahead of a window. Prefer a one-off Job over exec-ing into a serving pod when you want a clean run — the runbook has the full manifests, the Helm sequence and the readiness checks.

## When a migration is already in flight

`migrate status [--json]` reports a `state` of `idle`, `migrating`, `stale` or `parked`, plus the lease holder and run history.

- `migrating` with a recent heartbeat is healthy work in progress — wait.
- `stale` recovers on its own when another node takes over the expired lease.
- `parked` is the operator's call (above).

`migrate wait [--timeout-ms <ms>]` blocks until migrations finish (default 30 minutes, or `MIGRATION_WAIT_TIMEOUT_MS`) and takes over an expired lease. Give a hung migration time before anyone touches the lease; the runbook's recovery section is the authority on what comes next.
