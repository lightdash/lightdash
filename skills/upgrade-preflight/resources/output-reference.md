# Output reference

Worked `--json` payloads and field meanings for the two upgrade commands. Read this when you need to gate on a field the [SKILL](../SKILL.md) does not spell out.

- [upgrade-check](#upgrade-check) — [safe span](#a-safe-span), [unverifiable span](#an-unverifiable-span), [fields](#upgrade-check-fields)
- [migrate preflight](#migrate-preflight) — [an abort](#an-abort), [a blind pass](#a-blind-pass), [the checks](#the-checks)
- [migrate status](#migrate-status)

## upgrade-check

`lightdash upgrade-check --from <current> --to <target> --json`

### A safe span

```json
{
  "fromVersion": "1.130.0",
  "toVersion": "1.138.0",
  "direction": "upgrade",
  "safe": true,
  "verdict": true,
  "requiredStops": [],
  "minPreviousVersion": null,
  "coveredVersions": ["1.131.0", "1.132.0", "1.138.0"],
  "missingRanges": []
}
```

Exit 0. Proceed to the preflight.

### An unverifiable span

```json
{
  "fromVersion": "1.118.0",
  "toVersion": "1.138.0",
  "direction": "upgrade",
  "safe": false,
  "verdict": "unknown",
  "requiredStops": ["1.123.0"],
  "minPreviousVersion": "1.110.0",
  "coveredVersions": ["1.123.0", "1.138.0"],
  "missingRanges": [{ "afterVersion": "1.123.0", "beforeVersion": "1.138.0" }]
}
```

Exit 1. Two separate things are true here and both must be reported: releases between 1.123.0 and 1.138.0 are absent from the index (so the span **cannot be verified**), and 1.123.0 is a required stop (so the upgrade must be run as two hops regardless). Neither is "unsafe" in the sense of a known-bad release — do not report it as one, and do not report it as clear.

### upgrade-check fields

| Field                | Type                              | Meaning                                                                           |
| -------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `safe`               | boolean                           | **The gate.** `verdict === true` and no `requiredStops` and not below the minimum |
| `verdict`            | `true` \| `false` \| `"unknown"`  | Rolling-update safety composed across the span. `"unknown"` fails closed          |
| `direction`          | `"upgrade"` \| `"same-version"`   | A rollback span throws instead of returning                                       |
| `requiredStops`      | string[]                          | Releases that must each be landed on in turn                                      |
| `minPreviousVersion` | string \| null                    | Oldest version the target can be upgraded from directly                           |
| `coveredVersions`    | string[]                          | Releases in the span the index does describe                                      |
| `missingRanges`      | `{afterVersion, beforeVersion}[]` | Gaps in index coverage; the reason a verdict is `"unknown"`                       |

## migrate preflight

`pnpm -F backend migrate-production preflight --json`

Every run emits all seven checks in a fixed order; the `checks` arrays below are abridged to the ones each example is about.

### An abort

```json
{
  "schemaVersion": "1",
  "decision": "abort",
  "force": false,
  "strict": false,
  "summary": { "red": 1, "yellow": 1, "info": 1 },
  "checks": [
    {
      "id": "version-path",
      "severity": "red",
      "outcome": "pass",
      "message": "The migration ledger structurally matches the target artifact direct-predecessor or up-to-date path",
      "data": {
        "artifactPath": "/usr/app/release-safety.json",
        "targetVersion": "1.138.0",
        "previousVersion": "1.137.0",
        "minPreviousVersion": null,
        "requiredStops": [],
        "completedMigrationCount": 812,
        "pendingMigrationsOutsideArtifact": [],
        "artifactError": null
      }
    },
    {
      "id": "postgres-version",
      "severity": "red",
      "outcome": "fail",
      "message": "PostgreSQL 11.19 is unsupported; version 12 or newer is required",
      "data": {
        "serverVersion": "11.19",
        "serverVersionNum": 110019,
        "minimumSupportedMajor": 12,
        "probeError": null
      }
    },
    {
      "id": "held-locks",
      "severity": "yellow",
      "outcome": "warn",
      "message": "2 held relation lock(s) may delay DDL on pending-migration tables",
      "data": {
        "tables": ["saved_queries"],
        "locks": [
          {
            "pid": 4821,
            "table": "saved_queries",
            "lockMode": "RowExclusiveLock",
            "transactionAgeSeconds": 12
          }
        ],
        "probeError": null
      }
    },
    {
      "id": "pending-migrations",
      "severity": "info",
      "outcome": "info",
      "message": "3 pending migration(s)",
      "data": {
        "migrations": [
          {
            "name": "20260801120000_add_column.ts",
            "transaction": true,
            "tables": ["saved_queries"],
            "metadataAvailable": true
          }
        ]
      }
    }
  ]
}
```

Exit 1, payload on stdout, reason on stderr. Note `version-path`: `severity: "red"` with `outcome: "pass"` is a **healthy** check. The single failure is `postgres-version`, and it alone produced `summary.red: 1` and the `abort`.

### A blind pass

The same command on an image with no baked artifact:

```json
{
  "schemaVersion": "1",
  "decision": "proceed-with-warnings",
  "force": false,
  "strict": false,
  "summary": { "red": 0, "yellow": 1, "info": 1 },
  "checks": [
    {
      "id": "version-path",
      "severity": "yellow",
      "outcome": "warn",
      "message": "No baked release-safety artifact is present; required-stop verification was skipped; upgrade-path safety cannot be verified on this image",
      "data": {
        "artifactPath": "/usr/app/release-safety.json",
        "targetVersion": null,
        "requiredStops": [],
        "pendingMigrationsOutsideArtifact": ["20260801120000_add_column.ts"],
        "artifactError": null
      }
    },
    {
      "id": "held-locks",
      "severity": "yellow",
      "outcome": "pass",
      "message": "No other sessions hold relation locks on pending-migration DDL tables",
      "data": { "tables": [], "locks": [], "probeError": null }
    },
    {
      "id": "disk-headroom",
      "severity": "yellow",
      "outcome": "pass",
      "message": "Disk headroom is not applicable because no pending artifact migration scans or rewrites a table",
      "data": {
        "applicable": false,
        "availableBytes": null,
        "minimumBytes": 5368709120,
        "source": "unavailable"
      }
    },
    {
      "id": "pending-migrations",
      "severity": "info",
      "outcome": "info",
      "message": "3 pending migration(s)",
      "data": {
        "migrations": [
          {
            "name": "20260801120000_add_column.ts",
            "transaction": true,
            "tables": [],
            "metadataAvailable": false
          }
        ]
      }
    }
  ]
}
```

Exit 0. `held-locks` and `disk-headroom` pass because `data.tables` is empty and `applicable` is false — nothing was examined. Report this run as "one check could not be verified; three others had nothing to examine", not as a pass with a minor warning.

### The checks

| `id`                   | Class  | Passes when                                                     | Blind spot                                                                                                   |
| ---------------------- | ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `version-path`         | red \* | Ledger matches the artifact's predecessor/up-to-date path       | Yellow-class when no artifact is baked — verification skipped                                                |
| `migration-privileges` | red    | Migration user can create in schema and owns the pending tables | Fails closed on probe error (`data.probeError`); empty table list without an artifact                        |
| `postgres-version`     | red    | Server major ≥ 12                                               | Fails closed on probe error                                                                                  |
| `held-locks`           | yellow | No other session holds a relation lock on the DDL tables        | Passes vacuously when the table list is empty; warns with `probeError` on failure                            |
| `long-transactions`    | yellow | No transaction ≥ 300s holds those locks                         | Same as above                                                                                                |
| `disk-headroom`        | yellow | `availableBytes ≥ minimumBytes` (5 GiB)                         | Passes when `applicable: false`; warns "unavailable" unless `MIGRATION_PREFLIGHT_DISK_HEADROOM_BYTES` is set |
| `pending-migrations`   | info   | Never gates                                                     | `metadataAvailable: false` ⇒ that migration's tables were never probed                                       |

\* `version-path` is the one check whose class varies: red normally, yellow when the artifact is absent.

`data.transaction` on a pending migration is `true` when the migration runs inside a transaction, `false` when it opts out (`config = { transaction: false }`), and `null` when the file could not be read. A non-transactional migration cannot be rolled back by the database if it fails partway.

## migrate status

`pnpm -F backend migrate-production status --json` returns `{ state, lease, knex, runHistory }`.

`state` is `idle`, `migrating`, `stale` or `parked`.

`knex.classification` is `up-to-date`, `database-behind`, `database-ahead` or `diverged`. `database-ahead` means the ledger contains migrations this image does not have but the image recognises them as its own future — normal after a rollback, and not blocking. `diverged` means it cannot account for them: `knex.offending` names those, and both `up` and `preflight` refuse to run (`version-path` reports `severity: "red"`, `outcome: "fail"`). `knex.missing` is the wider list of database-only migrations, most of which are benign under `database-ahead`.

`runHistory.runs[]` carries per-attempt `outcome`, `failingMigration`, `failureDetail`, and the `lastUnlockedBy` / `lastUnlockForced` attribution of any unlock that preceded the run.
