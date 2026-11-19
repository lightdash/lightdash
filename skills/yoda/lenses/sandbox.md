# Sandbox

## Review

- **Skip when:** the data app built on top (Data apps), or data-app template docs and skills.
  Code that starts, resumes or meters sandbox runs (sessions, usage, cost) belongs here, not to Data apps.
- **Worst case:** code escapes its box, leaks another tenant's data, or sandboxes pile up and cost money.
- **Evidence:** read the code, and look for per-provider tests or a run on each changed provider.
- **isolated:** one tenant's code, files and credentials never reach another tenant's sandbox; reused or snapshotted sandboxes carry no prior state. A gap is Fix.
- **bounded:** output size, run time, memory and network are capped (`boundedOutput`); an uncapped path is Fix.
- **cleaned up:** every sandbox is destroyed on success, error, timeout and cancel; nothing relies on the provider's own expiry alone.
- **providers in step:** a behaviour changed for one provider is changed for the others, or the difference is stated.
- **secrets scoped:** only the credentials the run needs go in, with the shortest lifetime.
- **failure surfaced:** a provider error or timeout reaches the user as a clear message, not a hang.

## Impact

- **breaking:** working runs fail or exceed a narrowed limit.
- **notable:** new provider, limit, step or capability.
- **minor:** same lifecycle/limits.

## Diff

```ts
type SandboxDiff = Diff & {
    provider: string;  // E2B, Azure or all
};
```

- **Name:** the lifecycle step or capability (`create`, `exec`, `cleanup`, `python nodes`).
- **Note:** what happens now.
- **Granularity:** one diff per step and provider.

```json
{ "lens": "Sandbox", "change": "added", "impact": "notable", "name": "python nodes", "provider": "Azure", "note": "run python query nodes" }
```
