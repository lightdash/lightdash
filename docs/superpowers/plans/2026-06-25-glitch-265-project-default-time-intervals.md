# GLITCH-265 — Project-default time intervals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project append extra time intervals (standard grains or custom-granularity names) to the built-in defaults for date/timestamp dimensions via `lightdash.config.yml`, so authors don't repeat `time_intervals` on every column.

**Architecture:** Additive, fallback-only. A new `defaults.additional_time_intervals.{date,timestamp}` config field is validated once in `convertExplores` (`resolveAdditionalTimeIntervals`), threaded into `convertTable`, and merged with the built-in defaults by `getTimeFramesWithProjectDefaults` only on columns that don't declare their own `time_intervals`. Backend/`common` only — new sub-dimensions flow into compiled explores automatically.

**Tech Stack:** TypeScript, pnpm workspaces, Jest (`packages/common`).

## Global Constraints

- Package manager: **pnpm** only. Prefix any install with `sfw` (e.g. `sfw pnpm install`).
- Git commits: end the message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; prefix git with `NODE_OPTIONS= ` (e.g. `NODE_OPTIONS= git commit ...`) to avoid the husky preload crash.
- Work on branch `feature/glitch-265` (already created).
- Use package-specific commands: `pnpm -F common test`, `pnpm -F common typecheck:fast`, `pnpm -F common lint`.
- Code style: no duck typing / intentional types; prefer `null` over optional where it means "absent"; `assertUnreachable` for exhaustive switches; minimal comments.
- The canonical source of field types is `packages/common/src/types/field.ts`; the `TimeFrames` enum is in `packages/common/src/types/timeFrames.ts`.
- **Semantics (locked):** additive only; field named `additional_time_intervals` (NOT `time_intervals`, which replaces at the per-column level); fallback-only precedence (explicit per-column `time_intervals` always wins); validation is one-shot at resolution via `console.warn`.

---

### Task 1: Config type + merge helper (`timeFrames.ts`)

Adds the input config type, the resolved-shape type, the date-invalid set, and the pure merge helper. `getDefaultTimeFrames` stays unchanged.

**Files:**
- Modify: `packages/common/src/types/lightdashProjectConfig.ts` (add import + `ProjectDefaults.additional_time_intervals`)
- Modify: `packages/common/src/utils/timeFrames.ts` (add `ResolvedAdditionalTimeIntervals`, `DATE_INVALID_TIME_FRAMES`, `getTimeFramesWithProjectDefaults`)
- Test: `packages/common/src/utils/timeFrames.test.ts`

**Interfaces:**
- Produces:
  - `ProjectDefaults.additional_time_intervals?: { date?: (TimeFrames | string)[]; timestamp?: (TimeFrames | string)[] }`
  - `type ResolvedAdditionalTimeIntervals = { date: (TimeFrames | string)[]; timestamp: (TimeFrames | string)[] }`
  - `DATE_INVALID_TIME_FRAMES: ReadonlySet<TimeFrames>`
  - `getTimeFramesWithProjectDefaults(type: DimensionType, additionalTimeIntervals?: ResolvedAdditionalTimeIntervals): (TimeFrames | string)[]`

- [ ] **Step 1: Add the config field to `ProjectDefaults`**

In `packages/common/src/types/lightdashProjectConfig.ts`, add the `TimeFrames` import at the top (next to the existing `DimensionType` import):

```typescript
import { type DimensionType } from './field';
import { type TimeFrames } from './timeFrames';
```

Then extend `ProjectDefaults` (keep the existing fields, add the new one before the closing brace):

```typescript
export type ProjectDefaults = {
    case_sensitive?: boolean;
    column_totals?: boolean;
    /**
     * Extra time intervals appended to the built-in defaults for date/timestamp
     * dimensions that do not declare their own `time_intervals`. Values may be
     * standard granularities (e.g. `hour`) or `custom_granularities` keys.
     */
    additional_time_intervals?: {
        date?: (TimeFrames | string)[];
        timestamp?: (TimeFrames | string)[];
    };
};
```

- [ ] **Step 2: Write the failing test for the merge helper**

In `packages/common/src/utils/timeFrames.test.ts`, add the helper to the existing import from `'./timeFrames'` (it currently imports e.g. `isSubDayGranularity`, `getDateDimension`), then add this `describe` block inside the top-level `describe('TimeFrames', ...)`:

```typescript
describe('getTimeFramesWithProjectDefaults', () => {
    it('returns built-in defaults unchanged when no additions are given', () => {
        expect(getTimeFramesWithProjectDefaults(DimensionType.DATE)).toEqual([
            TimeFrames.DAY,
            TimeFrames.WEEK,
            TimeFrames.MONTH,
            TimeFrames.QUARTER,
            TimeFrames.YEAR,
        ]);
        expect(
            getTimeFramesWithProjectDefaults(DimensionType.TIMESTAMP),
        ).toEqual([
            TimeFrames.RAW,
            TimeFrames.DAY,
            TimeFrames.WEEK,
            TimeFrames.MONTH,
            TimeFrames.QUARTER,
            TimeFrames.YEAR,
        ]);
    });

    it('appends timestamp additions after the built-in defaults', () => {
        expect(
            getTimeFramesWithProjectDefaults(DimensionType.TIMESTAMP, {
                date: [],
                timestamp: [TimeFrames.HOUR],
            }),
        ).toEqual([
            TimeFrames.RAW,
            TimeFrames.DAY,
            TimeFrames.WEEK,
            TimeFrames.MONTH,
            TimeFrames.QUARTER,
            TimeFrames.YEAR,
            TimeFrames.HOUR,
        ]);
    });

    it('appends a custom granularity name for date dimensions', () => {
        expect(
            getTimeFramesWithProjectDefaults(DimensionType.DATE, {
                date: ['fiscal_week'],
                timestamp: [],
            }),
        ).toEqual([
            TimeFrames.DAY,
            TimeFrames.WEEK,
            TimeFrames.MONTH,
            TimeFrames.QUARTER,
            TimeFrames.YEAR,
            'fiscal_week',
        ]);
    });

    it('de-duplicates an addition that already exists in the built-in defaults', () => {
        expect(
            getTimeFramesWithProjectDefaults(DimensionType.DATE, {
                date: [TimeFrames.DAY],
                timestamp: [],
            }),
        ).toEqual([
            TimeFrames.DAY,
            TimeFrames.WEEK,
            TimeFrames.MONTH,
            TimeFrames.QUARTER,
            TimeFrames.YEAR,
        ]);
    });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm -F common test -- timeFrames`
Expected: FAIL — `getTimeFramesWithProjectDefaults is not a function` (not exported yet).

- [ ] **Step 4: Implement the helper, type, and set**

In `packages/common/src/utils/timeFrames.ts`, immediately after the `getDefaultTimeFrames` definition (ends around line 1030), add:

```typescript
export type ResolvedAdditionalTimeIntervals = {
    date: (TimeFrames | string)[];
    timestamp: (TimeFrames | string)[];
};

/** Standard time frames that are meaningless on a plain DATE dimension. */
export const DATE_INVALID_TIME_FRAMES: ReadonlySet<TimeFrames> = new Set([
    TimeFrames.RAW,
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
]);

/**
 * Built-in default time frames for a dimension type, with project-level
 * `additional_time_intervals` appended (de-duplicated, built-ins first).
 */
export const getTimeFramesWithProjectDefaults = (
    type: DimensionType,
    additionalTimeIntervals?: ResolvedAdditionalTimeIntervals,
): (TimeFrames | string)[] => {
    const additions =
        type === DimensionType.TIMESTAMP
            ? additionalTimeIntervals?.timestamp ?? []
            : additionalTimeIntervals?.date ?? [];
    const seen = new Set<string>();
    return [...getDefaultTimeFrames(type), ...additions].filter((value) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
};
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pnpm -F common test -- timeFrames`
Expected: PASS (all four new cases plus existing TimeFrames tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm -F common typecheck:fast`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/common/src/types/lightdashProjectConfig.ts packages/common/src/utils/timeFrames.ts packages/common/src/utils/timeFrames.test.ts
NODE_OPTIONS= git commit -m "feat(glitch-265): add additional_time_intervals config type and merge helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Config resolver/validator (`compiler/lightdashProjectConfig.ts`)

One-shot validation: standard grains kept (uppercased), sub-day grains under `date` dropped + warned, custom-granularity keys kept, unknowns dropped + warned.

**Files:**
- Modify: `packages/common/src/compiler/lightdashProjectConfig.ts` (add `resolveAdditionalTimeIntervals`)
- Test: `packages/common/src/compiler/lightdashProjectConfig.test.ts`

**Interfaces:**
- Consumes (Task 1): `ResolvedAdditionalTimeIntervals`, `DATE_INVALID_TIME_FRAMES`, `isTimeInterval`, `ProjectDefaults`, `LightdashProjectConfig['custom_granularities']`.
- Produces: `resolveAdditionalTimeIntervals(additionalTimeIntervals: ProjectDefaults['additional_time_intervals'], customGranularities: LightdashProjectConfig['custom_granularities']): ResolvedAdditionalTimeIntervals`

- [ ] **Step 1: Write the failing test**

In `packages/common/src/compiler/lightdashProjectConfig.test.ts`, add (mirror the file's existing import style — it imports helpers from `'./lightdashProjectConfig'`):

```typescript
import { TimeFrames } from '../types/timeFrames';
import { resolveAdditionalTimeIntervals } from './lightdashProjectConfig';

describe('resolveAdditionalTimeIntervals', () => {
    const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

    afterEach(() => warnSpy.mockClear());
    afterAll(() => warnSpy.mockRestore());

    it('returns empty lists when config is undefined', () => {
        expect(resolveAdditionalTimeIntervals(undefined, {})).toEqual({
            date: [],
            timestamp: [],
        });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('uppercases a standard timestamp grain', () => {
        expect(
            resolveAdditionalTimeIntervals({ timestamp: ['hour'] }, {}),
        ).toEqual({ date: [], timestamp: [TimeFrames.HOUR] });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('drops a sub-day grain configured under date and warns', () => {
        expect(
            resolveAdditionalTimeIntervals({ date: ['hour'] }, {}),
        ).toEqual({ date: [], timestamp: [] });
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps a defined custom granularity key', () => {
        expect(
            resolveAdditionalTimeIntervals(
                { date: ['fiscal_week'] },
                { fiscal_week: { label: 'Fiscal Week', sql: '${COLUMN}' } },
            ),
        ).toEqual({ date: ['fiscal_week'], timestamp: [] });
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('drops an unknown name and warns', () => {
        expect(
            resolveAdditionalTimeIntervals({ timestamp: ['nonsense'] }, {}),
        ).toEqual({ date: [], timestamp: [] });
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm -F common test -- lightdashProjectConfig`
Expected: FAIL — `resolveAdditionalTimeIntervals is not a function`.

- [ ] **Step 3: Implement the resolver**

In `packages/common/src/compiler/lightdashProjectConfig.ts`, add imports at the top:

```typescript
import type {
    LightdashProjectConfig,
    ProjectDefaults,
} from '../types/lightdashProjectConfig';
import {
    DATE_INVALID_TIME_FRAMES,
    isTimeInterval,
    type ResolvedAdditionalTimeIntervals,
} from '../utils/timeFrames';
```

(`LightdashProjectConfig` is already imported in this file — merge the `ProjectDefaults` addition into the existing import rather than duplicating it.)

Then add the resolver:

```typescript
const resolveAdditionalTimeIntervalList = (
    values: (string | undefined)[] | undefined,
    key: 'date' | 'timestamp',
    customGranularities: LightdashProjectConfig['custom_granularities'],
): (string)[] =>
    (values ?? []).reduce<string[]>((acc, raw) => {
        const name = String(raw);
        const upper = name.toUpperCase();
        if (isTimeInterval(upper)) {
            if (key === 'date' && DATE_INVALID_TIME_FRAMES.has(upper)) {
                // eslint-disable-next-line no-console
                console.warn(
                    `Ignoring sub-day time interval "${name}" in defaults.additional_time_intervals.date — not valid for DATE dimensions.`,
                );
                return acc;
            }
            return [...acc, upper];
        }
        if (customGranularities?.[name]) {
            return [...acc, name];
        }
        // eslint-disable-next-line no-console
        console.warn(
            `Ignoring unknown time interval "${name}" in defaults.additional_time_intervals.${key} — not a standard granularity or a defined custom_granularity.`,
        );
        return acc;
    }, []);

/**
 * Validate `defaults.additional_time_intervals` once: keep standard grains
 * (uppercased) and defined custom-granularity keys; drop sub-day grains under
 * `date` and unknown names (each with a single console.warn).
 */
export const resolveAdditionalTimeIntervals = (
    additionalTimeIntervals: ProjectDefaults['additional_time_intervals'],
    customGranularities: LightdashProjectConfig['custom_granularities'],
): ResolvedAdditionalTimeIntervals => ({
    date: resolveAdditionalTimeIntervalList(
        additionalTimeIntervals?.date,
        'date',
        customGranularities,
    ),
    timestamp: resolveAdditionalTimeIntervalList(
        additionalTimeIntervals?.timestamp,
        'timestamp',
        customGranularities,
    ),
});
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm -F common test -- lightdashProjectConfig`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm -F common typecheck:fast`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/common/src/compiler/lightdashProjectConfig.ts packages/common/src/compiler/lightdashProjectConfig.test.ts
NODE_OPTIONS= git commit -m "feat(glitch-265): resolve and validate additional_time_intervals config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire into the compiler (`translator.ts`)

Resolve once in `convertExplores`, thread into `convertTable`, use the merge helper in the model-column `else` branch.

**Files:**
- Modify: `packages/common/src/compiler/translator.ts`
- Test: `packages/common/src/compiler/translator.test.ts`

**Interfaces:**
- Consumes (Task 1): `getTimeFramesWithProjectDefaults`, `ResolvedAdditionalTimeIntervals`. (Task 2): `resolveAdditionalTimeIntervals`.
- Produces: `convertTable(..., additionalTimeIntervals?: ResolvedAdditionalTimeIntervals)` — new optional last parameter.

- [ ] **Step 1: Write the failing tests**

In `packages/common/src/compiler/translator.test.ts`, add a new `describe` block (place it near the existing custom-granularity convertExplores tests). It uses the existing `model`, `warehouseClientMock`, `DEFAULT_SPOTLIGHT_CONFIG`, `SupportedDbtAdapter`, `TimeFrames`, `DimensionType` already imported in the file:

```typescript
describe('project default additional_time_intervals', () => {
    const TIMESTAMP_MODEL: DbtModelNode & { relation_name: string } = {
        ...model,
        columns: {
            created_at: {
                name: 'created_at',
                data_type: DimensionType.TIMESTAMP,
                meta: { dimension: { type: DimensionType.TIMESTAMP } },
            },
        },
    };

    it('appends a standard grain (HOUR) to a timestamp column with no explicit time_intervals', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            TIMESTAMP_MODEL,
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined, // startOfWeek
            undefined, // disableTimestampConversion
            undefined, // customGranularities
            undefined, // allowPartialCompilation
            { date: [], timestamp: [TimeFrames.HOUR] }, // additionalTimeIntervals
        );
        expect(result.dimensions).toHaveProperty('created_at_hour');
        expect(result.dimensions).toHaveProperty('created_at_day');
    });

    it('appends a custom granularity to a timestamp column', () => {
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            TIMESTAMP_MODEL,
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            { fiscal_week: { label: 'Fiscal Week', sql: '${COLUMN}' } },
            undefined,
            { date: [], timestamp: ['fiscal_week'] },
        );
        expect(result.dimensions).toHaveProperty('created_at_fiscal_week');
    });

    it('does NOT add the project default to a column with explicit time_intervals', () => {
        const EXPLICIT_MODEL: DbtModelNode & { relation_name: string } = {
            ...model,
            columns: {
                created_at: {
                    name: 'created_at',
                    data_type: DimensionType.TIMESTAMP,
                    meta: {
                        dimension: {
                            type: DimensionType.TIMESTAMP,
                            time_intervals: [TimeFrames.DAY],
                        },
                    },
                },
            },
        };
        const result = convertTable(
            SupportedDbtAdapter.POSTGRES,
            EXPLICIT_MODEL,
            [],
            DEFAULT_SPOTLIGHT_CONFIG,
            undefined,
            undefined,
            undefined,
            undefined,
            { date: [], timestamp: [TimeFrames.HOUR] },
        );
        expect(result.dimensions).toHaveProperty('created_at_day');
        expect(result.dimensions).not.toHaveProperty('created_at_hour');
    });

    it('flows from convertExplores via lightdashProjectConfig.defaults', async () => {
        const explores = await convertExplores(
            [TIMESTAMP_MODEL],
            false,
            SupportedDbtAdapter.POSTGRES,
            [],
            warehouseClientMock,
            {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                defaults: {
                    additional_time_intervals: {
                        timestamp: [TimeFrames.HOUR],
                    },
                },
            },
        );
        const explore = explores[0];
        expect('errors' in explore).toBe(false);
        if (!('errors' in explore)) {
            const table = explore.tables[explore.baseTable];
            expect(table.dimensions).toHaveProperty('created_at_hour');
        }
    });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `pnpm -F common test -- translator`
Expected: FAIL — `convertTable` ignores the 9th arg, so `created_at_hour` is missing.

- [ ] **Step 3: Add imports**

In `packages/common/src/compiler/translator.ts`:
- In the existing import from `'../utils/timeFrames'` (the one that already imports `getDefaultTimeFrames`, `validateTimeFrames`), add `getTimeFramesWithProjectDefaults` and `type ResolvedAdditionalTimeIntervals`.
- In the existing import from `'./lightdashProjectConfig'` (line ~67), add `resolveAdditionalTimeIntervals`.

- [ ] **Step 4: Add the `additionalTimeIntervals` parameter to `convertTable`**

Change the `convertTable` signature (currently ends with `allowPartialCompilation?: boolean,`):

```typescript
export const convertTable = (
    adapterType: SupportedDbtAdapter,
    model: DbtModelNode,
    dbtMetrics: DbtMetric[],
    spotlightConfig: LightdashProjectConfig['spotlight'],
    startOfWeek?: WeekDay | null,
    disableTimestampConversion?: boolean,
    customGranularities?: Record<string, CustomGranularity>,
    allowPartialCompilation?: boolean,
    additionalTimeIntervals?: ResolvedAdditionalTimeIntervals,
): Omit<Table, 'lineageGraph'> => {
```

- [ ] **Step 5: Use the merge helper in the model-column `else` branch**

In `convertTable`'s `processIntervalDimension`, replace the fallback `else` branch (currently `allIntervals = getDefaultTimeFrames(dim.type);`):

```typescript
                    } else {
                        allIntervals = getTimeFramesWithProjectDefaults(
                            dim.type,
                            additionalTimeIntervals,
                        );
                    }
```

- [ ] **Step 6: Resolve once in `convertExplores` and pass it through**

In `convertExplores`, just after `const tableLineage = translateDbtModelsToTableLineage(models);`, add:

```typescript
    const additionalTimeIntervals = resolveAdditionalTimeIntervals(
        lightdashProjectConfig.defaults?.additional_time_intervals,
        lightdashProjectConfig.custom_granularities,
    );
```

Then in the `convertTable(...)` call inside `convertExplores`, add `additionalTimeIntervals` as the final argument (after `allowPartialCompilation,`):

```typescript
                const table = convertTable(
                    adapterType,
                    model,
                    tableMetrics,
                    lightdashProjectConfig.spotlight,
                    warehouseSqlBuilder.getStartOfWeek(),
                    disableTimestampConversion,
                    lightdashProjectConfig.custom_granularities,
                    allowPartialCompilation,
                    additionalTimeIntervals,
                );
```

- [ ] **Step 7: Run the tests, verify they pass**

Run: `pnpm -F common test -- translator`
Expected: PASS (all four new cases + existing translator tests unchanged).

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm -F common typecheck:fast && pnpm -F common lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/common/src/compiler/translator.ts packages/common/src/compiler/translator.test.ts
NODE_OPTIONS= git commit -m "feat(glitch-265): apply project default additional_time_intervals in compiler

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: JSON schema for `lightdash.config.yml`

Add the `defaults` block (including the new field) to the project-config schema so editors validate/autocomplete it. (The `defaults` object is not in the schema today; add it with the existing `case_sensitive`/`column_totals` keys plus the new one. Values are typed as plain strings because custom-granularity names are open.)

**Files:**
- Modify: `packages/common/src/schemas/json/lightdash-project-config-1.0.json`

- [ ] **Step 1: Add the `defaults` property**

In `packages/common/src/schemas/json/lightdash-project-config-1.0.json`, inside the top-level `"properties"` object, add a `"defaults"` entry as a sibling of `"custom_granularities"`:

```json
        "defaults": {
            "type": ["object", "null"],
            "description": "Project-wide default settings that can be overridden at explore or field level",
            "properties": {
                "case_sensitive": {
                    "type": "boolean",
                    "description": "Default case sensitivity for string filters. Defaults to true."
                },
                "column_totals": {
                    "type": "boolean",
                    "description": "Default behaviour for column totals in results tables. Defaults to true."
                },
                "additional_time_intervals": {
                    "type": ["object", "null"],
                    "description": "Extra time intervals appended to the built-in defaults for date/timestamp dimensions that do not declare their own time_intervals. Values may be standard granularities (e.g. hour) or custom_granularities keys.",
                    "properties": {
                        "date": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Appended to the built-in DAY/WEEK/MONTH/QUARTER/YEAR defaults for DATE dimensions."
                        },
                        "timestamp": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Appended to the built-in RAW/DAY/WEEK/MONTH/QUARTER/YEAR defaults for TIMESTAMP dimensions."
                        }
                    }
                }
            }
        },
```

(Remember the trailing comma so the following `custom_granularities`/`table_groups` keys stay valid JSON. If you add `defaults` as the last property, omit the trailing comma instead.)

- [ ] **Step 2: Verify the JSON parses and lint passes**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/common/src/schemas/json/lightdash-project-config-1.0.json','utf8')); console.log('valid json')"`
Expected: prints `valid json`.

Run: `pnpm -F common lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/common/src/schemas/json/lightdash-project-config-1.0.json
NODE_OPTIONS= git commit -m "feat(glitch-265): add defaults.additional_time_intervals to config schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Final verification (build, full tests, API spec, docs)

**Files:**
- Possibly modified by tooling: generated OpenAPI spec (only if `LightdashProjectConfig` surfaces in a controller return type).

- [ ] **Step 1: Build common and run the full common test suite**

Run: `pnpm -F common build && pnpm -F common test`
Expected: build succeeds; all tests pass (new + existing).

- [ ] **Step 2: Regenerate the API spec and check for drift**

Run: `pnpm generate-api`
Then: `git status --porcelain`
Expected: usually no changes. If `packages/backend/src/generated` / swagger files changed, review them — the only expected change is the new optional `additional_time_intervals` field on `ProjectDefaults`. If changed, commit:

```bash
git add -A
NODE_OPTIONS= git commit -m "chore(glitch-265): regenerate API spec for additional_time_intervals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If there are no changes, skip this commit.

- [ ] **Step 3: Locate and update the config reference doc (if it lives in-repo)**

Run: `grep -rln "custom_granularities" --include=*.md --include=*.mdx . | grep -iv node_modules`
- If a `lightdash-config-yml` reference doc is found in-repo, add a short `additional_time_intervals` section next to the `custom_granularities` docs: explain it appends to the built-in defaults, applies only to columns without explicit `time_intervals`, accepts standard grains or custom-granularity keys, and show the `defaults.additional_time_intervals` YAML example. Then commit.
- If no in-repo doc is found (docs.lightdash.com is a separate site), note in the PR description that the public docs page `references/lightdash-config-yml` needs an `additional_time_intervals` section, and skip the commit.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Suggest the user add to their local `lightdash.config.yml`:

```yaml
defaults:
  additional_time_intervals:
    timestamp: [hour]
```

then refresh dbt in the UI and confirm a timestamp dimension now exposes an `Hour` granularity (and appears in date zoom).

---

## Self-Review

**Spec coverage:**
- Config shape (`defaults.additional_time_intervals.{date,timestamp}`) → Task 1 (type) + Task 4 (schema). ✓
- Additive merge, dedup, order → Task 1 (`getTimeFramesWithProjectDefaults`). ✓
- Fallback-only precedence → Task 3 (`else` branch only) + explicit "untouched" test. ✓
- Standard grains + custom-granularity names → Task 1/2/3 tests. ✓
- One-shot validation with warnings (unknown / sub-day-on-date) → Task 2. ✓
- Resolve once in `convertExplores`, thread through `convertTable` → Task 3. ✓
- Backend/common only, no frontend → no frontend tasks. ✓
- Model-column path only (scope note) → Task 3 changes only line ~693; line 309 untouched. ✓
- Schema file updated → Task 4. ✓
- Recompile-on-config-change is existing behavior → no task needed. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; Task 5 Step 3 has a concrete grep + conditional rather than a vague "update docs". ✓

**Type consistency:** `ResolvedAdditionalTimeIntervals` defined in Task 1, consumed by name in Tasks 2 & 3. `getTimeFramesWithProjectDefaults` / `resolveAdditionalTimeIntervals` / `DATE_INVALID_TIME_FRAMES` spelled identically across tasks. `convertTable`'s new 9th param `additionalTimeIntervals` matches the call site in Task 3 Step 6. ✓
