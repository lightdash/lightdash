# GLITCH-264 — Configurable labels for standard granularities

**Ticket:** [GLITCH-264](https://linear.app/lightdash/issue/GLITCH-264) — "I would like to be able to configure labels for standard granularities"
**GitHub issue:** #21255
**Milestone:** Control the zoom (project: Make date zoom configurable)
**Status:** Design approved 2026-06-26

## Problem

Lightdash hard-codes the display labels for standard granularities — `Day`, `Week`, `Month`,
`Quarter`, `Year` (and the rest) come from `timeFrameConfigs[tf].getLabel()` in
`packages/common/src/utils/timeFrames.ts`. There is no way to relabel them.

Customers who define a **custom granularity** (e.g. "Week starting Friday") end up with both
`Week` and `Week starting Friday` in the date zoom, which is confusing. They want to relabel the
standard `Week` → `Week starting Monday` to disambiguate.

> "Users need to configure labels for standard date granularities because having both 'Week' and
> 'Week starting Friday' in the date zoom can be confusing. They want flexibility to relabel
> options, like changing 'week' to 'week starting Monday,' to improve usability."

## Goal

Let a project relabel standard granularities via `lightdash.config.yml`. The override appears in the
places a user reads a granularity name: the **Explorer dimension labels**, the **Explorer sidebar
tree**, and the **date-zoom dropdown**.

### Scope

In scope:
- Explorer dimension label (the compiled `dimension.label`, e.g. "Created Week").
- Explorer sidebar tree node (the grain child label, e.g. "Week").
- Date-zoom dropdown.

Out of scope (deliberate):
- **Chart-axis `${field.granularity}` interpolation** — deferred to a follow-up PR (see Follow-up).
- **Period-over-period labels** — left untouched.
- **The custom-SQL `date_zoom` parameter value** — must stay canonical/lowercase; not touched.

## Design

### 1. Config shape

A general (not date-zoom-scoped) field under the existing `defaults` block:

```yaml
defaults:
  granularity_labels:
    week: "Week starting Monday"
    month: "Calendar Month"
```

- Keyed by standard granularity name (the same vocabulary as `time_intervals`: `day`, `week`,
  `month`, `quarter`, `year`, sub-day, etc.), normalized to the `TimeFrames` enum internally.
- Type on `ProjectDefaults`:
  ```typescript
  granularity_labels?: Record<string, string>;
  ```

### 2. Resolution / validation (one-shot)

A resolver in `packages/common/src/compiler/lightdashProjectConfig.ts` (next to
`resolveAdditionalTimeIntervals`):

```
resolveGranularityLabels(granularity_labels): Partial<Record<TimeFrames, string>>
```

- Each key must be a known standard `TimeFrame` (validate against `timeFrameConfigs` / `isTimeInterval`);
  unknown keys are dropped with a single `console.warn` (mirrors GLITCH-265's resolver).
- Output is keyed by `TimeFrames` (uppercased), values are the label strings as authored.

### 3. Central label resolver (the "thread it through `timeFrames.ts`" point)

New helper in `packages/common/src/utils/timeFrames.ts`:

```typescript
export const getTimeFrameLabel = (
    tf: TimeFrames,
    overrides?: Partial<Record<TimeFrames, string>>,
): string => overrides?.[tf] ?? timeFrameConfigs[tf].getLabel();
```

When no overrides are present it returns exactly `timeFrameConfigs[tf].getLabel()` — byte-for-byte
current behaviour.

### 4. Single source on the compiled `Explore`

`convertExplores` (which holds `lightdashProjectConfig`) resolves the map once and attaches it to the
compiled explore:

```typescript
Explore.granularityLabels?: Partial<Record<TimeFrames, string>>;
```

Every in-scope frontend surface reads the override from the explore it already has in context — no
new API endpoint, no project-config-to-frontend plumbing.

### 5. Surfaces

1. **Explorer dimension label** — `translator.ts:182` and `exploreCompiler.ts:1657` build the
   compound label `${baseLabel} ${grain}`. Switch the grain part to `getTimeFrameLabel(tf, overrides)`.
   **Casing nuance:** today the grain is lowercased (`getLabel().toLowerCase()` → "Created week").
   When an override is present, use it **verbatim** (`"Created Week starting Monday"`); when absent,
   keep the existing `.toLowerCase()` behaviour.
2. **Explorer sidebar tree node** — `TreeSingleNode.tsx:296` renders
   `timeFrameConfigs[item.timeInterval].getLabel()`. Switch to
   `getTimeFrameLabel(item.timeInterval, explore.granularityLabels)` (the explore is available in the
   Explorer context).
3. **Date zoom** — `getDateZoomCapabilities` (`common/utils/dateZoom.ts`) returns a new
   `granularityLabels` field from `explore.granularityLabels`. It rides the existing
   `availableCustomGranularities` plumbing (`DashboardTileStatusProvider` → dashboard context → the
   date-zoom components). `getGranularityLabel(g, customLabels, granularityLabels?)` checks the
   override for standard grains first (mapping `DateGranularity → TimeFrames` via
   `dateGranularityToTimeFrameMap`), then falls back to the enum value.

### 6. No behaviour change without config

When `granularity_labels` is absent, `resolveGranularityLabels` returns `{}`, `getTimeFrameLabel`
returns the built-in label, `Explore.granularityLabels` is undefined, and every surface renders
exactly as today. Purely additive.

## Testing

- Unit (`common`): `getTimeFrameLabel` (override vs fallback); `resolveGranularityLabels` (valid key,
  unknown key dropped + warned); `getDateZoomCapabilities` surfaces `granularityLabels`.
- Compiler: a dimension's compiled `label` reflects the override verbatim; no override → unchanged
  (lowercased) behaviour.
- e2e (jaffle): set `week: "Week starting Monday"`, refresh → Explorer dimension label, sidebar tree,
  and date-zoom dropdown all show it; an explore with no config is unchanged; the custom-SQL
  `date_zoom` value and chart-axis labels still render the canonical lowercase value.

## Files touched (anticipated)

- `packages/common/src/types/lightdashProjectConfig.ts` — `ProjectDefaults.granularity_labels`.
- `packages/common/src/utils/timeFrames.ts` — `getTimeFrameLabel`.
- `packages/common/src/compiler/lightdashProjectConfig.ts` — `resolveGranularityLabels`.
- `packages/common/src/compiler/translator.ts` + `exploreCompiler.ts` — use the resolver/helper;
  attach `granularityLabels` to the explore; verbatim-casing for overridden grains.
- `packages/common/src/types/explore.ts` — `Explore.granularityLabels`.
- `packages/common/src/utils/dateZoom.ts` — surface `granularityLabels` in `DateZoomCapabilities`.
- `packages/frontend/.../TreeSingleNode.tsx` — read the override.
- `packages/frontend/src/features/dateZoom/utils.ts` (`getGranularityLabel`) + the date-zoom
  components + `DashboardTileStatusProvider` / `tileStatusTypes` — thread the map.
- `packages/common/src/schemas/json/lightdash-project-config-1.0.json` — schema for the new field.
- Tests alongside the above.

## Follow-up (separate PR): chart-axis `${field.granularity}` — [GLITCH-528](https://linear.app/lightdash/issue/GLITCH-528)

Deferred to keep this PR small. Estimate already done:
- **Zero query risk** — the custom-SQL `date_zoom` value comes from `getGranularityReferenceValue`
  (`types/timeFrames.ts:81`), whose only SQL consumer is `reservedParameters.ts:33`; that line is
  not modified.
- **Contained display fork** — all chart-label interpolation routes through one function,
  `resolveGranularityInLabel` (`utils/bigNumber.ts:44`), called from 5 chart hooks
  (`useBigNumberConfig`, `useEchartsCartesianConfig`, `useEchartsPieConfig`, `useEchartsFunnelConfig`,
  `useEchartsGaugeConfig`). Add an optional override param; apply it **only for standard grains that
  have an override** — non-overridden grains still render the current lowercase value, so no default
  behaviour change.
- The override map (`Explore.granularityLabels`) reaches those hooks via the viz context, or by
  baking a per-grain-dimension label so the hooks read it straight off `itemsMap`.
