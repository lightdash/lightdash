import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameterControl,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { selectParameterControlInputs, type DashboardStoreState } from '.';
import { buildInitialDashboardState } from './buildInitialState';
import { initialDashboardChartSortState } from './dashboardChartSortReducer';
import { initialDashboardDateZoomState } from './dashboardDateZoomReducer';
import { initialDashboardEditState } from './dashboardEditReducer';
import { initialDashboardFiltersState } from './dashboardFiltersReducer';
import {
    initialDashboardParametersState,
    type DashboardParametersState,
} from './dashboardParametersReducer';
import { initialDashboardSourceState } from './dashboardSourceReducer';
import { initialDashboardTileStatusState } from './dashboardTileStatusReducer';
import { getTileDashboardParameterInputs } from './parameterControls';
import {
    combineDashboardFilters,
    getSafeTemporaryFilters,
    selectAppliedParameterValues,
    selectDashboardParameterDefinitions,
    selectDashboardParameterReferences,
    selectDashboardWideParameterValues,
    selectMissingRequiredParameters,
    selectParameterValues,
} from './selectors';

const valueType = { type: 'string', multiple: false } as const;

const stateWith = (
    parameters: Partial<DashboardParametersState>,
): DashboardStoreState => ({
    source: initialDashboardSourceState,
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
            tileQueryParameterReferences: { 'tile-1': ['status'] },
        };

        it('reports a referenced parameter without any value', () => {
            const state = stateWith(base);
            expect(selectMissingRequiredParameters(state)).toEqual(['status']);
            expect(selectMissingRequiredParameters(state)).toBe(
                selectMissingRequiredParameters(state),
            );
        });

        it("is satisfied by the tile's virtual-view saved value", () => {
            expect(
                selectMissingRequiredParameters(
                    stateWith({
                        ...base,
                        tileVirtualViewSavedParameters: {
                            'tile-1': { status: 'Shipped' },
                        },
                    }),
                ),
            ).toEqual([]);
        });

        it('skips a tile whose saved values are not known until it runs', () => {
            expect(
                selectMissingRequiredParameters(
                    stateWith({
                        ...base,
                        tileQueryParameterReferences: {},
                        tileListedParameterReferences: {
                            'tile-1': ['status'],
                        },
                    }),
                ),
            ).toEqual([]);
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

        it('checks each tile against the control that sets it', () => {
            const state = stateWith({
                ...base,
                tileParameterReferences: {
                    'tile-1': ['status'],
                    'tile-2': ['status'],
                },
                tileQueryParameterReferences: {
                    'tile-1': ['status'],
                    'tile-2': ['status'],
                },
                tileChartSavedParameters: { 'tile-2': { status: 'Shipped' } },
                parameters: {
                    status: { parameterName: 'status', value: 'x' },
                },
                // The dashboard value applies only to tile-1; tile-2 keeps its chart value
                areParameterControlsSaved: true,
                parameterControls: [
                    {
                        id: 'a',
                        label: 'A',
                        value: 'x',
                        valueType,
                        parameters: { status: { only: ['tile-1'] } },
                    },
                    {
                        id: 'b',
                        label: 'B',
                        value: null,
                        valueType,
                        parameters: { status: { only: [] } },
                    },
                ],
            });
            expect(selectMissingRequiredParameters(state)).toEqual([]);
            expect(
                selectMissingRequiredParameters(
                    stateWith({
                        ...state.parameters,
                        tileChartSavedParameters: {},
                    }),
                ),
            ).toEqual(['status']);
        });
    });

    describe('selectParameterControlInputs', () => {
        it('is null with the flag off', () => {
            expect(selectParameterControlInputs(stateWith({}))).toBeNull();
        });

        it('is null while the list is only filled from the tiles', () => {
            const filled = stateWith({
                parameterControls: [
                    {
                        id: 'a',
                        label: 'A',
                        value: 'x',
                        valueType,
                        parameters: { status: 'all' },
                    },
                ],
            });
            expect(selectParameterControlInputs(filled)).toBeNull();
            expect(
                selectParameterControlInputs(
                    stateWith({
                        ...filled.parameters,
                        haveParameterControlsChanged: true,
                    }),
                ),
            ).not.toBeNull();
        });

        it('passes the picks as overrides, leaving the controls as saved', () => {
            const savedList: DashboardParameterControl[] = [
                {
                    id: 'a',
                    label: 'A',
                    value: 'Saved',
                    valueType,
                    parameters: { status: 'all' },
                },
            ];
            const state = stateWith({
                parameters: {
                    status: { parameterName: 'status', value: 'Picked' },
                },
                parameterPicks: { status: 'Picked', region: null },
                areParameterControlsSaved: true,
                parameterControls: savedList,
            });
            expect(selectParameterControlInputs(state)).toEqual({
                controls: savedList,
                overrides: { status: 'Picked' },
                tilePicks: {},
                userParameterNames: [],
            });
            expect(selectParameterControlInputs(state)).toBe(
                selectParameterControlInputs(state),
            );
        });
    });

    describe('selectDashboardWideParameterValues', () => {
        const list: DashboardParameterControl[] = [
            {
                id: 'a',
                label: 'A',
                value: 'Saved',
                valueType,
                parameters: { status: 'all' },
            },
        ];
        const parameters = {
            status: { parameterName: 'status', value: 'Saved' },
            region: { parameterName: 'region', value: 'US' },
        };

        it('sends the full map without controls', () => {
            expect(
                selectDashboardWideParameterValues(stateWith({ parameters })),
            ).toEqual({ status: 'Saved', region: 'US' });
        });

        it('sends the full map when the controls are not saved', () => {
            expect(
                selectDashboardWideParameterValues(
                    stateWith({
                        parameters,
                        parameterControls: list,
                        areParameterControlsSaved: false,
                    }),
                ),
            ).toEqual({ status: 'Saved', region: 'US' });
        });

        it('sends only the picks when the controls are saved', () => {
            expect(
                selectDashboardWideParameterValues(
                    stateWith({
                        parameters,
                        parameterControls: list,
                        areParameterControlsSaved: true,
                        parameterPicks: { region: 'EU', status: null },
                    }),
                ),
            ).toEqual({ region: 'EU' });
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

describe('parameter picks reaching shared-key controls', () => {
    const sharedKeyControls: DashboardParameterControl[] = [
        {
            id: 'sales',
            label: 'Sales',
            value: 'monday',
            valueType,
            parameters: { week_start: { except: ['ops'] } },
        },
        {
            id: 'ops',
            label: 'Ops',
            value: 'sunday',
            valueType,
            parameters: { week_start: { only: ['ops'] } },
        },
    ];
    const tileValues = (state: DashboardStoreState) =>
        ['sales', 'ops'].map(
            (tileUuid) =>
                getTileDashboardParameterInputs({
                    controlInputs: selectParameterControlInputs(state),
                    tileUuid,
                    tileParameterReferences: {
                        sales: ['week_start'],
                        ops: ['week_start'],
                    },
                    dashboardValues: {},
                }).dashboardValues,
        );

    it('a URL value equal to the first control value still sets the second', () => {
        const { state } = buildInitialDashboardState({
            search: `?parameters=${encodeURIComponent(
                JSON.stringify({ week_start: 'monday' }),
            )}`,
            isEditMode: false,
            parameterLabelOverrides: undefined,
            dateZoom: undefined,
            invalidateCache: false,
        });
        expect(
            tileValues({
                ...state,
                parameters: {
                    ...state.parameters,
                    parameterControls: sharedKeyControls,
                    areParameterControlsSaved: true,
                },
            }),
        ).toEqual([{ week_start: 'monday' }, { week_start: 'monday' }]);
    });

    it('without a pick each control keeps its own value', () => {
        expect(
            tileValues(
                stateWith({
                    parameters: {
                        week_start: {
                            parameterName: 'week_start',
                            value: 'monday',
                        },
                    },
                    parameterControls: sharedKeyControls,
                    areParameterControlsSaved: true,
                }),
            ),
        ).toEqual([{ week_start: 'monday' }, { week_start: 'sunday' }]);
    });
});
