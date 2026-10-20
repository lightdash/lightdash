import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type DashboardStoreState } from '.';
import { initialDashboardChartSortState } from './dashboardChartSortReducer';
import { initialDashboardDateZoomState } from './dashboardDateZoomReducer';
import { initialDashboardEditState } from './dashboardEditReducer';
import { initialDashboardFiltersState } from './dashboardFiltersReducer';
import {
    initialDashboardParametersState,
    type DashboardParametersState,
} from './dashboardParametersReducer';
import { initialDashboardTileStatusState } from './dashboardTileStatusReducer';
import {
    combineDashboardFilters,
    getSafeTemporaryFilters,
    selectAppliedParameterValues,
    selectDashboardParameterDefinitions,
    selectDashboardParameterReferences,
    selectMissingRequiredParameters,
    selectParameterValues,
} from './selectors';

const stateWith = (
    parameters: Partial<DashboardParametersState>,
): DashboardStoreState => ({
    filters: initialDashboardFiltersState,
    parameters: { ...initialDashboardParametersState, ...parameters },
    dateZoom: initialDashboardDateZoomState,
    tileStatus: initialDashboardTileStatusState,
    edit: initialDashboardEditState,
    chartSort: initialDashboardChartSortState,
});

const rule = (
    id: string,
    fieldId: string,
    extra: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId, tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['x'],
    ...extra,
});

describe('parameter selectors', () => {
    it('selectParameterValues drops null, undefined and empty strings but keeps empty arrays', () => {
        const state = stateWith({
            parameters: {
                a: { parameterName: 'a', value: 'A' },
                b: { parameterName: 'b', value: '' },
                c: { parameterName: 'c', value: [] },
                d: { parameterName: 'd', value: 1 },
            },
        });
        expect(selectParameterValues(state)).toEqual({ a: 'A', c: [], d: 1 });
        expect(selectParameterValues(state)).toBe(selectParameterValues(state));
    });

    it('selectAppliedParameterValues layers current values over saved ones', () => {
        const state = stateWith({
            savedParameters: {
                a: { parameterName: 'a', value: 'saved-a' },
                b: { parameterName: 'b', value: 'saved-b' },
            },
            parameters: {
                a: { parameterName: 'a', value: 'current-a' },
                b: { parameterName: 'b', value: '' },
            },
        });
        expect(selectAppliedParameterValues(state)).toEqual({
            a: 'current-a',
            b: 'saved-b',
        });
        expect(selectAppliedParameterValues(state)).toBe(
            selectAppliedParameterValues(state),
        );
    });

    it('selectDashboardParameterDefinitions applies label overrides', () => {
        const parameterDefinitions = { status: { label: 'Status' } };
        expect(
            selectDashboardParameterDefinitions(
                stateWith({
                    parameterDefinitions,
                    parameterLabelOverrides: { status: { label: 'Estado' } },
                }),
            ),
        ).toEqual({ status: { label: 'Estado' } });
    });

    it('selectDashboardParameterDefinitions keeps identity without overrides', () => {
        const parameterDefinitions = { status: { label: 'Status' } };
        expect(
            selectDashboardParameterDefinitions(
                stateWith({ parameterDefinitions }),
            ),
        ).toBe(parameterDefinitions);
    });

    it('selectDashboardParameterReferences collects references from all tiles', () => {
        const state = stateWith({
            tileParameterReferences: {
                'tile-1': ['status', 'region'],
                'tile-2': ['status'],
            },
        });
        expect(selectDashboardParameterReferences(state)).toEqual(
            new Set(['status', 'region']),
        );
        expect(selectDashboardParameterReferences(state)).toBe(
            selectDashboardParameterReferences(state),
        );
    });

    describe('selectMissingRequiredParameters', () => {
        const base = {
            parameterDefinitions: { status: { label: 'Status' } },
            tileParameterReferences: { 'tile-1': ['status'] },
        };

        it('reports a referenced parameter without any value', () => {
            const state = stateWith(base);
            expect(selectMissingRequiredParameters(state)).toEqual(['status']);
            expect(selectMissingRequiredParameters(state)).toBe(
                selectMissingRequiredParameters(state),
            );
        });

        it('is satisfied by a chart-saved value', () => {
            expect(
                selectMissingRequiredParameters(
                    stateWith({
                        ...base,
                        tileChartSavedParameters: {
                            'tile-1': { status: 'Shipped' },
                        },
                    }),
                ),
            ).toEqual([]);
        });

        it('is satisfied by a dashboard value', () => {
            expect(
                selectMissingRequiredParameters(
                    stateWith({
                        ...base,
                        parameters: {
                            status: { parameterName: 'status', value: 'x' },
                        },
                    }),
                ),
            ).toEqual([]);
        });
    });
});

describe('filter helpers', () => {
    const lockedStatus = rule('saved-status', 'orders_status', {
        lockedTabUuids: ['tab-a'],
    });
    const savedFilters: DashboardFilters = {
        dimensions: [lockedStatus],
        metrics: [],
        tableCalculations: [],
    };
    const temporaryFilters: DashboardFilters = {
        dimensions: [
            rule('temp-status', 'orders_status'),
            rule('temp-region', 'orders_region'),
        ],
        metrics: [],
        tableCalculations: [],
    };

    it('getSafeTemporaryFilters passes filters through without locks', () => {
        expect(
            getSafeTemporaryFilters(temporaryFilters, undefined, 'tab-a'),
        ).toEqual({ filters: temporaryFilters, droppedCount: 0 });
    });

    it('getSafeTemporaryFilters drops temporary filters locked on the active tab', () => {
        const result = getSafeTemporaryFilters(
            temporaryFilters,
            { savedFilters, hasTabs: true },
            'tab-a',
        );
        expect(result.droppedCount).toBe(1);
        expect(result.filters.dimensions.map(({ id }) => id)).toEqual([
            'temp-region',
        ]);
    });

    it('getSafeTemporaryFilters keeps them on a tab where nothing is locked', () => {
        const result = getSafeTemporaryFilters(
            temporaryFilters,
            { savedFilters, hasTabs: true },
            'tab-b',
        );
        expect(result.droppedCount).toBe(0);
        expect(result.filters.dimensions).toHaveLength(2);
    });

    it('combineDashboardFilters concatenates every category', () => {
        const a = rule('a', 'f');
        const b = rule('b', 'f');
        expect(
            combineDashboardFilters(
                { dimensions: [a], metrics: [a], tableCalculations: [a] },
                { dimensions: [b], metrics: [b], tableCalculations: [b] },
            ),
        ).toEqual({
            dimensions: [a, b],
            metrics: [a, b],
            tableCalculations: [a, b],
        });
    });
});
