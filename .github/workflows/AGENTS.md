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
`Cache saved with the key`. Only Build & Lint may print it, and only after a
lockfile change.
