import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildInitialDashboardState } from './buildInitialState';
import {
    addSavedFilterOverride,
    emptySavedFilterOverrides,
    hasSavedFiltersOverrides,
    parseSavedFilterOverridesParam,
    reconcileSavedFilterOverrideIds,
    removeSavedFilterOverride,
    resetSavedFilterOverrides,
} from './savedFilterOverrides';

const sanitizedRule = {
    id: 'filter-1',
    label: 'Status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['completed'],
    disabled: false,
};

// Carries every saved-dashboard-owned field that must be stripped
const urlOverrideRule = {
    ...sanitizedRule,
    lockedTabUuids: ['tab-1'],
    required: true,
    requiredGroupId: 'group-1',
};

const dimOverride = {
    id: 'dim-1',
    label: undefined,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
};

const metricOverride = {
    id: 'metric-1',
    label: undefined,
    target: { fieldId: 'orders_total_revenue', tableName: 'orders' },
    operator: FilterOperator.GREATER_THAN,
    values: [100],
};

const filtersParam = (overrides: unknown) => JSON.stringify(overrides);

describe('hasSavedFiltersOverrides', () => {
    it('returns false for undefined', () => {
        expect(hasSavedFiltersOverrides(undefined)).toBe(false);
    });

    it('returns false when both dimensions and metrics are empty', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            }),
        ).toBe(false);
    });

    it('returns true when only dimensions have overrides', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [dimOverride],
                metrics: [],
                tableCalculations: [],
            }),
        ).toBe(true);
    });

    it('returns true when only metrics have overrides', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [],
                metrics: [metricOverride],
                tableCalculations: [],
            }),
        ).toBe(true);
    });

    it('returns true when both dimensions and metrics have overrides', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [dimOverride],
                metrics: [metricOverride],
                tableCalculations: [],
            }),
        ).toBe(true);
    });

    it('ignores table calculation overrides', () => {
        expect(
            hasSavedFiltersOverrides({
                dimensions: [],
                metrics: [],
                tableCalculations: [dimOverride],
            }),
        ).toBe(false);
    });
});

describe('parseSavedFilterOverridesParam', () => {
    it('returns the empty overrides for a missing param', () => {
        expect(parseSavedFilterOverridesParam(null)).toBe(
            emptySavedFilterOverrides,
        );
        expect(parseSavedFilterOverridesParam('')).toBe(
            emptySavedFilterOverrides,
        );
    });

    it('strips saved-dashboard-owned fields from URL override rules', () => {
        expect(
            parseSavedFilterOverridesParam(
                filtersParam({ dimensions: [urlOverrideRule] }),
            ).dimensions,
        ).toStrictEqual([sanitizedRule]);
    });

    it('strips them through the store initial state too', () => {
        const { state } = buildInitialDashboardState({
            search: `?filters=${encodeURIComponent(
                filtersParam({
                    dimensions: [urlOverrideRule],
                    metrics: [urlOverrideRule],
                    tableCalculations: [urlOverrideRule],
                }),
            )}`,
            isEditMode: false,
            parameterLabelOverrides: undefined,
            dateZoom: undefined,
        });
        expect(state.filters.savedFilterOverrides).toStrictEqual({
            dimensions: [sanitizedRule],
            metrics: [sanitizedRule],
            tableCalculations: [sanitizedRule],
        });
    });

    it('defaults missing categories to empty arrays', () => {
        expect(parseSavedFilterOverridesParam('{}')).toStrictEqual({
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        });
    });

    it('throws on malformed JSON', () => {
        expect(() => parseSavedFilterOverridesParam('{broken')).toThrow();
    });
});

describe('addSavedFilterOverride', () => {
    it('strips saved-dashboard-owned fields when adding an override', () => {
        const savedRule: DashboardFilterRule = {
            ...urlOverrideRule,
            tileTargets: {},
        };
        expect(
            addSavedFilterOverride(
                emptySavedFilterOverrides,
                savedRule,
                'dimensions',
            ).dimensions,
        ).toStrictEqual([sanitizedRule]);
    });

    it('replaces an existing override with the same id', () => {
        const first = addSavedFilterOverride(
            emptySavedFilterOverrides,
            sanitizedRule,
            'metrics',
        );
        const second = addSavedFilterOverride(
            first,
            { ...sanitizedRule, values: ['pending'] },
            'metrics',
        );
        expect(second.metrics).toStrictEqual([
            { ...sanitizedRule, values: ['pending'] },
        ]);
        expect(second.dimensions).toBe(first.dimensions);
    });
});

describe('removeSavedFilterOverride', () => {
    it('removes by id from the given category only', () => {
        const overrides = {
            dimensions: [sanitizedRule],
            metrics: [sanitizedRule],
            tableCalculations: [],
        };
        const result = removeSavedFilterOverride(
            overrides,
            sanitizedRule,
            'metrics',
        );
        expect(result.metrics).toStrictEqual([]);
        expect(result.dimensions).toBe(overrides.dimensions);
    });
});

describe('resetSavedFilterOverrides', () => {
    it('clears dimensions and metrics but keeps table calculations', () => {
        const overrides = {
            dimensions: [sanitizedRule],
            metrics: [sanitizedRule],
            tableCalculations: [sanitizedRule],
        };
        expect(resetSavedFilterOverrides(overrides)).toStrictEqual({
            dimensions: [],
            metrics: [],
            tableCalculations: [sanitizedRule],
        });
    });
});

describe('reconcileSavedFilterOverrideIds', () => {
    it('reconciles a stale URL override before the saved filter is edited', () => {
        const staleRule = {
            ...sanitizedRule,
            id: 'stale-filter-id',
            values: ['pending'],
        };
        const savedFilters = {
            dimensions: [
                {
                    ...sanitizedRule,
                    tileTargets: {},
                    values: [],
                },
            ],
            metrics: [],
            tableCalculations: [],
        } satisfies DashboardFilters;

        const reconciled = reconcileSavedFilterOverrideIds(
            parseSavedFilterOverridesParam(
                filtersParam({ dimensions: [staleRule] }),
            ),
            savedFilters,
        );
        const result = addSavedFilterOverride(
            reconciled,
            { ...savedFilters.dimensions[0], values: ['completed'] },
            'dimensions',
        );

        expect(result.dimensions).toStrictEqual([
            {
                ...sanitizedRule,
                values: ['completed'],
            },
        ]);
    });

    it('keeps stale overrides distinct for saved filters sharing a field', () => {
        const savedFilters = {
            dimensions: [
                { ...sanitizedRule, id: 'saved-filter-1', tileTargets: {} },
                { ...sanitizedRule, id: 'saved-filter-2', tileTargets: {} },
            ],
            metrics: [],
            tableCalculations: [],
        } satisfies DashboardFilters;
        const reconciled = reconcileSavedFilterOverrideIds(
            parseSavedFilterOverridesParam(
                filtersParam({
                    dimensions: [
                        {
                            ...sanitizedRule,
                            id: 'stale-filter-1',
                            values: ['pending'],
                        },
                        {
                            ...sanitizedRule,
                            id: 'stale-filter-2',
                            values: ['shipped'],
                        },
                    ],
                }),
            ),
            savedFilters,
        );

        const result = addSavedFilterOverride(
            reconciled,
            { ...savedFilters.dimensions[1], values: ['completed'] },
            'dimensions',
        );

        expect(result.dimensions).toStrictEqual([
            {
                ...sanitizedRule,
                id: 'saved-filter-1',
                values: ['pending'],
            },
            {
                ...sanitizedRule,
                id: 'saved-filter-2',
                values: ['completed'],
            },
        ]);
    });

    it('preserves override state identity when ids are already current', () => {
        const overrides = parseSavedFilterOverridesParam(
            filtersParam({ dimensions: [sanitizedRule] }),
        );
        const savedFilters = {
            dimensions: [{ ...sanitizedRule, tileTargets: {} }],
            metrics: [],
            tableCalculations: [],
        } satisfies DashboardFilters;

        expect(
            reconcileSavedFilterOverrideIds(overrides, {
                ...savedFilters,
                dimensions: [...savedFilters.dimensions],
            }),
        ).toBe(overrides);
    });
});
