# Versioning & Compatibility

Lightdash follows [semantic versioning](https://semver.org/) (semver). Version numbers take the form `MAJOR.MINOR.PATCH` and communicate upgrade risk:

| Part | When it changes | What it means for you |
|---|---|---|
| **MAJOR** (e.g., `1.x.x` → `2.0.0`) | Breaking changes to APIs, CLI, config, or data formats | Read the changelog before upgrading. You may need to update configuration, API integrations, or dbt YAML files. |
| **MINOR** (e.g., `1.0.x` → `1.1.0`) | New features, backwards compatible | Safe to upgrade. New functionality is available but nothing existing is broken. |
| **PATCH** (e.g., `1.0.0` → `1.0.1`) | Bug fixes only | Safe to upgrade. |

## CLI & SDK compatibility

The Lightdash CLI and any SDKs are compatible with any Lightdash server sharing the **same major version**. For example:

- CLI `1.3.0` works with Server `1.50.0`
- CLI `1.3.0` does **not** work with Server `2.0.0`

The CLI checks compatibility automatically and warns if there is a major version mismatch.

## Docker version pinning

When self-hosting, you can pin to a specific version or range:

```yaml
# Pin to exact version
image: lightdash/lightdash:1.5.2

# Pin to major version (recommended) — gets minor and patch updates
image: lightdash/lightdash:1

# Always latest (default)
image: lightdash/lightdash:latest
```

We recommend pinning to the **major version** to automatically receive bug fixes and new features while avoiding breaking changes.

## npm version pinning

For projects depending on Lightdash packages:

```json
{
  "dependencies": {
    "@lightdash/cli": "^1.0.0"
  }
}
```

The `^` prefix ensures you get minor and patch updates within the same major version.

## When to check the changelog

- **Major version bump**: Always read the [changelog](https://github.com/lightdash/lightdash/releases) before upgrading. Look for the "BREAKING CHANGES" section.
- **Minor / patch bump**: Safe to upgrade without reviewing, but the changelog may contain useful information about new features.

## Maintenance & backports

When a new major version is released, we may maintain the previous major version with critical bug fixes for a limited period. Check the [releases page](https://github.com/lightdash/lightdash/releases) for available versions.
