# Versioning

Lightdash uses [semantic versioning](https://semver.org/) with [conventional commits](https://www.conventionalcommits.org/) to automate releases.

## How versions work

| Commit type | Version bump | Example | Meaning |
|---|---|---|---|
| `fix:` | Patch | `1.0.0` → `1.0.1` | Bug fixes, safe to upgrade |
| `feat:` | Minor | `1.0.0` → `1.1.0` | New functionality, backwards compatible |
| `feat!:` / `BREAKING CHANGE:` | Major | `1.0.0` → `2.0.0` | Breaking change, read changelog before upgrading |

Other commit types (`chore:`, `docs:`, `refactor:`, `test:`, `ci:`) do **not** trigger a release.

## Release pipeline

1. Developer merges a PR with conventional commit messages
2. [semantic-release](https://github.com/semantic-release/semantic-release) analyzes commits since last release
3. Determines version bump from commit types
4. Publishes: GitHub release, npm packages, Docker images, Homebrew formula

All packages in the monorepo release in **lockstep** at the same version. There is no independent versioning per package.

## Breaking change checklist

Before adding `!` or `BREAKING CHANGE:` footer, verify which surfaces are affected:

- [ ] **REST API** — Endpoint removed, response shape changed, or status codes altered
- [ ] **CLI** — Command removed, flag renamed, or output format changed
- [ ] **Environment variables** — Variable removed or renamed (adding new ones with defaults is not breaking)
- [ ] **Database migrations** — Migration requires manual steps beyond `pnpm migrate`
- [ ] **dbt YAML schema** — Existing `.yml` files would fail validation
- [ ] **npm packages** — Public API of `@lightdash/common`, `@lightdash/warehouses`, or `@lightdash/cli` changed
- [ ] **Auth/permissions** — A previously-allowed action is now denied

## Package compatibility

All packages release at the same version from the monorepo. CLI and SDK versions are compatible with any Lightdash server sharing the **same major version**:

- CLI `1.3.0` + Server `1.50.0` → compatible
- CLI `1.3.0` + Server `2.0.0` → **incompatible**, upgrade CLI

The CLI performs a major-version check against the server's health endpoint and warns on mismatch.

## Maintenance branches

When a new major version ships (e.g., `2.0.0`), a `1.x` maintenance branch can be created to backport critical fixes. The `release.config.js` already supports this pattern.
