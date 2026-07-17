# Cypress migration control plane

This directory is the durable handoff between the discovery and porting swarms.

## Ownership

- One discovery agent owns one Cypress source file and its mirrored findings file.
- Discovery agents never edit tests, shared files, or `manifest.json`.
- One port agent owns one Cypress source file, one target test file, and its findings history.
- Shared prerequisites belong to a coordinator agent and a separate signed commit.
- Cypress remains authoritative during dual-run; port agents do not delete it.

## Paths

A source such as:

```text
packages/e2e/cypress/e2e/app/minimal.cy.ts
```

maps to:

```text
packages/e2e/migration/playwright/findings/e2e/app/minimal.cy.md
```

## State machine

```text
queued -> analyzing -> analyzed
                    -> clarification-required
                    -> coordination-required -> ready
                    -> ready -> porting -> blocked | verified -> committed
```

Only the orchestrator changes `manifest.json`. Findings histories are append-only after their first analysis.

## Execution lanes

- `playwright-read-only`: may share the preview and run with bounded concurrency.
- `api-tests`: browserless HTTP coverage.
- `cli-node`: CLI process coverage without a browser.
- `unit-or-remove`: skipped validation or obsolete coverage requiring triage.
- `mutating-isolated`: blocked until an isolation coordinator provides a separate database/preview strategy.

## Coordination gate

A findings file declares coordination keys. Before any dependent port starts, the orchestrator creates one coordinator task per key. The coordinator records the contract in `coordination/<key>.md` and, when necessary, lands a separate prerequisite commit.

## Commit policy

Each port agent works in an isolated worktree and branch. It runs focused and full verification, appends its result to the assigned findings file, then waits for a serialized signing lease before creating one signed commit. Agents never push without explicit approval.
