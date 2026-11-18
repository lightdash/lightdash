# Dependencies

## Review

- **Skip when:** a lockfile-only change, or a `package.json` change with no dependency entries.
- **Worst case:** a breaking change or vulnerability arrives with the bump and shows up only at runtime.
- **Evidence:** the changelog between versions, and the code that uses the package.
- **reason stated:** the PR says why the package is added or bumped.
- **breaking changes read:** a major bump, a 0.x minor, or a minor bump of a UI library has its changelog checked against how the code uses it.
- **no duplicate:** a new package doesn't repeat one already in the repo for the same job.
- **licence:** a new package has a licence Lightdash can ship (no GPL or AGPL in shipped code).
- **installed safely:** local install instructions and scripts go through `sfw` (CI installs from the lockfile and needn't); overrides and resolutions say why.
- **lockfile matches:** the lockfile changes with `package.json`.
  Read changed entries and their referenced resolutions to check they match the dependency changes without unrelated version moves.

## Impact

- **breaking:** shipped-package/runtime updates break use, or an imported package disappears.
- **notable:** Minor bump, new package or major dev-tool bump.
- **minor:** patch or type-only update without runtime/contract effects.

## Diff

```ts
type DependencyDiff = Diff & {
    where: string;  // the workspace or file that changed (`frontend`, `.nvmrc`, `dockerfile`)
    version: string;  // "old → new" for a bump, the new version when added, the old one when deleted
};
```

- **Name:** the exact package, image or runtime name (`snowflake-sdk`, `node`).
- **Granularity:** one diff per package and workspace; a pin repeated in several files (Dockerfiles, CI) is one diff with the files in the note.
  A range change that resolves to the version already installed gets no diff.
  Lockstep families (`@mantine/*`) still get one diff per package.
- A bump's step (major, minor, patch) goes in the note when it matters.

```json
{ "lens": "Dependencies", "change": "modified", "impact": "notable", "name": "react-grid-layout", "where": "frontend", "version": "1.3.4 → 1.5.4", "note": "minor" }
```
