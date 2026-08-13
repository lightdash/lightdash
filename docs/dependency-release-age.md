# Dependency release-age controls

Lightdash delays newly published npm packages before they can be installed. The
delay gives the ecosystem time to detect a compromised release before it enters
the dependency graph.

## Settings

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320`, which is three days in
  minutes. It is the control used by repository installs and CI.
- `.npmrc` sets `min-release-age=3` for contributors who invoke the npm CLI.
  The npm CLI does not read pnpm's exclusion list.
- `renovate.json` waits seven days before proposing a routine update. This is
  stricter than pnpm's three-day installation gate, so routine Renovate updates
  have already passed the pnpm gate when Renovate proposes them.

## Vulnerability alerts

The vulnerability-alert path is the exception. It sets Renovate's
`minimumReleaseAge` to zero and may run at any time, so a fixed version can be
younger than pnpm's three-day gate.

Renovate handles that collision automatically. Its pnpm artifact updater adds
the exact fixed version to `minimumReleaseAgeExclude` while preparing the
security pull request and generates the adjacent `Renovate security update`
comment. This allows the pull request's lockfile to resolve. It is not a manual
bypass or a separate approval process.

## Stale entries

Renovate creates version-pinned entries such as
`hono@4.12.18 || 4.12.21`. They exempt only those exact releases, not the package
or any future version. Once every listed release is older than three days, the
entry is inert: pnpm would accept those releases without it and future releases
remain quarantined.

Renovate does not remove stale entries. They may be deleted for readability
after the quarantine has elapsed, but this is cosmetic maintenance rather than
a security control.
