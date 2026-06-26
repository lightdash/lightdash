# GLITCH-264 — Configurable standard-granularity labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project relabel standard granularities (e.g. `Week` → `Week starting Monday`) via `lightdash.config.yml`, reflected in Explorer dimension labels, the Explorer sidebar tree, and the date-zoom dropdown.

**Architecture:** A project-config map `defaults.granularity_labels` is validated once in `convertExplores`, then (a) baked into each interval dimension's compiled `label` (verbatim when overridden) and onto a new `Dimension.timeIntervalLabel`, and (b) attached to the compiled `Explore.granularityLabels`. The Explorer tree reads `timeIntervalLabel`; the date zoom merges the override into the existing `availableCustomGranularities` map so `getGranularityLabel` resolves it with no call-site churn. The custom-SQL `date_zoom` value path is untouched.

**Tech Stack:** TypeScript, pnpm workspaces, Jest (`packages/common`, `packages/frontend`).

## Global Constraints

- Package manager **pnpm** only; prefix installs with `sfw`.
- Git: end commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; prefix git with `NODE_OPTIONS= ` to avoid the husky preload crash. Never `--no-verify`.
- Branch: `feature/glitch-264` (already created, off latest `main`).
- Package commands: `pnpm -F common test`, `pnpm -F common typecheck:fast`, `pnpm -F common lint`, `pnpm -F frontend typecheck:fast`, `pnpm -F frontend lint`.
- Code style: intentional types (no duck typing); `null`/optional per the repo rules; minimal comments; `assertUnreachable` for exhaustive switches.
- **Locked design decisions:**
  - Config field name is `granularity_labels` (general, NOT date-zoom-scoped), under `defaults`.
  - Additive: no config → byte-for-byte current behaviour.
  - Override is applied **verbatim** (not lowercased) when baking the compound dimension label.
  - **Do not modify** `getGranularityReferenceValue` (`types/timeFrames.ts`) or `reservedParameters.ts` — the custom-SQL `date_zoom` value must stay canonical/lowercase. Chart-axis + period-over-period are OUT of scope (chart-axis = follow-up GLITCH-528).

---

### Task 1: Types + central label helper (`common`)

**Files:**
- Modify: `packages/common/src/types/lightdashProjectConfig.ts` (`ProjectDefaults.granularity_labels`)
- Modify: `packages/common/src/types/field.ts` (`Dimension.timeIntervalLabel`)
- Modify: `packages/common/src/types/explore.ts` (`Explore.granularityLabels`)
- Modify: `packages/common/src/utils/timeFrames.ts` (`getTimeFrameLabel`)
- Test: `packages/common/src/utils/timeFrames.test.ts`

**Interfaces:**
- Produces:
  - `ProjectDefaults.granularity_labels?: Record<string, string>`
  - `Dimension.timeIntervalLabel?: string`
  - `Explore.granularityLabels?: Partial<Record<TimeFrames, string>>`
  - `getTimeFrameLabel(tf: TimeFrames, overrides?: Partial<Record<TimeFrames, string>>): string`

- [ ] **Step 1: Add the config field to `ProjectDefaults`**

In `packages/common/src/types/lightdashProjectConfig.ts`, add to the `ProjectDefaults` type (alongside `additional_time_intervals`):

```typescript
    /**
     * Override the display label of standard granularities (e.g. `week`:
     * "Week starting Monday"). Keyed by standard granularity name; applies to
     * Explorer dimension labels, the Explorer sidebar tree, and the date zoom.
     */
    granularity_labels?: Record<string, string>;
```

- [ ] **Step 2: Add `timeIntervalLabel` to the Dimension type**

In `packages/common/src/types/field.ts`, find the `Dimension` type's `timeInterval?: TimeFrames;` field (~line 681) and add directly below it:

```typescript
    /** Overridden display label for this dimension's grain (project
     *  `granularity_labels`); undefined when no override — callers fall back
     *  to `timeFrameConfigs[timeInterval].getLabel()`. */
    timeIntervalLabel?: string;
```

- [ ] **Step 3: Add `granularityLabels` to the Explore type**

In `packages/common/src/types/explore.ts`, inside `export type Explore = {` (after `parameters?:`, ~line 119) add:

```typescript
    /** Project `granularity_labels` overrides, keyed by TimeFrames. Consumed
     *  by the date zoom to relabel standard granularities. */
    granularityLabels?: Partial<Record<TimeFrames, string>>;
```

Ensure `TimeFrames` is imported in `explore.ts` (it imports from `./timeFrames` already for other types; if not, add `import { type TimeFrames } from './timeFrames';`).

- [ ] **Step 4: Write the failing test for `getTimeFrameLabel`**

In `packages/common/src/utils/timeFrames.test.ts`, add `getTimeFrameLabel` to the existing import from `'./timeFrames'`, then add inside `describe('TimeFrames', ...)`:

```typescript
describe('getTimeFrameLabel', () => {
    it('returns the built-in label when no overrides', () => {
        expect(getTimeFrameLabel(TimeFrames.WEEK)).toBe('Week');
        expect(getTimeFrameLabel(TimeFrames.MONTH, {})).toBe('Month');
    });

    it('returns the override verbatim when present', () => {
        expect(
            getTimeFrameLabel(TimeFrames.WEEK, {
                [TimeFrames.WEEK]: 'Week starting Monday',
            }),
        ).toBe('Week starting Monday');
    });

    it('falls back to built-in for grains without an override', () => {
        expect(
            getTimeFrameLabel(TimeFrames.MONTH, {
                [TimeFrames.WEEK]: 'Week starting Monday',
            }),
        ).toBe('Month');
    });
});
```

- [ ] **Step 5: Run the test, verify it fails**

Run: `pnpm -F common test -- timeFrames`
Expected: FAIL — `getTimeFrameLabel is not a function`.

- [ ] **Step 6: Implement `getTimeFrameLabel`**

In `packages/common/src/utils/timeFrames.ts`, immediately after the `timeFrameConfigs` object (closes at line 1012), add:

```typescript
/**
 * Display label for a time frame, honouring project-level `granularity_labels`
 * overrides. Returns the built-in `timeFrameConfigs` label when no override.
 */
export const getTimeFrameLabel = (
    tf: TimeFrames,
    overrides?: Partial<Record<TimeFrames, string>>,
): string => overrides?.[tf] ?? timeFrameConfigs[tf].getLabel();
```

- [ ] **Step 7: Run the test + typecheck**

Run: `pnpm -F common test -- timeFrames && pnpm -F common typecheck:fast`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/common/src/types/lightdashProjectConfig.ts packages/common/src/types/field.ts packages/common/src/types/explore.ts packages/common/src/utils/timeFrames.ts packages/common/src/utils/timeFrames.test.ts
NODE_OPTIONS= git commit -m "feat(glitch-264): add granularity_labels types and getTimeFrameLabel helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Config resolver (`common`)

**Files:**
- Modify: `packages/common/src/compiler/lightdashProjectConfig.ts` (`resolveGranularityLabels`)
- Test: `packages/common/src/compiler/lightdashProjectConfig.test.ts`

**Interfaces:**
- Consumes (Task 1): `ProjectDefaults.granularity_labels`, `getTimeFrameLabel` (not needed here), `isStandardTimeFrame` (already defined in this file from GLITCH-265), `TimeFrames`.
- Produces: `resolveGranularityLabels(granularityLabels: ProjectDefaults['granularity_labels']): Partial<Record<TimeFrames, string>>`

- [ ] **Step 1: Write the failing test**

In `packages/common/src/compiler/lightdashProjectConfig.test.ts`, add:

```typescript
import { resolveGranularityLabels } from './lightdashProjectConfig';
import { TimeFrames } from '../types/timeFrames';

describe('resolveGranularityLabels', () => {
    const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
    afterEach(() => warnSpy.mockClear());
    afterAll(() => warnSpy.mockRestore());

    it('returns empty object when config is undefined', () => {
        expect(resolveGranularityLabels(undefined)).toEqual({});
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('keys by uppercased TimeFrames and keeps the label verbatim', () => {
        expect(
            resolveGranularityLabels({ week: 'Week starting Monday' }),
        ).toEqual({ [TimeFrames.WEEK]: 'Week starting Monday' });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('drops an unknown granularity key and warns', () => {
        expect(resolveGranularityLabels({ nonsense: 'X' })).toEqual({});
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F common test -- lightdashProjectConfig`
Expected: FAIL — `resolveGranularityLabels is not a function`.

- [ ] **Step 3: Implement the resolver**

In `packages/common/src/compiler/lightdashProjectConfig.ts`, after `resolveAdditionalTimeIntervals` (ends ~line 162), add:

```typescript
/**
 * Validate `defaults.granularity_labels` once: keep entries whose key is a
 * standard granularity (keyed by uppercased TimeFrames, label verbatim); drop
 * unknown keys with a single console.warn.
 */
export const resolveGranularityLabels = (
    granularityLabels: ProjectDefaults['granularity_labels'],
): Partial<Record<TimeFrames, string>> =>
    Object.entries(granularityLabels ?? {}).reduce<
        Partial<Record<TimeFrames, string>>
    >((acc, [rawKey, label]) => {
        const upper = rawKey.toUpperCase();
        if (isStandardTimeFrame(upper)) {
            return { ...acc, [upper]: label };
        }
        // eslint-disable-next-line no-console
        console.warn(
            `Ignoring unknown granularity "${rawKey}" in defaults.granularity_labels — not a standard granularity.`,
        );
        return acc;
    }, {});
```

(`isStandardTimeFrame` and `TimeFrames` are already imported in this file from the GLITCH-265 work. If `TimeFrames` is only imported as a type, change it to a value import since the return type references it as a type only — no value use here, so a type import suffices.)

- [ ] **Step 4: Run the test + typecheck**

Run: `pnpm -F common test -- lightdashProjectConfig && pnpm -F common typecheck:fast`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/common/src/compiler/lightdashProjectConfig.ts packages/common/src/compiler/lightdashProjectConfig.test.ts
NODE_OPTIONS= git commit -m "feat(glitch-264): resolve and validate granularity_labels config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Compile wiring — bake labels + attach to explore (`common`)

**Files:**
- Modify: `packages/common/src/compiler/translator.ts` (thread map; bake `label` + set `timeIntervalLabel`; resolve + attach in `convertExplores`)
- Modify: `packages/common/src/compiler/exploreCompiler.ts` (zoomed-dim label + `timeIntervalLabel`)
- Test: `packages/common/src/compiler/translator.test.ts`

**Interfaces:**
- Consumes: `getTimeFrameLabel` (Task 1), `resolveGranularityLabels` (Task 2), `Explore.granularityLabels`, `Dimension.timeIntervalLabel`.
- Produces: `convertTable(..., granularityLabels?: Partial<Record<TimeFrames, string>>)` and `convertDimension(..., granularityLabels?)` — new optional trailing params; `explore.granularityLabels` populated.

- [ ] **Step 1: Write the failing tests**

In `packages/common/src/compiler/translator.test.ts`, add (reuses `model`, `warehouseClientMock`, `DEFAULT_SPOTLIGHT_CONFIG`, `SupportedDbtAdapter`, `TimeFrames`, `DimensionType` already imported):

```typescript
describe('granularity_labels overrides', () => {
    const TS_MODEL: DbtModelNode & { relation_name: string } = {
        ...model,
        columns: {
            created: {
                name: 'created',
                data_type: DimensionType.TIMESTAMP,
                meta: { dimension: { type: DimensionType.TIMESTAMP } },
            },
        },
    };

    it('bakes the override verbatim into the week dimension label + timeIntervalLabel', async () => {
        const explores = await convertExplores(
            [TS_MODEL],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                defaults: { granularity_labels: { week: 'Week starting Monday' } },
            },
        );
        const explore = explores[0];
        expect('errors' in explore).toBe(false);
        if (!('errors' in explore)) {
            const dims = explore.tables[explore.baseTable].dimensions;
            // Override is verbatim (not lowercased) in the compound label
            expect(dims.created_week.label).toContain('Week starting Monday');
            expect(dims.created_week.timeIntervalLabel).toBe('Week starting Monday');
            // Non-overridden grain keeps default lowercased behaviour + no timeIntervalLabel
            expect(dims.created_month.label).toContain('month');
            expect(dims.created_month.timeIntervalLabel).toBeUndefined();
            // The map is attached to the explore
            expect(explore.granularityLabels).toEqual({
                [TimeFrames.WEEK]: 'Week starting Monday',
            });
        }
    });

    it('is unchanged when no granularity_labels are configured', async () => {
        const explores = await convertExplores(
            [TS_MODEL],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        );
        const explore = explores[0];
        if (!('errors' in explore)) {
            const dims = explore.tables[explore.baseTable].dimensions;
            expect(dims.created_week.label).toContain('week');
            expect(dims.created_week.timeIntervalLabel).toBeUndefined();
            expect(explore.granularityLabels).toBeUndefined();
        }
    });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm -F common test -- translator`
Expected: FAIL — `timeIntervalLabel`/`granularityLabels` undefined; label still lowercased.

- [ ] **Step 3: Thread `granularityLabels` into `convertDimension` and bake the label**

In `packages/common/src/compiler/translator.ts`:

(a) Add the imports: in the existing `'../utils/timeFrames'` import add `getTimeFrameLabel`; in the `'./lightdashProjectConfig'` import add `resolveGranularityLabels`.

(b) Add `granularityLabels?: Partial<Record<TimeFrames, string>>` as a new optional **last** parameter to `convertDimension` (find its signature) and to `convertTable` (after `additionalTimeIntervals`).

(c) Replace the interval label block (currently lines 180–183):

```typescript
        name = `${column.name}_${timeInterval.toLowerCase()}`;
        const grainOverride = granularityLabels?.[timeInterval];
        label = grainOverride
            ? `${label} ${grainOverride}`
            : `${label} ${timeFrameConfigs[timeInterval]
                  .getLabel()
                  .toLowerCase()}`;
```

(d) In the dimension object returned by `convertDimension` (the `return { index, fieldType: ..., name, label, ... }` near line 192), add the `timeIntervalLabel` (only when overridden):

```typescript
        ...(timeInterval && granularityLabels?.[timeInterval]
            ? { timeIntervalLabel: granularityLabels[timeInterval] }
            : {}),
```

(e) Ensure every `convertDimension(...)` call inside `convertTable` (base dim, interval dims in `processIntervalDimension`, additional dims) forwards `granularityLabels` as the new trailing arg. Ensure `convertTable`'s call site in `convertExplores` forwards it too.

- [ ] **Step 4: Resolve + attach in `convertExplores`**

In `convertExplores` (after the existing `const additionalTimeIntervals = resolveAdditionalTimeIntervals(...)`), add:

```typescript
    const granularityLabels = resolveGranularityLabels(
        lightdashProjectConfig.defaults?.granularity_labels,
    );
```

Pass `granularityLabels` as the new trailing arg to the `convertTable(...)` call. Then, where the per-model `tableWithLineage` explore object is assembled into the returned explore, attach the map only when non-empty. Find where `convertExplores` builds the final `Explore` object (the object spreading `tables`, `baseTable`, etc.) and add:

```typescript
        ...(Object.keys(granularityLabels).length > 0
            ? { granularityLabels }
            : {}),
```

- [ ] **Step 5: Apply the override in the zoomed-dimension path (`exploreCompiler.ts`)**

In `packages/common/src/compiler/exploreCompiler.ts`, the zoomed-dim creation (~line 1654) builds `label: ${baseTimeDimension.label} ${timeFrameConfigs[newTimeInterval].getLabel().toLowerCase()}`. Replace with override-aware logic (the `explore` is in scope here):

```typescript
            label: explore.granularityLabels?.[newTimeInterval]
                ? `${baseTimeDimension.label} ${explore.granularityLabels[newTimeInterval]}`
                : `${baseTimeDimension.label} ${timeFrameConfigs[newTimeInterval]
                      .getLabel()
                      .toLowerCase()}`,
            ...(explore.granularityLabels?.[newTimeInterval]
                ? { timeIntervalLabel: explore.granularityLabels[newTimeInterval] }
                : {}),
```

(Confirm the surrounding object is the zoomed dimension being returned; add `timeIntervalLabel` as a sibling of `label`.)

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `pnpm -F common test -- translator && pnpm -F common typecheck:fast && pnpm -F common lint`
Expected: new tests PASS; existing translator/exploreCompiler tests unchanged; no type/lint errors.

- [ ] **Step 7: Commit**

```bash
git add packages/common/src/compiler/translator.ts packages/common/src/compiler/exploreCompiler.ts packages/common/src/compiler/translator.test.ts
NODE_OPTIONS= git commit -m "feat(glitch-264): bake granularity_labels into compiled dimension labels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Date-zoom capabilities surface the override (`common`)

**Files:**
- Modify: `packages/common/src/utils/dateZoom.ts` (`getDateZoomCapabilities` merges standard overrides into `availableCustomGranularities`)
- Test: `packages/common/src/utils/dateZoom.test.ts`

**Interfaces:**
- Consumes: `Explore.granularityLabels` (Task 1/3), `timeFrameToDateGranularityMap` (already in `types/timeFrames.ts`).
- Produces: `getDateZoomCapabilities(explore, metricQuery).availableCustomGranularities` now also contains standard-grain overrides keyed by the `DateGranularity` value (e.g. `{ Week: "Week starting Monday" }`).

- [ ] **Step 1: Write the failing test**

In `packages/common/src/utils/dateZoom.test.ts` (create the describe if the file lacks one; import `getDateZoomCapabilities`, and build a minimal `Explore` with `granularityLabels: { WEEK: 'Week starting Monday' }` and an empty `metricQuery`):

```typescript
it('exposes standard granularity overrides keyed by DateGranularity', () => {
    const explore = {
        ...baseExplore, // a minimal Explore with tables/baseTable
        granularityLabels: { WEEK: 'Week starting Monday' },
    } as unknown as Explore;
    const caps = getDateZoomCapabilities(explore, EMPTY_METRIC_QUERY);
    expect(caps.availableCustomGranularities.Week).toBe('Week starting Monday');
});
```

(If `dateZoom.test.ts` does not exist, create it next to `dateZoom.ts` with the standard test scaffolding used by sibling tests in `packages/common/src/utils`, a minimal `baseExplore` literal with `tables: {}` and `baseTable`, and `EMPTY_METRIC_QUERY = { exploreName: 'x', dimensions: [], metrics: [], filters: {}, sorts: [], limit: 1, tableCalculations: [] }`.)

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F common test -- dateZoom`
Expected: FAIL — `availableCustomGranularities.Week` is undefined.

- [ ] **Step 3: Merge the overrides in `getDateZoomCapabilities`**

In `packages/common/src/utils/dateZoom.ts`, import `timeFrameToDateGranularityMap` from `'../types/timeFrames'`. In `getDateZoomCapabilities`, after the existing loop that fills `availableCustomGranularities` from `dim.customTimeInterval` (ends ~line 155), add:

```typescript
    // Standard-granularity label overrides (project `granularity_labels`) are
    // surfaced under the same map keyed by the DateGranularity value, so the
    // date zoom renders them via getGranularityLabel. They are project-global,
    // so they apply regardless of which dims the dashboard tiles reference.
    for (const [tf, label] of Object.entries(explore.granularityLabels ?? {})) {
        const dateGranularity =
            timeFrameToDateGranularityMap[tf as TimeFrames];
        if (dateGranularity) {
            availableCustomGranularities[dateGranularity] = label;
        }
    }
```

(Add a `TimeFrames` import if not present.)

- [ ] **Step 4: Run the test + typecheck**

Run: `pnpm -F common test -- dateZoom && pnpm -F common typecheck:fast`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/common/src/utils/dateZoom.ts packages/common/src/utils/dateZoom.test.ts
NODE_OPTIONS= git commit -m "feat(glitch-264): surface granularity_labels in date zoom capabilities

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — resolve overrides in labels + tree + filter custom lists

**Files:**
- Modify: `packages/frontend/src/features/dateZoom/utils.ts` (`getGranularityLabel` checks the map for standard grains)
- Modify: `packages/frontend/src/components/Explorer/ExploreTree/TableTree/Tree/TreeSingleNode.tsx` (read `item.timeIntervalLabel`)
- Modify: the date-zoom "list custom granularities" sites to exclude standard keys: `DateZoom.tsx:186`, `DateZoomControlPills.tsx:64`, `DateZoomControlConfig.tsx` (the `Object.keys(availableCustomGranularities)` near line 120)
- Test: `packages/frontend/src/features/dateZoom/utils.test.ts` (create if absent)

**Interfaces:**
- Consumes: `availableCustomGranularities` now carries standard overrides keyed by `DateGranularity` (Task 4); `Dimension.timeIntervalLabel` (Task 1/3); `isStandardDateGranularity` (from `@lightdash/common`).
- Produces: `getGranularityLabel(g, customLabels)` returns the override for a standard grain when present.

- [ ] **Step 1: Write the failing test for `getGranularityLabel`**

In `packages/frontend/src/features/dateZoom/utils.test.ts` (create if needed), add:

```typescript
import { DateGranularity } from '@lightdash/common';
import { getGranularityLabel } from './utils';

describe('getGranularityLabel', () => {
    it('returns the override for a standard grain when present', () => {
        expect(
            getGranularityLabel(DateGranularity.WEEK, {
                [DateGranularity.WEEK]: 'Week starting Monday',
            }),
        ).toBe('Week starting Monday');
    });

    it('returns the enum value for a standard grain with no override', () => {
        expect(getGranularityLabel(DateGranularity.WEEK, {})).toBe('Week');
    });

    it('still labels a custom granularity from the map', () => {
        expect(
            getGranularityLabel('fiscal_quarter', {
                fiscal_quarter: 'Fiscal Quarter',
            }),
        ).toBe('Fiscal Quarter');
    });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F frontend test -- dateZoom/utils`
Expected: FAIL — standard grain returns "Week", ignoring the override.

- [ ] **Step 3: Update `getGranularityLabel` to check the map first for standard grains**

In `packages/frontend/src/features/dateZoom/utils.ts`, change the body so the map is consulted before the standard short-circuit:

```typescript
export const getGranularityLabel = (
    granularity: DateGranularity | string,
    customLabels?: Record<string, string>,
): string => {
    if (customLabels && granularity in customLabels) {
        return customLabels[granularity];
    }
    if (isStandardDateGranularity(granularity)) {
        return granularity;
    }
    return granularity
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F frontend test -- dateZoom/utils`
Expected: PASS.

- [ ] **Step 5: Exclude standard keys from the "custom granularities" lists**

The `availableCustomGranularities` map now contains standard-grain keys (e.g. `Week`). The three sites that enumerate it to list *custom* granularities must exclude standard keys. In each, change `Object.keys(availableCustomGranularities)` to filter:

`packages/frontend/src/features/dateZoom/components/DateZoom.tsx:186`,
`packages/frontend/src/features/dateZoom/components/DateZoomControlPills.tsx:64`,
`packages/frontend/src/features/dateZoom/components/DateZoomControlConfig.tsx` (~line 120):

```typescript
Object.keys(availableCustomGranularities).filter(
    (g) => !isStandardDateGranularity(g),
)
```

Add `isStandardDateGranularity` to each file's `@lightdash/common` import. Also audit the other consumers of `availableCustomGranularities` that enumerate keys as customs — `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:1859` and `packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:202` — and apply the same `.filter(...)` where they treat keys as custom granularities (not where they only read a label by key).

- [ ] **Step 6: Read the override in the Explorer sidebar tree**

In `packages/frontend/src/components/Explorer/ExploreTree/TableTree/Tree/TreeSingleNode.tsx`, change the `timeIntervalLabel` derivation (lines 292–297) to prefer the baked override:

```typescript
    const timeIntervalLabel =
        isDimension(item) &&
        item.timeInterval &&
        isTimeInterval(item.timeInterval)
            ? item.timeIntervalLabel ??
              timeFrameConfigs[item.timeInterval].getLabel()
            : undefined;
```

- [ ] **Step 7: Typecheck + lint frontend**

Run: `pnpm -F frontend typecheck:fast && pnpm -F frontend lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/features/dateZoom/utils.ts packages/frontend/src/features/dateZoom/utils.test.ts packages/frontend/src/features/dateZoom/components/DateZoom.tsx packages/frontend/src/features/dateZoom/components/DateZoomControlPills.tsx packages/frontend/src/features/dateZoom/components/DateZoomControlConfig.tsx packages/frontend/src/components/Explorer/ExploreTree/TableTree/Tree/TreeSingleNode.tsx packages/frontend/src/providers/Dashboard/DashboardProvider.tsx packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts
NODE_OPTIONS= git commit -m "feat(glitch-264): apply granularity_labels in explorer tree + date zoom

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: JSON schema + final verification

**Files:**
- Modify: `packages/common/src/schemas/json/lightdash-project-config-1.0.json` (`defaults.granularity_labels`)
- Possibly modified by tooling: generated OpenAPI spec.

- [ ] **Step 1: Add `granularity_labels` to the schema**

In `packages/common/src/schemas/json/lightdash-project-config-1.0.json`, inside the `defaults` object's `properties` (added in GLITCH-265, alongside `additional_time_intervals`), add:

```json
                "granularity_labels": {
                    "type": ["object", "null"],
                    "description": "Override the display label of standard granularities (e.g. week: \"Week starting Monday\"). Keyed by standard granularity name.",
                    "additionalProperties": { "type": "string" }
                }
```

(Mind comma placement — sibling of `additional_time_intervals`.)

- [ ] **Step 2: Verify JSON + lint**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/common/src/schemas/json/lightdash-project-config-1.0.json','utf8')); console.log('valid json')"`
Expected: prints `valid json`.
Run: `pnpm -F common lint`
Expected: no errors.

- [ ] **Step 3: Build + full common/frontend test suites**

Run: `pnpm -F common build && pnpm -F common test && pnpm -F frontend test -- dateZoom`
Expected: build clean; all tests pass.

- [ ] **Step 4: Regenerate the API spec (commit full regen per repo convention)**

Run: `pnpm generate-api` then `git status --porcelain`. Commit the regenerated `packages/backend/src/generated/{routes.ts,swagger.json}` (the spec is regenerated wholesale; per repo convention generated files are committed and may carry incidental drift):

```bash
git add packages/common/src/schemas/json/lightdash-project-config-1.0.json packages/backend/src/generated/routes.ts packages/backend/src/generated/swagger.json
NODE_OPTIONS= git commit -m "chore(glitch-264): config schema + regenerate API spec for granularity_labels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual e2e smoke (recommended)**

In `examples/full-jaffle-shop-demo/dbt/lightdash.config.yml` under `defaults:` add:

```yaml
  granularity_labels:
    week: "Week starting Monday"
```

Restart the backend (reload `common`), Refresh dbt, then confirm:
- Explorer: a date dimension's `Week` grain reads **"Week starting Monday"** in the sidebar tree, and the selected dimension label reads "… Week starting Monday".
- Dashboard date-zoom dropdown: the `Week` option reads **"Week starting Monday"**.
- A chart axis using `${field.granularity}` still renders lowercase "week" (out of scope — GLITCH-528), and custom-SQL `date_zoom` is unchanged.

Revert the config edit afterwards (or leave for further testing).

---

## Self-Review

**Spec coverage:**
- Config `defaults.granularity_labels` → Task 1 (type) + Task 6 (schema). ✓
- One-shot resolver with validation/warn → Task 2. ✓
- Central `getTimeFrameLabel` → Task 1. ✓
- Compile: bake into `dimension.label` verbatim + attach `Explore.granularityLabels` → Task 3 (incl. exploreCompiler zoomed-dim). ✓
- Explorer sidebar tree → Task 5 (via `Dimension.timeIntervalLabel`, a mechanism refinement over the spec's "read from explore context" — same behaviour, no tree-context threading). ✓
- Date zoom → Task 4 (capabilities) + Task 5 (`getGranularityLabel`). ✓
- POP / chart-axis / `getGranularityReferenceValue` / `reservedParameters.ts` untouched → no task touches them. ✓
- Additive (no config → unchanged) → Task 3 "unchanged when no config" test. ✓

**Placeholder scan:** No TBD/TODO; the one "audit other consumers" instruction (Task 5 Step 5) names the exact files and the concrete `.filter(...)` to apply. ✓

**Type consistency:** `granularity_labels` (config) → resolved to `Partial<Record<TimeFrames,string>>` (resolver, Explore.granularityLabels, getTimeFrameLabel overrides) consistently. `Dimension.timeIntervalLabel: string` defined in Task 1, set in Task 3, read in Task 5. `getTimeFrameLabel`/`resolveGranularityLabels`/`getGranularityLabel` names match across tasks. ✓
