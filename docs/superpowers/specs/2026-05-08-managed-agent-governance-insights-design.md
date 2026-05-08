# Managed Agent — Governance Insights for Repeated Custom Definitions

**Date:** 2026-05-08
**Status:** Draft, do not commit
**Linear:** PROD-7392

## Goal

The autopilot should surface governance insights about content quality and consistency. v1 scope: detect repeated custom definitions across a project's saved charts, and propose pushing the canonical version to dbt YAML.

Two finding kinds:

- **`inconsistent_definitions`** — multiple distinct definitions sharing the same intent (same name with different SQL, or same SQL with different names). Resolution: pick a canonical and consolidate.
- **`heavy_custom_usage`** — a single consistent custom definition used in N≥3 charts. Resolution: codify in dbt so the BI layer stops carrying it.

Both surface as `INSIGHT` actions targeted at the project, with a structured `metadata.suggestion` carrying a YAML write-back proposal that the user can copy into their dbt repo (day-1) or merge as a PR (phase-2).

## Why now

Customers like Wise are hitting governance debt at scale and asking us to surface it. The PROD-7392 ticket bundles five capabilities; this spec ships the two that have a coherent, deterministic, end-to-end story (custom definitions → dbt write-back). The other three (high-traffic-unverified, optimisation suggestions, customer-defined guidelines) need separate infra (analytics-event aggregation, query-plan introspection, free-form policy input) and are scoped out.

## Out of scope

- BIN-type custom dimensions (don't map cleanly to dbt columns).
- Table calculations (post-query expressions; don't belong in dbt).
- High-views-but-unverified detection (PROD-7392 capability #1).
- Optimisation suggestions: pre-aggregates, joins, indexes, default filters (PROD-7392 capability #5).
- Customer-defined guidelines as free-form policy (PROD-7392 capability #2).
- **Auto-applying chart fixes after the canonical metric appears in dbt.** This is already implemented by the existing `replace-custom-metrics-on-compile` system — see "What already works" below. Earlier drafts of this spec proposed building a Step 3 here; that's redundant and has been removed.
- Chat-on-demand invocation. Tool is called by the scheduled autopilot run only.
- Per-project threshold configuration. N=3 is fixed for v1.

## What already works (don't rebuild)

### Existing primitives we plug into

- `ManagedAgentActionType.INSIGHT` exists (`packages/common/src/ee/types/managedAgent.ts:10`).
- `ManagedAgentTargetType.PROJECT` is already a valid target (`managedAgent.ts:17`).
- `handleLogInsight` accepts arbitrary `target_type` + opaque `metadata` and creates the action via `managedAgentModel.createAction` (`ManagedAgentService.ts:2492`). No new persistence path needed.
- Custom definitions live in dedicated tables — no JSONB scan required:
  - `saved_queries_version_additional_metrics`
  - `saved_queries_version_custom_sql_dimensions`
  - `saved_queries_version_table_calculations` (out of scope here)
- `DbtSchemaEditor` already knows how to write `additional_metrics` and SQL-type `custom_dimensions` into dbt YAML (`DbtSchemaEditor.ts:270`).
- `trackActionCreated` exists and fires on every `createAction` call.
- The reversal flow (`reversed_at` / `reversed_by_user_uuid`) doubles as dismissal for `INSIGHT` actions per `getManagedAgentActionCategory`.

### The post-promotion cleanup loop already exists

`FeatureFlags.ReplaceCustomMetricsOnCompile` gates a scheduler task that fires after every dbt project compile (`SchedulerTask.ts:1748`):

1. `findReplaceableCustomFields` (`ProjectService.ts:7875`) scans every chart in the project and looks for custom metrics whose name + SQL + filter conditions exactly match a real metric in the explore. Match logic in `findReplaceableCustomMetrics` (`fields.ts:250`) → `compareMetricAndCustomMetric`.
2. `replaceCustomFields` (`ProjectService.ts:7915`) calls `maybeReplaceFieldsInChartVersion` to remove the now-redundant custom metric from each chart's `metricQuery.additionalMetrics`. Has a `skipChartsUpdatedAfter` freshness check.
3. Tracks `custom_fields.replaced` analytics.

**This is the post-promotion cleanup phase.** Once a customer takes the YAML our governance INSIGHT proposes and adds it to their dbt project, the next compile fires this task and the affected charts auto-clean themselves. We do not need to re-implement this — the governance INSIGHT system completes the loop:

```
governance INSIGHT (this spec)        — surfaces "this should be in dbt"
       ↓
user copies YAML into dbt repo        — manual or PR (phase-2)
       ↓
dbt compile                            — existing infra
       ↓
replace-custom-metrics-on-compile     — existing scheduler task auto-cleans charts
```

**Implication for the UI:** The action sidebar's governance INSIGHT should set this expectation explicitly, so users understand they don't need to manually edit each affected chart. See "Frontend → Sidebar — INSIGHT" below for the "What happens next" caption.

## Data model

No DB migrations. All new state lives in `metadata` on existing `managed_agent_actions` rows.

### Insight metadata shape

In `packages/common/src/ee/types/managedAgent.ts`:

```ts
export type GovernanceInsightKind =
    | 'inconsistent_definitions'
    | 'heavy_custom_usage'
    | 'governance_rollup';

export type GovernanceDefinitionType = 'metric' | 'sql_dimension';

export type GovernanceVariant = {
    sql: string;                  // raw SQL as stored
    name: string;                 // raw name as stored
    chartCount: number;
    charts: Array<{
        savedQueryUuid: string;
        savedQueryName: string;
        spaceUuid: string;
    }>;
};

export type PromoteToDbtSuggestion = {
    kind: 'promote_to_dbt';
    canonicalSql: string | null;          // null when canonical fallback fires
    targetModel: string | null;           // dbt model name; null on multi-table SQL
    proposedMetricName: string;           // slugified name
    yamlSnippet: string | null;           // null when canonical is null
    rationale: string;                    // one sentence
};

export type GovernanceInsightMetadata = {
    insightKind: GovernanceInsightKind;
    definitionType: GovernanceDefinitionType;
    nameSlug: string;                     // dedupe key component
    variants: GovernanceVariant[];
    totalUsageCount: number;
    suggestion: PromoteToDbtSuggestion | null;  // null for rollup
};

export type GovernanceRollupMetadata = {
    insightKind: 'governance_rollup';
    remainingByKind: Record<
        Exclude<GovernanceInsightKind, 'governance_rollup'>,
        number
    >;
    totalRemaining: number;
};

export const getGovernanceInsightMetadata = (
    metadata: Record<string, unknown>,
): GovernanceInsightMetadata | GovernanceRollupMetadata | null => {
    // Runtime guard. Same defensive pattern as getFixedBrokenMetadata
    // at managedAgent.ts:109.
};
```

### Action shape

- `actionType: INSIGHT`
- `targetType: PROJECT`
- `targetUuid: project.uuid`
- `targetName: project.name`
- `description`: short title shown in the sidebar (agent-generated). Examples:
  - *"Custom metric `revenue` defined 3 different ways across 12 charts"*
  - *"Custom dimension `customer_segment` used in 14 charts — codify in dbt?"*
  - Rollup: *"12 additional governance findings detected"*
- `metadata`: `GovernanceInsightMetadata` or `GovernanceRollupMetadata`.

### Dedupe-on-rerun key

`(project_uuid, insightKind, definitionType, nameSlug)`. Skip logging when a non-reversed action already exists with this key. Reversal (= dismissal) lets the next finding through, but only if the underlying signal still holds.

Implemented in the tool, not the agent: the deterministic scan filters out groups whose key already has a live INSIGHT before passing the top-K to the LLM.

## Detection

Implemented as a pure read-only model method `governanceModel.findRepeatedCustomDefinitions(projectUuid)`. No LLM, fast, deterministic.

### Inputs

- All `saved_queries_version_additional_metrics` and `saved_queries_version_custom_dimensions` rows joined to the **latest** `saved_queries_version` per `saved_query_id`. Older versions are ignored — duplication on yesterday's draft of a chart isn't a real signal.
- `WHERE custom_dimension.type = 'sql'` for the dimension half. BIN dims excluded.
- Visibility filter: only charts the autopilot actor can read (existing `canActorViewTarget` pattern; see `ManagedAgentService.ts:706`).

### Grouping (union-find on same-purpose)

Two definitions are in the same group if **either**:
- their `name` slugs match (lowercased, non-alphanumerics → hyphens), **or**
- their normalized SQL hashes match.

SQL normalisation for v1: trim whitespace, collapse internal whitespace runs to single spaces, lowercase keywords. Conservative — false negatives ("two SQLs are equivalent but textually differ") are recoverable; false positives ("two SQLs aren't equivalent but normalise the same") are not.

Group key = `(definitionType, nameSlug)` of the most-used definition in the group.

### Classification

Per group:

| Condition | Finding |
|-----------|---------|
| Group has ≥2 distinct SQL hashes OR ≥2 distinct name slugs | `inconsistent_definitions` |
| Group has 1 SQL + 1 name slug AND `totalUsageCount ≥ 3` | `heavy_custom_usage` |
| Otherwise | discarded (single-use definition, no signal) |

A group can produce only one finding — `inconsistent_definitions` takes precedence over `heavy_custom_usage` when both could apply.

### Ranking and capping (top-K)

Rank by `totalUsageCount × max(1, distinctVariantCount)` descending. Take the top **K=10**. The remainder is summarised in a single rollup INSIGHT.

Detection scans everything (cheap); the LLM only reasons about K. This caps per-run LLM cost at ~10 reasoning passes regardless of project size.

### Output shape

```ts
type FindingsResult = {
    topFindings: Array<{
        insightKind: 'inconsistent_definitions' | 'heavy_custom_usage';
        definitionType: GovernanceDefinitionType;
        nameSlug: string;
        canonicalCandidate: { sql: string; name: string } | null; // null when ambiguous
        variants: GovernanceVariant[];
        totalUsageCount: number;
    }>;
    totalCount: number;
    remainingByKind: Record<GovernanceInsightKind, number>;
};
```

`canonicalCandidate` is set when one variant is strictly more popular (most-used SQL within the group). Ties or near-ties → null, signalling the agent should produce an INSIGHT without a YAML snippet.

## Backend

### New tool: `find_repeated_custom_definitions`

Read-only agent tool. Lives at `packages/backend/src/ee/services/ai/tools/findRepeatedCustomDefinitions.ts`.

Input: `{ project_uuid: string }`.
Output: stringified `FindingsResult`.

Implementation: thin wrapper around `governanceModel.findRepeatedCustomDefinitions(projectUuid)`. Visibility filter applied via `canActorViewTarget` for each chart in the variant lists before returning.

### Tool registration in autopilot agent

The autopilot's tool loop (existing pattern, same place `flag_content` and `log_insight` are wired) gets the new tool. The system prompt gains an entry instructing the agent to call it once per run and emit findings as INSIGHT actions.

System prompt addition (autopilot agent):

> Once per run, call `find_repeated_custom_definitions(project_uuid)` to scan for governance issues with custom definitions.
>
> For each finding in `topFindings`, call `log_insight` with:
>
> - `target_type: "project"`, `target_uuid: project_uuid`, `target_name: <project name>`
> - `description`: a one-sentence sidebar title. Format:
>   - inconsistent: *"Custom {metric|dimension} `{name}` defined {N} different ways across {M} charts"*
>   - heavy_usage: *"Custom {metric|dimension} `{name}` used in {M} charts — codify in dbt?"*
> - `metadata`: a `GovernanceInsightMetadata` populated with `insightKind`, `definitionType`, `nameSlug`, `variants`, `totalUsageCount`, and a `suggestion`.
>
> For the suggestion:
>
> - If `canonicalCandidate` is non-null, set `suggestion.canonicalSql` and `suggestion.proposedMetricName` from it, infer `targetModel` from the SQL (single FROM table → that table; multi-table → first FROM and note in `rationale`), generate `yamlSnippet` as the dbt YAML scaffolding for that metric or sql-dimension, and write a one-sentence `rationale` referencing the most-used count.
> - If `canonicalCandidate` is null, set `canonicalSql`, `targetModel`, `yamlSnippet` to `null`. The `rationale` should explain that the variants are too close in popularity to auto-pick. The UI will render a "pick canonical" affordance.
>
> If `totalCount > topFindings.length`, also call `log_insight` once with `metadata: GovernanceRollupMetadata` and `description: "{remaining} additional governance findings detected"`. Use `insightKind: "governance_rollup"`.
>
> Do not call `log_insight` for a finding whose `(project, insightKind, definitionType, nameSlug)` already has a non-reversed INSIGHT — the tool has already filtered these.

### YAML snippet generation

The agent constructs the YAML scaffolding directly. Shape for additional metrics:

```yaml
# {targetModel}.yml — additions
metrics:
  - name: {proposedMetricName}
    label: {proposedLabel}
    type: number
    sql: {canonicalSql}
```

For SQL-type custom dimensions, `DbtSchemaEditor` already produces the canonical YAML form for `isCustomSqlDimension`; the agent emits the same shape. Reuse `DbtSchemaEditor.ts:270` as the reference for output structure (don't import — the editor is for write paths, the snippet is read-only display).

### Apply endpoint (day-1: snippet-copy only)

No backend endpoint for "apply" in day-1. The user copies the snippet from the UI and pastes it into their dbt repo manually. Step 3 (catalog appearance triggers chart-fix proposals) detects the change via the catalog regardless of how the metric got there, so no client→server round-trip is needed for "I applied this" tracking.

A "mark as applied" UX action **does** need backend support — that's just the existing reversal flow with a different label in the dots menu ("Mark as applied" → reverse the action). No new endpoint.

### Phase-2 apply endpoint (PR creation)

Out of day-1 scope, but the shape is:

```
POST /api/v1/managed-agent/insights/apply-promote-to-dbt
Body: { actionUuids: string[] }   // multi-select
```

Handler:
1. Load all actions, validate each has `metadata.suggestion.kind === 'promote_to_dbt'` with non-null fields.
2. Group by `targetModel`.
3. Use the existing GitHub app installation for the project's connected dbt repo.
4. Create one branch, write all snippets via `DbtSchemaEditor` (one model file per group), open one PR.
5. Record the PR URL in each action's metadata under `suggestion.appliedPrUrl`.

The existing flag-suggestion spec's apply endpoint stays separate — different action type, different suggestion shape, different validation.

### Post-promotion chart cleanup — already exists

Removed from this spec. The post-promotion step ("once the canonical metric is in dbt, clean up the affected charts") is implemented today by `replace-custom-metrics-on-compile` (see "What already works" above). Customers with that flag enabled get the cleanup automatically on the next dbt compile after they merge the YAML.

Customers without that flag get a one-time manual cleanup pass: open each affected chart, switch the custom metric for the new dbt metric, save. The governance INSIGHT's variant list links directly to the affected charts to make this fast. The "What happens next" caption (see Frontend) sets the right expectation depending on flag state.

## Frontend

All in `packages/frontend/src/ee/features/managedAgent/`.

### Sidebar — INSIGHT with `targetType: PROJECT`

Today, the action sidebar has render paths for `FLAGGED_BROKEN`, `FIXED_BROKEN`, etc. PROJECT-targeted INSIGHT is new.

Render branch keyed on `action.actionType === INSIGHT && action.targetType === PROJECT && metadata.insightKind !== 'governance_rollup'`:

1. **Title** — `action.description`.
2. **Variant list** — for each `metadata.variants[i]`:
   - Definition SQL in a syntax-highlighted block.
   - Chip: `Used in {chartCount} chart{s}`.
   - Expandable list of chart names linking to `/projects/{projectUuid}/saved/{savedQueryUuid}`.
3. **Suggestion section** (when `suggestion.canonicalSql !== null`):
   - Banner: `Proposed canonical version`.
   - YAML snippet in a `Prism`-rendered code block.
   - "Copy snippet" button.
   - Caption explaining the `rationale`.
4. **No-canonical state** (when `suggestion.canonicalSql === null`):
   - Banner: `Multiple variants are equally common — pick a canonical to generate a YAML proposal`.
   - Day-1: read-only — caption only, no picker. Phase-2 wires up the picker.
5. **What happens next caption** — below the suggestion, a small `c="dimmed"` paragraph that sets the right expectation for chart cleanup:
   - "Once you add this metric to your dbt project, the next compile will automatically replace the affected charts' custom metrics with the new dbt metric (via `replace-custom-metrics-on-compile`)."
   - This is the only place in the UI that references the existing scheduler task by name. Day-1 is unconditional copy; phase-2 could read the project's flag state and adjust copy ("…if `replace-custom-metrics-on-compile` is enabled for this project") but that's overkill for v1.
6. **Multi-select checkbox** at the top of each insight card (day-1 — combined-snippet path):
   - Sidebar gains a "Copy combined snippet" CTA at the top when ≥1 insight is selected.
   - Concatenates selected `yamlSnippet`s, grouping by `targetModel` with one heading per model.
7. **Reversal** stays in the dots menu. Add an alias label "Mark as applied" alongside "Dismiss" — same backend action, different copy.

### Sidebar — `governance_rollup`

Render branch keyed on `metadata.insightKind === 'governance_rollup'`:

- Title: action.description.
- One paragraph: *"Autopilot found N additional governance issues this run. K were surfaced individually above. Re-run autopilot or contact the team if you want a full audit."*
- No suggestion, no apply, just the dismiss menu.

### Slack delivery

Existing autopilot Slack delivery posts a summary message per run. Extend the message template to include a single "Governance: N findings" line when the run produced any governance INSIGHTs. **Do not** post one message per insight — that's where the noise risk is.

## Decisions

### 1. INSIGHT vs new action type

Rejected: adding `FLAGGED_GOVERNANCE_*` action types. The existing `INSIGHT` type was added precisely to be the catch-all for agent-detected patterns. Adding more enum values fragments the sidebar render logic and the action-type analytics with no UX gain — discrimination happens via `metadata.insightKind`.

### 2. Action target = PROJECT, not CHART

Rejected: per-chart actions cross-referenced by metadata. The chart isn't broken; it's a symptom. The user's actual fix is one dbt PR, not 12 chart edits. Per-project actions match the unit of work and avoid 12-action sprawl per group.

### 3. Suggestion-apply infrastructure stays separate from FLAGGED_BROKEN

Rejected: generalising the flag-suggestion spec's apply endpoint to cover INSIGHT. The suggestion shapes diverge meaningfully — `FLAGGED_BROKEN` carries a chart-replacement payload (`metricQuery + chartConfig`), `INSIGHT.promote_to_dbt` carries a YAML write-back payload (`canonicalSql + targetModel + yamlSnippet`). Forcing them into one discriminated union just to share an endpoint creates parameters that are mostly null on either side.

When phase-2 Step 3 lands (chart-targeted INSIGHTs whose suggestion shape **does** match `FLAGGED_BROKEN`'s), the **internal write helper** that does `validateChartPayload → createVersion → deleteChartValidations` should be extracted from `applyFlagSuggestion` and shared. That's deduplication, not entanglement.

### 4. Threshold N=3 fixed for `heavy_custom_usage`

Rejected: N=2. Copy-paste of charts is the dominant cause of 2-instance duplication, not real cross-team duplication. N=3 gives a defensible "rule-of-three" signal floor and cuts false positives substantially. False negatives at N=3 are recoverable — the third occurrence triggers the insight one run later.

Rejected: configurable per-project. Day-1 customer signal will tell us whether 3 is right; tuning later via a settings field is a one-line change.

### 5. K=10 + rollup vs no cap

Rejected: no cap. The cost is LLM reasoning per finding (rationale + YAML construction + log_insight call). 50 findings = ~50 tool round-trips per run, which dominates run time and run cost. K=10 keeps the per-run cost bounded; the rollup preserves discoverability of the long tail.

Rejected: K=5. Too tight for mature projects — surfacing 50 findings would take 10 daily runs, which feels stalled.

### 6. Snippet day-1, PR phase-2

Rejected: PR creation day-1. Requires GitHub app on the dbt repo specifically, which is not universal. Snippet-copy works for every customer and demos the value end-to-end. PR creation is a UX upgrade for the subset of customers with the integration in place.

Rejected: never doing PR. With multi-select copy, 10 snippets is still 10 paste actions in the dbt repo. PR consolidation is a real win when ≥3 findings are being applied at once. Catalog-as-trigger means Step 3 doesn't care whether the metric arrived via paste or PR.

### 7. Catalog-as-source-of-truth for Step 3 (phase-2)

Rejected: button-click marks "applied" and triggers Step 3. The user might mark applied without actually merging, or merge without marking. Either path desyncs the system. The catalog is the actual source of truth for "is this metric in dbt" — relying on it makes Step 3 robust regardless of how the metric got there.

### 8. Step 3 propose-with-confirm, not auto-apply

Rejected: auto-apply on confidence-high matches. The chart's `additionalMetric.sql` may match the canonical bit-for-bit but differ in subtle ways (alias casing, parens, whitespace) — silent swaps with semantic changes break customer trust. The flag-suggestion spec's reversal-stickiness issue (`§3` of that spec) shows the cost of over-eager auto-apply. Day-1 is propose-only; auto-apply is a phase-2+ optimisation gated on observed apply-rate telemetry.

### 9. Default ON, no feature flag

Rejected: `toolSettings` opt-in. Autopilot itself is opt-in; re-gating inside an opt-in feature is redundant. Customers who turn on autopilot are signing up for the agent's audit behaviour. The dedupe-on-rerun key bounds steady-state noise, and the K=10 cap bounds first-run noise.

### 10. SQL normalisation: simple v1, parser-based v2

Rejected for v1: full SQL parsing for canonicalisation. Parsing across all warehouse dialects (Postgres, BigQuery, Snowflake, DuckDB) with semantic-equivalence detection is a project unto itself. v1 uses whitespace + lowercase normalisation — false negatives are preferable to false positives here. v2 can layer on the formula package's parser or a SQLGlot-equivalent if telemetry shows the false-negative rate is hurting.

## Risks

- **Mature-project first-run flood.** A project with 50 real findings will see 11 INSIGHTs at once (10 + rollup). Mitigation: rollup makes it digestible, K=10 keeps the LLM bounded, and dedupe-on-rerun makes subsequent runs quiet.
- **Wrong canonical pick.** Most-used heuristic can pick the wrong SQL when usage counts are close. Mitigation: ambiguous groups (no canonical candidate) skip the YAML proposal entirely. False-positive ratio depends on real-world data; instrument apply-vs-dismiss rate per kind to monitor.
- **Multi-table SQL.** The `targetModel` heuristic (first FROM table) is a guess for joined SQL. Mitigation: agent's `rationale` flags the guess; user can edit the snippet before pasting. Phase-2 PR mode could refuse to auto-open PRs for multi-table cases.
- **Rotated chart authors.** A chart's custom metric with unusual SQL might be the only authoritative version because the original author left. Mitigation: not addressed in v1 — informational variant list lets the user notice the outlier and override the agent's pick.

## Telemetry

Extend `trackActionCreated` (already fires on every `createAction`) to carry:

- `insightKind` (when `actionType === INSIGHT`)
- `definitionType` (when applicable)
- `variantCount`
- `totalUsageCount`
- `hasCanonical` (boolean)

Add a separate event on the existing reversal flow:

- `governance_insight_dismissed` with `{ insightKind, definitionType, hadCanonical, ageInRuns }`.

These let us measure:

- Per-kind apply rate (signal of suggestion quality).
- Per-kind dismiss rate (signal of false-positive rate).
- Time-to-dismiss (signal of severity/urgency from the user's perspective).

Used to tune K, the threshold, and the canonical heuristic in v1.1.

## Migration / rollout

No DB migration. No config migration. No backfill. The new tool is added to the autopilot's toolset, the prompt is updated, the frontend learns the new render branches. Next scheduled autopilot run on each project starts producing INSIGHTs.

If the first-run flood turns out worse than expected, K can be lowered via a single constant change without spec churn.
