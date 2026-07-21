# Data-app skill benchmark

Measures the effect of sandbox template / skill changes on generation
behavior without going through the Lightdash backend pipeline: sandbox +
Claude CLI + Vite only, all runs in parallel, so a full matrix costs the
wall-clock of one generation (~7 min).

## What it measures

Wall-clock is the least reliable signal (no model seed exists), so the
benchmark leans on two better ones:

1. **Behavioral rules** (`assertions.ts`) — near-deterministic pass/fail per
   run, each tied to a specific skill rule: no monolith re-writes, no
   read-back of own writes, no template-lib reads (Read tool or Bash `cat`),
   `pnpm check` ran, no mutating Bash, no denied tools, required reference
   files read and irrelevant ones skipped, build passes, no placeholder app,
   no oversized files, axes have tick formatters.

   Rule semantics worth knowing:

   - Rules encode the **current** skill contract. Templates built before a
     contract change fail its rules by design (e.g. a pre-`pnpm check`
     template scores 0 on `ran-pnpm-check`) — that's the measurement, not a
     bug.
   - The Claude CLI executes **read-only Bash** (find/cat/grep) in the
     sandbox regardless of `--allowedTools`, so exploration via Bash is
     tolerated; `no-mutating-bash` only flags state-changing or
     program-running commands beyond `pnpm check`.
   - `axes-have-tick-formatters` enforces the skill's letter ("every axis,
     no exceptions"). String-category axes without a formatter render fine
     and are the common failure — a fail here is contract drift, not
     necessarily a user-visible bug.
2. **Stream-timing buckets** (`stream.ts`, mirrors the backend's
   `ClaudeStreamProcessor`) — apiLatency / thinking / text / toolInput /
   toolExec, plus tokens and turns. Compare medians per bucket, paired by
   prompt: an intervention should move *its* bucket.

3. **Render gate + gallery** (`renderGate.ts`, `mockHost.ts`, `harness.js`,
   `gallery.ts`) — every built app is loaded in headless Chromium under a
   mock Lightdash host that answers the SDK's postMessage protocol with
   deterministic rows synthesized from the fixture catalog (seeded by query
   content, so identical queries get identical data across variants). This
   yields three runtime rules folded into the rubric — `renders-clean` (no
   uncaught errors, no ErrorBoundary/fatal fallback, non-empty root),
   `made-metric-queries`, and `queries-valid-fields` (every issued query
   references real catalog fields on a real explore) — plus a full-height
   screenshot per run and a blinded side-by-side gallery
   (`runs/<ts>/gallery.html`) for human quality ranking: vote per row, then
   "Reveal variants" to see the per-variant win tally. Requires Chromium
   once: `npx playwright install chromium`.

## Usage

From `sandboxes/data-apps/` (needs `E2B_API_KEY` + `ANTHROPIC_API_KEY` in
`.env` or the shell):

```bash
# Score one template against the rubric
pnpm bench --variant candidate=lukas-dev-template:latest

# A/B two template builds, 5 reps, full suite
pnpm bench \
    --variant baseline=lightdash-data-app \
    --variant candidate=lukas-dev-template:latest \
    --reps 5

# Quick iteration on a subset
pnpm bench --variant candidate=lukas-dev-template:latest \
    --prompts pdf-report,sheets-export --reps 2

# Reasoning-effort comparison: prod default vs lowered effort, same template
pnpm bench \
    --variant prod=lightdash-data-app \
    --variant medium=lightdash-data-app,effort=medium \
    --variant low=lightdash-data-app,effort=low \
    --reps 3
```

Flags: `--variant name=templateRef[,effort=<level>][,env.KEY=VAL]`
(repeatable; first is the baseline for paired deltas), `--reps` (default 3),
`--prompts id,id`, `--concurrency` (default 8), `--model` (default sonnet),
`--out`.

Variant options beyond the template ref:

- `effort=low|medium|high|xhigh|max` — passed as `--effort` to the Claude
  CLI. Omitted = no flag, which is exactly what production runs (the model's
  default; `high` for Sonnet 5). Values are validated locally because the
  CLI warns-and-ignores bad values, which would silently benchmark the
  default.
- `env.KEY=VAL` — extra env for the sandbox (e.g.
  `env.CLAUDE_CODE_EFFORT_LEVEL=low`, which is equivalent to the flag and
  overrides it). Note `MAX_THINKING_TOKENS` is a no-op on adaptive-reasoning
  models (Sonnet 5+) — use effort levels there.

Results land in `benchmark/runs/<timestamp>/`: `raw/*.jsonl` (timestamped
stream events per run), `src/<cell>/` (generated sources), `dist/<cell>/`
(built assets), `render/<cell>.json` (render-gate diagnostics incl. every
issued query), `screenshots/<cell>.png`, `gallery.html`, `config.json`,
`results.json`, `summary.txt` (also printed).

The render gate and gallery run automatically at the end of `pnpm bench`;
to re-run them on an existing run dir (e.g. after tweaking the harness):

```bash
pnpm bench:render runs/<timestamp>/   # re-render + refresh gallery
pnpm bench:gallery runs/<timestamp>/  # regenerate gallery.html only
```

## Fixtures

- `fixtures/schema.yml` — byte-stable catalog (3 models, joins, grains) so
  catalog size/content never confounds a comparison. Don't point the
  benchmark at a live project.
- `prompts.json` — the suite. Each prompt declares `mustRead` /
  `mustNotRead` reference files (progressive-disclosure discipline) and can
  ship extra sandbox files (e.g. the chart-reference fixture) plus a prompt
  prepend mirroring the pipeline's format. Note the prepends encode the
  **current** pipeline wording — on templates predating the references/
  layout, the chart-reference prompt tells the model to read a file that
  doesn't exist, costing that variant a wasted turn. Keep this in mind when
  comparing across template generations.

## Interpreting results

- A rule at 5/5 across the suite is working; a rule flipping between runs is
  a skill-wording problem — fix the skill, not the stats.
- For effort comparisons, hold the template constant and read the `think`
  bucket for the speed win and the rule pass rates for the quality cost —
  `build-passes`, `renders-clean`, `queries-valid-fields`,
  `axes-have-tick-formatters`, and `no-oversized-files` are the ones that
  degrade first when the model under-thinks. The objective rules only catch
  breakage; the subjective half (skimpier layouts, worse chart choices) is
  what `gallery.html` is for — vote blind, then reveal. Each run's
  `config.json` records the exact variant specs.
- Treat wall-clock deltas under ~20% at n≤5 as noise. Bucket medians
  (thinking vs toolInput) are more stable and attribute the change to a
  mechanism.
- The prompt suite is fixed on purpose. Add prompts when a new skill rule
  needs coverage; don't tweak existing ones (it invalidates comparison with
  older runs).

## Costs

Every run is a real sandbox + real Claude generation (~$0.5–1.5 per run on
sonnet). A 2-variant × 6-prompt × 3-rep matrix is 36 generations.
