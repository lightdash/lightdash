import {
    compressDashboardFiltersToParam,
    FilterOperator,
    type DashboardFilters,
    type DashboardParameters,
    type ParameterDefinitions,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { createDashboardStore } from '.';
import { buildInitialDashboardState } from './buildInitialState';
import {
    dashboardFiltersActions,
    emptyDashboardFilters,
} from './dashboardFiltersReducer';
import { dashboardParametersActions } from './dashboardParametersReducer';
import { emptySavedFilterOverrides } from './savedFilterOverrides';

const temporaryFilters: DashboardFilters = {
    dimensions: [
        {
            id: 'temp-1',
            label: undefined,
            target: { fieldId: 'orders_status', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: ['completed'],
            tileTargets: {},
        },
    ],
    metrics: [],
    tableCalculations: [],
};

const searchOf = (params: Record<string, string>) =>
    `?${new URLSearchParams(params).toString()}`;

const build = (search: string, isEditMode = false) =>
    buildInitialDashboardState({
        search,
        isEditMode,
        parameterLabelOverrides: undefined,
        dateZoom: undefined,
        invalidateCache: false,
    });

describe('buildInitialDashboardState', () => {
    it('starts empty without URL state', () => {
        const { state, urlRestoreErrors } = build('');
        expect(state.filters.dashboardFilters).toBe(emptyDashboardFilters);
        expect(state.filters.temporaryFilters).toBe(emptyDashboardFilters);
        expect(state.filters.savedFilterOverrides).toBe(
            emptySavedFilterOverrides,
        );
        expect(state.parameters.parameters).toEqual({});
        expect(state.parameters.parametersHaveChanged).toBe(false);
        expect(urlRestoreErrors).toEqual({
            savedFilterOverrides: false,
            temporaryFilters: false,
            parameters: false,
        });
    });

    it('restores temporary filters from the URL', () => {
        const { state } = build(
            searchOf({
                tempFilters: JSON.stringify(
                    compressDashboardFiltersToParam(temporaryFilters),
                ),
            }),
        );
        expect(state.filters.temporaryFilters.dimensions).toHaveLength(1);
        expect(state.filters.temporaryFilters.dimensions[0]).toMatchObject({
            id: 'temp-1',
            values: ['completed'],
        });
    });

    it('restores temporary filters in edit mode too', () => {
        const { state } = build(
            searchOf({
                tempFilters: JSON.stringify(
                    compressDashboardFiltersToParam(temporaryFilters),
                ),
            }),
            true,
        );
        expect(state.filters.temporaryFilters.dimensions).toHaveLength(1);
    });

    it('restores parameters in view mode and marks them as changed', () => {
        const { state } = build(
            searchOf({ parameters: JSON.stringify({ status: 'Cancelled' }) }),
        );
        expect(state.parameters.parameters).toEqual({
            status: { parameterName: 'status', value: 'Cancelled' },
        });
        expect(state.parameters.parametersHaveChanged).toBe(true);
        expect(state.parameters.isEditMode).toBe(false);
    });

    it('ignores URL parameters in edit mode', () => {
        const { state, urlRestoreErrors } = build(
            searchOf({ parameters: JSON.stringify({ status: 'Cancelled' }) }),
            true,
        );
        expect(state.parameters.parameters).toEqual({});
        expect(state.parameters.parametersHaveChanged).toBe(false);
        expect(state.parameters.isEditMode).toBe(true);
        expect(urlRestoreErrors.parameters).toBe(false);
    });

    it('restores date zoom granularities in canonical case', () => {
        const { state } = build(
            '?dateZoom=week&dateZoom.ctrl-1=MONTH&dateZoom.ctrl-2=fiscal_quarter',
        );
        expect(state.dateZoom.granularity).toBe('Week');
        expect(state.dateZoom.controlGranularities).toEqual({
            'ctrl-1': 'Month',
            'ctrl-2': 'fiscal_quarter',
        });
    });

    it('falls back to the dateZoom prop when the URL has none', () => {
        const fromProp = (search: string) =>
            buildInitialDashboardState({
                search,
                isEditMode: false,
                parameterLabelOverrides: undefined,
                dateZoom: 'Quarter',
                invalidateCache: false,
            }).state.dateZoom.granularity;
        expect(fromProp('')).toBe('Quarter');
        expect(fromProp('?dateZoom=')).toBe('Quarter');
        expect(fromProp('?dateZoom=year')).toBe('Year');
    });

    it('keeps the parameter label overrides', () => {
        const parameterLabelOverrides = { status: { label: 'Estado' } };
        const { state } = buildInitialDashboardState({
            search: '',
            isEditMode: false,
            parameterLabelOverrides,
            dateZoom: undefined,
            invalidateCache: false,
        });
        expect(state.parameters.parameterLabelOverrides).toBe(
            parameterLabelOverrides,
        );
    });

    it.each([
        ['filters', 'savedFilterOverrides'],
        ['tempFilters', 'temporaryFilters'],
        ['parameters', 'parameters'],
    ] as const)('flags only a malformed %s param', (param, errorKey) => {
        const { state, urlRestoreErrors } = build(
            searchOf({ [param]: '{broken' }),
        );
        expect(urlRestoreErrors).toEqual({
            savedFilterOverrides: errorKey === 'savedFilterOverrides',
            temporaryFilters: errorKey === 'temporaryFilters',
            parameters: errorKey === 'parameters',
        });
        expect(state.filters.savedFilterOverrides).toBe(
            emptySavedFilterOverrides,
        );
        expect(state.filters.temporaryFilters).toBe(emptyDashboardFilters);
        expect(state.parameters.parameters).toEqual({});
    });

    it('flags a parameters param with invalid values', () => {
        const { urlRestoreErrors } = build(
            searchOf({ parameters: JSON.stringify({ a: { b: 1 } }) }),
        );
        expect(urlRestoreErrors.parameters).toBe(true);
    });
});

describe('createDashboardStore', () => {
    // Plain reducers, not createSlice: Immer would deep-freeze the react-query data we store
    it('never freezes externally owned objects', () => {
        const store = createDashboardStore(build('').state);
        const filters: DashboardFilters = {
            dimensions: [{ ...temporaryFilters.dimensions[0] }],
            metrics: [],
            tableCalculations: [],
        };
        const parameters: DashboardParameters = {
            status: { parameterName: 'status', value: ['a', 'b'] },
        };
        const definitions: ParameterDefinitions = {
            status: { label: 'Status', options: ['a', 'b'] },
        };
        const updated = {
            ...filters.dimensions[0],
            values: ['returned'],
        };

        store.dispatch(dashboardFiltersActions.setDashboardFilters(filters));
        store.dispatch(
            dashboardFiltersActions.updateFilter({
                filter: updated,
                index: 0,
                isTemporary: false,
                isInEditMode: false,
                isFilterSaved: true,
                originalFilter: filters.dimensions[0],
                category: 'dimensions',
            }),
        );
        store.dispatch(
            dashboardParametersActions.setSavedParameters(parameters),
        );
        store.dispatch(
            dashboardParametersActions.addParameterDefinitions(definitions),
        );

        const owned = [
            filters,
            filters.dimensions,
            filters.dimensions[0],
            filters.dimensions[0].values,
            updated,
            updated.values,
            parameters,
            parameters.status,
            parameters.status.value,
            definitions,
            definitions.status,
            definitions.status.options,
        ];
        owned.forEach((value) => expect(Object.isFrozen(value)).toBe(false));
        expect(store.getState().filters.dashboardFilters.dimensions[0]).toBe(
            updated,
        );
    });
});
