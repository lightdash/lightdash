# Config

## Review

- **Skip when:** only reading an existing flag with its behaviour unchanged in both states, or `.env.example` (Tooling).
- **Worst case:** existing installs, often self-hosted, break on upgrade.
- **Evidence:** look at defaults, and at renamed or removed variables.
- **default keeps behaviour:** unset variables/flags preserve current behaviour.
- **no silent rename:** a renamed or removed variable still reads the old name, or the change is called out for self-hosted users. Otherwise Fix.
- **set before deploy:** if installs must set something before the new code runs, it ships in an earlier PR. Otherwise Fix.
- **flag off unchanged:** with the flag off, nothing changes; removing a flag removes both paths.
- **no manual upgrade:** an upgrade needs no manual step, or the step is in the PR and the release notes. Otherwise Heads-up.
- **documented:** a new or changed env var is in the repo's env-var docs (`docs/`, or beside the related variables), or the PR says the public docs are updated (feature flags don't need it).
  Missing is a Heads-up only for a variable self-hosted installs must set or change; otherwise a note on its diff row.

## Impact

- **breaking:** a removed/renamed env var or default requires install changes.
- **notable:** new env var/flag with safe default, or removing a flag enables new behaviour.
- **minor:** removing a flag already on everywhere, self-hosted included.

## Diff

```ts
type ConfigDiff = Diff & {
    kind: string;  // env or flag
    default: string;  // what an install gets when nobody sets it; "old → new" when modified
};
```

- **Name:** the exact env var or flag id, never shortened.
- **Granularity:** one diff per variable or flag.
  A rename is `modified` with `old → new` in `name`; a removed flag's default is what's left (`off → always on`).

```json
{ "lens": "Config", "change": "added", "impact": "notable", "name": "ai-thread-images", "kind": "flag", "default": "off", "note": "kept off in previews" }
```
