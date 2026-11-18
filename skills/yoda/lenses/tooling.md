# Tooling

## Review

- **Skip when:** runtime scripts under `src/`, or test specs themselves.
- **Worst case:** `main` goes red, a suite silently stops running, a release can't be cut, or a preview environment or fresh worktree won't boot.
- **Evidence:** read workflow/script changes; run at deep.
  At quick, inspect changed branching and selected tests/reported runs; unresolved evidence follows shared policy and `../testing.md`.
- **still checks:** no `pr.yml` job (build and lint, unit shards, OpenAPI breaking change, API, E2E, CLI), test, lint or typecheck is skipped, narrowed, path-filtered or made non-blocking without saying so; a change to when suites run says how to force the full run.
  A flake fix names the cause and keeps the test able to fail.
  An unstated drop is Fix.
- **ordering and cache:** heavy suites wait for the preview build; cache keys use inputs only, and one job saves the pnpm store (`.github/workflows/AGENTS.md`).
- **release path:** `release.yml`, `post-release.yml`, version bumps and npm publish are checked on the release path itself, which is a one-way door; `merge-freeze.yml` keeps its required context; release-safety workflows keep no trigger-level `paths:`.
- **generated checks:** a check that regenerates from docs or schemas (OpenAPI, MCP snapshot) is pinned and says how to regenerate; a docs change must not turn unrelated PRs red.
- **images:** each Dockerfile stage copies what its build reads; base-image and package pins build on the release image.
- **local dev:** startup, port allocation, DB resets, dbt environments and seed users work on fresh worktrees and macOS bash 3.2; installs fail hard, errors are named, network exposure never widens.
- **preview env:** check build, seed, egress, shutdown and every consumer of the file, including disk/database resources and seed-dependent E2E specs.
- **secrets safe:** forks never reach secrets, diagnostic steps don't print credentials, and `pull_request_target` and third-party actions are pinned and justified.

## Impact

- **breaking:** checks stop blocking/running or release/dev/preview setup requires action.
- **notable:** automatic check/workflow/script or trigger/timeout/path-filter changes.
- **minor:** non-automatic scripts, linter rules or inert cleanup.

## Diff

```ts
type ToolingDiff = Diff;
```

- **Name:** the workflow, script or config (`PR Checks`, `t3-setup-worktree.sh`).
- **Note:** what it does now.
- **Granularity:** one diff per workflow, script or config whose behaviour changes; scripts that only serve one workflow share its row.

```json
{ "lens": "Tooling", "change": "modified", "impact": "notable", "name": "PR Checks", "note": "cancelled when the PR closes" }
```
