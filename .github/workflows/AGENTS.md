# GitHub Actions workflows

## Caches on Depot runners
Jobs on `depot-ubuntu-*` runners send `actions/cache` and `pnpm/setup` saves to
Depot Cache, not GitHub's cache. No 10 GB cap evicts old entries, so a bad key
grows storage until the org retention policy removes it.

## Cache keys
- Derive keys from inputs only, such as the lockfile hash and OS. Never include
  `github.run_id`, `run_attempt`, a SHA, a timestamp or a uuid. A run-unique key
  is written every run and never restored.
- When bumping a cache-related action, read its release notes for key format
  changes. pnpm/setup v3.0.0 added the run id to its key (#31689), which is what
  #31923 fixed.

## pnpm store: one writer
- Only `build-and-lint` in `pr.yml` saves the pnpm store. Every other
  `pnpm/setup` call sets `save-cache: false`. Copy that when adding a job.
- Jobs that install a runtime or global packages change the store after
  restore, so they would save on every run. Never make one of them the writer.

## Checking a change
After touching caching, search each job log in a PR run for
`Cache saved with the key`. Only `🧹 build · build & lint` may print it, and only after a
lockfile change.

## When the heavy suites run
- The E2E and CLI jobs all need `preview`, and `preview` needs `build-and-lint`
  and `unit-tests`. A push that fails lint, types or unit tests never starts
  them.
- A new job that tests against the preview should need `preview`. Do not let it
  start alongside the cheap checks.
- On draft PRs the preview, E2E and CLI jobs are skipped; lint, types and unit
  tests still run. Marking the PR ready for review starts them. `test-all` in
  the PR body runs them on a draft too; the per-suite keywords (`test-cli`,
  `deploy-preview`, ...) only apply once the PR is not a draft.

## Runner choice
- Depot runners (`depot-ubuntu-24.04-4` / `-8`) are for jobs that do real CPU
  work: installs, builds, test suites.
- Jobs that only wait, poll, post a comment or run a tiny script use
  `ubuntu-latest`: `⚙️ setup · select tests`, `⚙️ setup · post test selection`, `🌐 preview · deploy`
  (it waits on Rainbow's commit status) and Renovate.
- GitHub-hosted jobs share one org-wide concurrency limit with every other
  repo. Do not move a job that runs many times per PR to `ubuntu-latest`
  without checking peak concurrency first.
- A job on `ubuntu-latest` uses GitHub's own Actions cache, not Depot Cache, so
  it cannot restore the pnpm store `build-and-lint` saves.

