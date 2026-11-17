# CLI

## Review

- **Skip when:** a version bump only.
- **Worst case:** scripts and CI pipelines that call the CLI break on upgrade.
- **Evidence:** read the command and flag diff, and run the changed command.
- **flags kept:** no flag or command removed, renamed or newly required; a breaking change without a deprecation is Fix.
- **non-interactive:** new prompts have a flag or default so CI runs don't hang.
- **server versions:** the CLI still works against servers a release older and newer.
- **errors actionable:** failures say what went wrong and what to run next, with a non-zero exit code.

## Impact

- **breaking:** scripts break on command, flag, exit-code or parsed-output changes.
- **notable:** new command or flag.
- **minor:** human-facing wording.

## Diff

```ts
type CliDiff = Diff & {
    flag?: string;  // one flag or argument, or exit code, output or prompt for a behaviour change; none for the command itself
};
```

- **Name:** the full command (`lightdash deploy`).
- **Note:** what changed, when the diff is a behaviour.
- **Granularity:** one diff per command, flag or behaviour.
  A rename is `modified` with `old → new` in `flag`.

```json
{ "lens": "CLI", "change": "added", "impact": "notable", "name": "lightdash validate", "flag": "--severity", "note": "fails only at or above the given severity" }
```
