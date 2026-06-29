# Release-Safety Marker — Design (PROD-8359 / #24441)

**Status:** Feature-complete — P1–P4 + P6 + the deterministic SQL-shape linter all built; P6 activated. Marker DARK-LAUNCHED behind a kill-switch (publishes nothing yet) with a PR preview comment for visibility. Only P5 (Helm) remains parked.
**Ticket:** PROD-8359 · GitHub issue lightdash/lightdash#24441
**Branch / PR:** `prod-8359-release-safety` → PR lightdash/lightdash#24879 (draft)

## Status & resume

**Done (committed on the branch):**
- **P1** — `migrations.present` marker. `scripts/gen-release-safety.ts` (pure
  `detectMigrations` + `buildMarker` + IO shell), `scripts/release-safety.schema.json`
  (draft-07 contract), `scripts/gen-release-safety.test.ts` (15 tests), and the
  `release.config.js` wiring (generate before `@semantic-release/github`, attach
  asset-only). `.gitignore` ignores the generated marker.
- **Backtest** — `scripts/release-safety-backtest.ts`. Last 300 releases: ~10%
  carry migrations, ~90% clear-to-roll → the signal partitions meaningfully.
- **P6** — `scripts/ai-migration-review.ts`, an agentic AI reviewer (grep/read
  tools over the previous tag), wired into the generator behind `--ai-review`
  (gated on `migrations.present` + `ANTHROPIC_API_KEY`). Prompt-cached (rolling
  breakpoint → ~18 full-price input tokens/review). Fail-safe: degrades to
  `"unknown"`, never falsely safe, never fails the release.
- **P2** — `api.rest.breaking` via `oasdiff`. `scripts/rest-api-diff.ts` (pure
  `summarizeBreaking` + IO `diffRestApi`) diffs `swagger.json` between `<lastTag>`
  and `HEAD` (both read with `git show`, never the working tree) using
  `oasdiff breaking -f json`. oasdiff parses both specs into a semantic model, so
  no key-normalization is needed (proven: clean `[]` on a consecutive-release pair,
  10 correctly-classified *additive* changes on a feature commit). Auto-runs when
  oasdiff is on PATH (`OASDIFF_BIN` or `which`) and a previous tag exists — no
  opt-in flag, because it's deterministic. Folds into `api.rest` and adds `"rest"`
  to `capabilities`; orthogonal to the migration/rolling-update signal. Soft
  fail-safe: oasdiff missing / spec absent at a ref / oasdiff error / unparseable
  output → `checked: false` (honest "not checked"), never asserts an unproven "no
  break", never fails the release. Pinned + sha256-verified `oasdiff` install step
  added to `.github/workflows/release.yml` (audited harden-runner egress; plain
  curl, so no Socket Firewall wrapper). Also fixed a latent P6 schema bug: the
  `capabilities` enum was missing `"ai-review"`. Tests: `scripts/rest-api-diff.test.ts`
  (summarizeBreaking) + buildMarker `restApi` cases in `gen-release-safety.test.ts`.

- **P3** — `api.mcp.breaking` via a committed tool-surface snapshot.
  `packages/common/src/schemas/generateMcpToolsSnapshot.ts` serializes
  `mcpToolDefinitions` (each tool's `for('mcp')` view, input/output Zod →
  `zodToJsonSchema({ target: 'jsonSchema7' })`, same settings as
  `mcpToolContracts.snapshot.test.ts`) to a byte-stable committed
  `packages/common/src/schemas/json/mcp-tools-1.0.json` (27 tools). Wired into
  `postgenerate-api` with a `--check` freshness guard (`check:mcp-tools-snapshot`),
  mirroring the chart-as-code generator. `scripts/mcp-tools-diff.ts` diffs the
  snapshot between `<lastTag>` and `HEAD` (`git show`) with a conservative 4-rule
  classifier (R1 tool removed, R2 input field became required, R3 input field
  removed, R4 input field type changed; additive/output/description changes are
  NOT breaking). Folds into `api.mcp` + adds `"mcp"` to capabilities. Same soft
  fail-safe as P2 (snapshot absent at a ref → `checked: false`).
  **Resolved open question:** the snapshot is the DECLARED `mcpToolDefinitions`
  superset, NOT the flag-gated runtime subset — flag-gating
  (aiWriteback / content-writes / project-pinned) is an operator's per-request
  runtime choice, not a release change, and the declared set is the complete
  contract surface and is generatable purely from `@lightdash/common`.
- **P4** — `upgrade.minPreviousVersion`/`requiredStop`/`note` from a committed
  `release-safety.overrides.json` (+ `scripts/release-safety-overrides.schema.json`).
  `scripts/upgrade-overrides.ts` is a pure version-keyed resolver (most-specific
  entry wins — "HEAD wins") + a strict validator + a loader. Folds into the
  `upgrade` block + adds `"upgrade"` to capabilities whenever the file is
  consulted. **Fail-safe ASYMMETRY (deliberate):** unlike the detectors, an
  ABSENT file is inert (stub, no capability) but a PRESENT-but-malformed file
  FAILS LOUD (throws → non-zero exit), because silently dropping a maintainer's
  required-stop is the falsely-safe direction. Committed an inert default file so
  the mechanism is live (`upgrade` capability appears every release).

- **Deterministic SQL-shape linter** — `scripts/sql-migration-lint.ts`, the
  always-on non-LLM floor. Pure `lintSource` statically scans the `up()` body of
  each added Knex migration for destructive shapes: drop/rename column or table,
  NOT NULL without a default (context-aware — `createTable` is safe, `alterTable`
  is a candidate, `.defaultTo` clears it), and raw-SQL equivalents. IO
  `lintMigrations` reuses `addedMigrationPaths`. Precedence: a "breaking" finding
  is AUTHORITATIVE — it sets `rollingUpdateSafe = false` and the generator
  SHORT-CIRCUITS the (paid, non-deterministic) AI review; the AI remains the only
  path to `true`. Adds `"sql-lint"` to capabilities. Bias toward over-flagging
  (a false breaking only costs an unnecessary Recreate). Validated on a real
  historical migration (`20220727122405_drop_issuer_fk.ts`): flagged the up()
  `dropTableIfExists` and the `.notNullable().alter()` that drops a default, but
  NOT the sibling `.notNullable().defaultTo(...)`, and ignored the `down()`.
- **P6 ACTIVATED** in the release pipeline: `--ai-review` added to the
  `release.config.js` `prepareCmd`, and `ANTHROPIC_API_KEY` exported into the
  Semantic Release step in `release.yml` (egress to api.anthropic.com over the
  harden-runner audited policy). Gated as before — migrations-present only, only
  when the SQL linter did not already prove a break, key-present only; any degrade
  leaves `"unknown"` and never fails the release.

- **Kill-switch (dark launch)** — `RELEASE_SAFETY_MARKER_ENABLED` env (default
  `false`). While off, `gen-release-safety.ts` computes + logs the marker but
  writes no file AND skips the paid AI review (a dark release publishes nothing
  and spends nothing). `release.config.js` ALSO gates the GitHub asset listing on
  the same env (so a missing file can't fail a release — bulletproof, not relying
  on plugin skip behaviour). Set to `'false'` in the `release.yml` Semantic
  Release step; flipping to `'true'` writes the file, attaches the asset, and
  enables the AI review in one switch.
- **PR preview comment (shift-left)** — `.github/workflows/release-safety-pr.yml`
  runs on PRs touching the schema/API/MCP surface (path-filtered). Lightweight:
  `tsx` + a pinned `oasdiff`, NO `pnpm install` (the generator imports only
  Node built-ins + git). Computes the marker diffed against the merge-base with
  the target branch (`enabled=true` to a throwaway temp file). The AI migration
  review runs on **ready** PRs (a real "about to merge" signal) but NOT on
  **drafts** (still churning); `ready_for_review` is in the trigger types so
  draft→ready re-runs with the AI. Still gated downstream to migration-bearing
  PRs where the linter didn't already decide, and degrades without a key (fork
  PRs, which don't comment anyway). Then `scripts/release-safety-pr-comment.ts`
  renders a sticky
  comment (find-or-update via `actions/github-script`, same pinned action the repo
  already uses) with: the determination, the matrix of which checks ran + what
  they found, and the customer-deploy consequence ("old pods could CrashLoopBackOff
  → Recreate", required-stop, REST/MCP consumer breaks). Fork PRs are skipped
  (read-only token). The published asset stays dark — the comment is informational.

**Remaining:**
- **Caching/cost:** P6 is cheap now; no further work needed unless cost regresses.
- **Operator/maintainer docs:** publish the `jq`-gating recipes + the
  `release-safety.overrides.json` required-stop authoring flow (the only manual
  step in the system).
- **Go-live:** flip `RELEASE_SAFETY_MARKER_ENABLED` to `'true'` in `release.yml`
  once a consumer commits to reading the marker.

**Parked (deliberately, per Charlie):**
- **P5** — Helm `backend.deployment.strategy` Recreate switch + operator docs
  (`jq` gate, Argo PreSync/Flux) in the `helm-charts` repo.

**Open decisions to carry forward:**
- No customer (Octopus/Wise) has *committed* to consuming the marker yet —
  confirm before investing in P2+.
- The P6 verdict is non-deterministic; only a high-confidence `safe` flips
  `unknown → true` (variance can only over-recommend `Recreate`).

**Resume pointers:**
- Worktree: `~/projects/worktrees/lightdash/prod-8359-release-safety`.
- Run the generator: `npx tsx scripts/gen-release-safety.ts --version X --previous-version Y --last-tag Y [--ai-review]`.
- Run just the REST diff: `npx tsx scripts/rest-api-diff.ts --last-tag Y [--new-ref HEAD]` (needs `oasdiff` on PATH or `OASDIFF_BIN`).
- Run just the MCP diff: `npx tsx scripts/mcp-tools-diff.ts --last-tag Y [--new-ref HEAD]` (needs the committed `mcp-tools-1.0.json` present at both refs).
- Run just the SQL linter: `npx tsx scripts/sql-migration-lint.ts --last-tag Y` (scans migrations added in `Y..HEAD`).
- Run just the upgrade resolver: `npx tsx scripts/upgrade-overrides.ts --version X [--overrides release-safety.overrides.json]`.
- Regenerate the MCP snapshot: `pnpm generate:mcp-tools-snapshot` (CI guard: `pnpm check:mcp-tools-snapshot`). Runs inside `postgenerate-api`.
- Tests: `npx tsx scripts/{gen-release-safety,sql-migration-lint,rest-api-diff,mcp-tools-diff,upgrade-overrides}.test.ts` (73 total). Backtest: `npx tsx scripts/release-safety-backtest.ts 300`.
- AI runs need `ANTHROPIC_API_KEY` — it's a per-engineer 1Password item
  (`scripts/dev-op-pull.sh` + `scripts/dev-secrets.manifest.json`, account
  `lightdash.1password.com`).

## Problem

When a self-hosted Lightdash instance upgrades via the managed Helm chart, a
Kubernetes migration Job (pre-upgrade hook) applies schema changes **before** the
app rolls out. The app then does a default Kubernetes `RollingUpdate`, so the
**previous** release's pods keep serving traffic against the already-migrated
schema until the rollout completes. A non-backward-compatible migration crashes
those old pods (`CrashLoopBackOff`). Helm enforces *schema-before-code* ordering;
nothing protects the previous release's *code* mid-rollout. Operators (notably
those with automated CI/CD that reads release notes) have **no machine-readable
signal** to decide whether a release needs care before upgrading.

## Solution shape

A **build-time signal, not a runtime change**: a small, flat, `jq`-gateable
`release-safety.json` generated by `semantic-release` at release time and attached
as a GitHub release asset. Stable per-version URL (public repo):

```
https://github.com/lightdash/lightdash/releases/download/<tag>/release-safety.json
```

The MVP carries one load-bearing boolean — `migrations.present` — and is honest
about uncertainty via a tri-state `compatibility.rollingUpdateSafe`
(`true | false | "unknown"`) plus a `capabilities[]` list declaring which checks
ran. Later phases populate stub fields without breaking P1 consumers.

### Marker schema (target)

```jsonc
{
  "schemaVersion": "1",
  "version": "0.3261.0",
  "previousVersion": "0.3260.2",      // null on first release
  "releaseDate": "2026-06-29T12:00:00.000Z",
  "capabilities": ["migrations"],      // which checks actually ran this release
  "migrations": { "present": true, "count": 2, "files": ["202606..._x.ts"], "ee": false },
  "compatibility": {
    "rollingUpdateSafe": "unknown",    // true | false | "unknown" — never silently true/false
    "recommendedStrategy": "Recreate", // Recreate | RollingUpdate
    "notes": "Contains DB migrations applied before app rollout..."
  },
  "api": {
    "rest": { "checked": false, "breaking": false, "changes": [] },
    "mcp":  { "checked": false, "breaking": false, "changes": [] }
  },
  "upgrade": { "minPreviousVersion": null, "requiredStop": false, "note": null }
}
```

**Honesty rules (load-bearing):**
- `migrations.present` is the MVP boolean every consumer gates on.
- `rollingUpdateSafe` defaults to `"unknown"` for migration-bearing releases —
  never silently `false` (alert fatigue) or `true` (false safety). `false` only
  on a positively-detected break.
- `capabilities[]` + per-section `checked` flags let a consumer distinguish
  "not checked this release" from "checked, no break".
- **Fail loud, never falsely safe:** if a detector throws, its section is
  `"unknown"` and the generator exits non-zero — it never writes a file that
  asserts safety. The file is written atomically (temp + rename).

## Phasing (each independently shippable)

| Phase | Deliverable | Repo |
|---|---|---|
| **P1 (this PR)** | `migrations.present` marker + generator + `release.config.js` wiring + JSON Schema + tests | lightdash |
| **P5 (recommended next)** | Helm `backend.deployment.strategy` value (default RollingUpdate) + docs (`jq` gate, Argo PreSync/Flux) | helm-charts |
| **P2** | `api.rest` breaking via `oasdiff` on `swagger.json` between tags | lightdash |
| **P3** | `api.mcp` breaking via committed `mcp-tools.json` snapshot + conservative 4-rule diff | lightdash |
| **P4** | `upgrade.minPreviousVersion`/`requiredStop` via committed `release-safety.overrides.json` | lightdash |
| **P6** | AI migration-safety review — resolves `rollingUpdateSafe` "unknown" → true/false by reviewing the migrations against the previous release's code | lightdash |

`schemaVersion` stays `"1"` across P1–P4 — later phases only fill honest stubs.

## P1 implementation

- `scripts/gen-release-safety.ts` — **pure core** (`detectMigrations`,
  `buildMarker`) + thin IO shell (`git diff --name-status`, atomic write). Run via
  `npx tsx` (house style).
- `scripts/release-safety.schema.json` — versioned JSON Schema for the marker.
- `scripts/gen-release-safety.test.ts` — runs the pure core against fixtures
  (`npx tsx scripts/gen-release-safety.test.ts`).
- `release.config.js` — new `@semantic-release/exec` `prepareCmd` before
  `@semantic-release/github`; `github` gains `assets: [{ path: 'release-safety.json' }]`.
  Published **asset-only** (not committed). `@semantic-release/exec@6` is already
  injected via `cycjimmy/semantic-release-action`'s `extra_plugins` in
  `.github/workflows/release.yml`, so no workflow change is needed for P1.

### Migration detection

`git diff --name-status <lastTag>..HEAD -- <migration dirs>`; count **ADDED**
(`A`) timestamped files (`/^\d{14}_.*\.(ts|js)$/`) only. Modified/renamed
historical migrations are not counted; deletions of historical migrations are
surfaced as a loud `notes` warning. `ee` is true iff any added file is under
`packages/backend/src/ee/database/migrations`.

## P6 implementation — AI migration-safety review

`scripts/ai-migration-review.ts` — an **agentic** reviewer that resolves
`rollingUpdateSafe: "unknown"` into a real `true`/`false`. It runs only when the
cheap detector found migrations (the ~10% of releases the backtest flagged), so
its cost is bounded.

- **Why agentic, not a single call:** a single structured call can classify
  migration *shape* (additive vs destructive) but cannot tell whether the
  migration is safe *for the previous release's code* — that depends on whether
  the old code reads/writes the changed object. So the reviewer is given two
  read-only tools scoped to the `<lastTag>` source — `grep_old_code`
  (`git grep -E … <lastTag>`) and `read_old_file` (`git show <lastTag>:<path>`)
  — and a manual tool-use loop (raw Messages API via `fetch`, no SDK). Empirically
  the single-call version returned `"unknown"` on multi-migration releases; with
  code access the agent cleared the `0.3233.0→0.3234.0` FK batch to `safe`/high
  by verifying `ProjectModel`/`JobModel`/`DownloadAuditModel` only ever write
  valid references (~12 tool calls).
- **Model:** `claude-opus-4-8`, adaptive thinking, `effort: high`,
  `max_tokens: 16000` (adaptive thinking shares the output budget — too low
  truncates the final JSON). Reads `ANTHROPIC_API_KEY` (the secret already wired
  into `ai-agent-integration-tests.yml`; `release-qa.yml` uses
  `QA_ANTHROPIC_API_KEY`).
- **Fail-safe gating (critical):** the model verdict only moves the marker
  `"unknown" → true` when it returns `safe` **with high confidence**; `breaking`
  → `false`; everything else stays `"unknown"` (`Recreate`). Any API error,
  refusal, `max_tokens` truncation, unparseable JSON, or tool-budget exhaustion
  degrades to `"unknown"` and exits 0 — it never emits a falsely-safe verdict and
  never fails the release. Adds `"ai-review"` to `capabilities[]`.
- **Edge over a SQL linter:** because it reads intent, it caught a data migration
  that rewrites existing `open` rows to a new `triage` status the old code
  doesn't recognise — a behavioural break invisible to operation-shape linting
  (Squawk/Atlas). The two are complementary: a deterministic linter is the floor,
  the AI review is the ceiling.
- **Generator integration:** `gen-release-safety.ts` runs the review when
  `--ai-review` is passed AND `migrations.present === true` AND `ANTHROPIC_API_KEY`
  is set (so the release workflow opts in; local runs don't need a key). The
  verdict folds into `compatibility.rollingUpdateSafe` / `recommendedStrategy`,
  appends the AI summary to `notes`, and adds `"ai-review"` to `capabilities`.
  A `null`/degraded review leaves the honest `"unknown"` default — `buildMarker`
  stays pure (takes the verdict as data) and only applies it when migrations are
  present, so the AI can never invent a verdict for a no-migration release.
- **Prompt caching:** the system prompt and the migration-files turn carry
  `cache_control`, and a single rolling breakpoint moves onto the last block each
  turn so the growing tool transcript is cached too. Measured effect on the
  4-migration batch: full-price input fell from ~403k tokens to ~18 (the rest
  served from cache at ~0.1×), ~10× cheaper per review.
- **Non-determinism (must document):** the agentic verdict is not reproducible —
  the same migrations returned `safe`/high on one run and `unknown`/medium on
  others. This is acceptable *only because of the gating*: variance can cost an
  unnecessary `Recreate` (over-caution) but, since `unknown → true` requires a
  high-confidence `safe`, it can never silently clear a breaking change. Operators
  must treat an AI `safe` as best-effort, not a guarantee — hence the `capabilities`
  flag and the standing recommendation to add a deterministic SQL-shape linter as
  the floor underneath it.

## Known blind spots (must stay documented)

The marker does **not** detect code-only or config-only breaking changes (env var
defaults, removed Helm values, serialization/protocol changes) — these crash old
pods with no migration. The marker must never be read as "safe to RollingUpdate"
beyond what `capabilities[]` says was checked.

## Complementary follow-up (out of scope here)

The durable fix is **expand/contract migration discipline + a Knex migration
classifier** (à la `strong_migrations` / `django-migration-linter` / Atlas
`migrate lint`) that fails unsafe migrations in CI. P6 (the AI review) is the
*judgement* half of that classification and resolves most `"unknown"` verdicts
today; a deterministic SQL-shape linter would be the cheap, always-on floor
underneath it. The two are complementary — pursue the linter as a follow-up so
the marker has a non-LLM guarantee for the common destructive operations.

## Prior art

- **GitLab `config/upgrade_path.yml`** — the gold-standard machine-readable
  required-stops artifact (version-keyed, multi-consumer). We emit per-release
  rather than forward-plan.
- **Sentry "hard stops"** — docs-only list; demonstrates why a machine-readable
  asset is needed (skipping a stop yields opaque migration failures).
- **strong_migrations / django-migration-linter / Atlas** — the classification
  layer the follow-up would adopt.
