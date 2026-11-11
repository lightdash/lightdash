import {
    DashboardControlRefKind,
    type DashboardParameters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dashboardEditActions } from './dashboardEditReducer';
import {
    dashboardParametersActions as actions,
    dashboardParametersReducer as reducer,
    initialDashboardParametersState,
    type DashboardParametersState,
} from './dashboardParametersReducer';

const savedParameters: DashboardParameters = {
    status: { parameterName: 'status', value: 'Shipped' },
};

const stateWith = (
    overrides: Partial<DashboardParametersState> = {},
): DashboardParametersState => ({
    ...initialDashboardParametersState,
    ...overrides,
});

describe('dashboardParametersReducer', () => {
    it('returns the initial state and ignores unknown actions', () => {
        const state = reducer(undefined, { type: '@@init' });
        expect(state).toBe(initialDashboardParametersState);
        expect(reducer(state, { type: 'unknown' })).toBe(state);
    });

    describe('setSavedParameters', () => {
        it('merges saved values under the current ones in view mode', () => {
            const state = stateWith({
                parameters: {
                    region: { parameterName: 'region', value: 'EU' },
                },
            });
            const next = reducer(
                state,
                actions.setSavedParameters(savedParameters),
            );
            expect(next.savedParameters).toBe(savedParameters);
            expect(next.parameters).toEqual({
                ...savedParameters,
                region: { parameterName: 'region', value: 'EU' },
            });
        });

        it('follows a saved change for values the viewer did not set', () => {
            const state = stateWith({
                savedParameters: {
                    status: { parameterName: 'status', value: 'Shipped' },
                    region: { parameterName: 'region', value: 'EU' },
                    removed: { parameterName: 'removed', value: 'x' },
                },
                parameters: {
                    status: { parameterName: 'status', value: 'Shipped' },
                    region: { parameterName: 'region', value: 'US' },
                    removed: { parameterName: 'removed', value: 'x' },
                },
                parameterPicks: { region: 'US' },
            });
            const next = reducer(
                state,
                actions.setSavedParameters({
                    status: { parameterName: 'status', value: 'Returned' },
                    region: { parameterName: 'region', value: 'APAC' },
                }),
            );
            expect(next.parameters).toEqual({
                status: { parameterName: 'status', value: 'Returned' },
                region: { parameterName: 'region', value: 'US' },
            });
        });

        it('replaces staged values with the saved object in edit mode', () => {
            const state = stateWith({
                isEditMode: true,
                parameters: {
                    status: { parameterName: 'status', value: 'Cancelled' },
                },
            });
            const next = reducer(
                state,
                actions.setSavedParameters(savedParameters),
            );
            expect(next.parameters).toBe(savedParameters);
        });

        it('returns the same state for the identical object', () => {
            const state = stateWith({ savedParameters });
            expect(
                reducer(state, actions.setSavedParameters(savedParameters)),
            ).toBe(state);
        });

        it('latches the changed flag on load even though values end up equal', () => {
            // quirk: the pre-reconcile comparison of {} vs saved latches the flag
            const next = reducer(
                stateWith(),
                actions.setSavedParameters(savedParameters),
            );
            expect(next.parameters).toEqual(savedParameters);
            expect(next.parametersHaveChanged).toBe(true);
        });

        it('does not latch when nothing differs', () => {
            const next = reducer(stateWith(), actions.setSavedParameters({}));
            expect(next.parametersHaveChanged).toBe(false);
        });

        it('never un-latches the flag', () => {
            const state = stateWith({ parametersHaveChanged: true });
            const next = reducer(state, actions.setSavedParameters({}));
            expect(next.parametersHaveChanged).toBe(true);
        });
    });

    describe('setIsEditMode', () => {
        it('returns the same state when unchanged', () => {
            const state = stateWith();
            expect(reducer(state, actions.setIsEditMode(false))).toBe(state);
        });

        it('reconciles to the saved parameters when entering edit mode', () => {
            const state = stateWith({
                savedParameters,
                parameters: {
                    ...savedParameters,
                    region: { parameterName: 'region', value: 'EU' },
                },
                parametersHaveChanged: false,
            });
            const next = reducer(state, actions.setIsEditMode(true));
            expect(next.isEditMode).toBe(true);
            expect(next.parameters).toBe(savedParameters);
            expect(next.parametersHaveChanged).toBe(false);
        });

        it('merges saved values under the current ones when leaving edit mode', () => {
            const state = stateWith({
                isEditMode: true,
                savedParameters,
                parameters: {
                    region: { parameterName: 'region', value: 'EU' },
                },
            });
            const next = reducer(state, actions.setIsEditMode(false));
            expect(next.parameters).toEqual({
                ...savedParameters,
                region: { parameterName: 'region', value: 'EU' },
            });
            expect(next.parametersHaveChanged).toBe(true);
        });
    });

    describe('setParameter', () => {
        it('sets a value and latches the changed flag', () => {
            const next = reducer(
                stateWith({ savedParameters, parameters: savedParameters }),
                actions.setParameter({ key: 'status', value: 'Cancelled' }),
            );
            expect(next.parameters.status).toEqual({
                parameterName: 'status',
                value: 'Cancelled',
            });
            expect(next.parametersHaveChanged).toBe(true);
        });

        it.each([
            ['null', null],
            ['empty string', ''],
            ['empty array', []],
        ])('falls back to the saved value for %s in view mode', (_, value) => {
            const state = stateWith({
                savedParameters,
                parameters: {
                    status: { parameterName: 'status', value: 'Cancelled' },
                },
            });
            const next = reducer(
                state,
                actions.setParameter({ key: 'status', value }),
            );
            expect(next.parameters.status).toBe(savedParameters.status);
        });

        it.each([
            ['null', null],
            ['empty string', ''],
            ['empty array', []],
        ])('deletes the value for %s in edit mode', (_, value) => {
            const state = stateWith({
                isEditMode: true,
                savedParameters,
                parameters: {
                    status: { parameterName: 'status', value: 'Cancelled' },
                },
            });
            const next = reducer(
                state,
                actions.setParameter({ key: 'status', value }),
            );
            expect(next.parameters).toEqual({});
        });

        it('deletes an empty value without a saved fallback in view mode', () => {
            const next = reducer(
                stateWith({
                    parameters: {
                        region: { parameterName: 'region', value: 'EU' },
                    },
                }),
                actions.setParameter({ key: 'region', value: null }),
            );
            expect(next.parameters).toEqual({});
        });
    });

    describe('clearAllParameters', () => {
        it('returns to the saved object in view mode', () => {
            const next = reducer(
                stateWith({
                    savedParameters,
                    parameters: {
                        status: { parameterName: 'status', value: 'Cancelled' },
                    },
                }),
                actions.clearAllParameters(),
            );
            expect(next.parameters).toBe(savedParameters);
        });

        it('clears everything in edit mode', () => {
            const next = reducer(
                stateWith({
                    isEditMode: true,
                    savedParameters,
                    parameters: savedParameters,
                }),
                actions.clearAllParameters(),
            );
            expect(next.parameters).toEqual({});
        });

        it('returns the same state when already on the saved object', () => {
            const state = stateWith({
                savedParameters,
                parameters: savedParameters,
            });
            expect(reducer(state, actions.clearAllParameters())).toBe(state);
        });
    });

    describe('pins and order', () => {
        it('setPinnedParameters sets pins and the changed flag', () => {
            const next = reducer(
                stateWith(),
                actions.setPinnedParameters(['status']),
            );
            expect(next.pinnedParameters).toEqual(['status']);
            expect(next.havePinnedParametersChanged).toBe(true);
        });

        it('toggleParameterPin pins and unpins', () => {
            const pinned = reducer(
                stateWith({ pinnedParameters: ['region'] }),
                actions.toggleParameterPin('status'),
            );
            expect(pinned.pinnedParameters).toEqual(['region', 'status']);
            expect(pinned.havePinnedParametersChanged).toBe(true);
            const unpinned = reducer(
                pinned,
                actions.toggleParameterPin('region'),
            );
            expect(unpinned.pinnedParameters).toEqual(['status']);
        });

        it('setParameterOrder sets order and the changed flag', () => {
            const next = reducer(
                stateWith(),
                actions.setParameterOrder(['b', 'a']),
            );
            expect(next.parameterOrder).toEqual(['b', 'a']);
            expect(next.hasParameterOrderChanged).toBe(true);
        });

        it.each([
            ['setHavePinnedParametersChanged', 'havePinnedParametersChanged'],
            ['setHasParameterOrderChanged', 'hasParameterOrderChanged'],
        ] as const)('%s sets and no-ops on the same value', (action, key) => {
            const next = reducer(stateWith(), actions[action](true));
            expect(next[key]).toBe(true);
            expect(reducer(next, actions[action](true))).toBe(next);
        });

        it.each([
            [
                'syncPinnedParameters',
                'pinnedParameters',
                'havePinnedParametersChanged',
            ],
            [
                'syncParameterOrder',
                'parameterOrder',
                'hasParameterOrderChanged',
            ],
        ] as const)(
            '%s seeds without marking a change',
            (action, key, flag) => {
                const values = ['status'];
                const next = reducer(stateWith(), actions[action](values));
                expect(next[key]).toBe(values);
                expect(next[flag]).toBe(false);
                expect(reducer(next, actions[action](values))).toBe(next);
            },
        );
    });

    describe('definitions and labels', () => {
        it('merges definitions into a new object', () => {
            const state = stateWith({
                parameterDefinitions: { a: { label: 'A' } },
            });
            const next = reducer(
                state,
                actions.addParameterDefinitions({ b: { label: 'B' } }),
            );
            expect(Object.keys(next.parameterDefinitions)).toEqual(['a', 'b']);
        });

        it('setParameterLabelOverrides no-ops on the same reference', () => {
            const overrides = { status: { label: 'Estado' } };
            const next = reducer(
                stateWith(),
                actions.setParameterLabelOverrides(overrides),
            );
            expect(next.parameterLabelOverrides).toBe(overrides);
            expect(
                reducer(next, actions.setParameterLabelOverrides(overrides)),
            ).toBe(next);
        });
    });

    describe('per-tile state', () => {
        it('addParameterReferences stores references per tile', () => {
            const next = reducer(
                stateWith(),
                actions.addParameterReferences({
                    tileUuid: 'tile-1',
                    references: ['status'],
                }),
            );
            expect(next.tileParameterReferences).toEqual({
                'tile-1': ['status'],
            });
        });

        it('setTileVirtualViewSavedParameters stores values and no-ops on deep-equal ones', () => {
            const next = reducer(
                stateWith(),
                actions.setTileVirtualViewSavedParameters({
                    tileUuid: 'tile-1',
                    values: { status: 'Shipped' },
                }),
            );
            expect(next.tileVirtualViewSavedParameters).toEqual({
                'tile-1': { status: 'Shipped' },
            });
            expect(
                reducer(
                    next,
                    actions.setTileVirtualViewSavedParameters({
                        tileUuid: 'tile-1',
                        values: { status: 'Shipped' },
                    }),
                ),
            ).toBe(next);
        });

        it.each([
            ['listed first', ['listed', 'query']],
            ['query first', ['query', 'listed']],
        ] as const)(
            "uses the tile's query references over the listed ones (%s)",
            (_name, order) => {
                const byOrigin = {
                    listed: actions.addListedParameterReferences({
                        tileUuid: 'tile-1',
                        references: ['status', 'region'],
                    }),
                    query: actions.addParameterReferences({
                        tileUuid: 'tile-1',
                        references: ['status', 'week_start'],
                    }),
                };
                const next = order.reduce(
                    (state, origin) => reducer(state, byOrigin[origin]),
                    stateWith(),
                );
                expect(next.tileParameterReferences['tile-1']).toEqual([
                    'status',
                    'week_start',
                ]);
            },
        );

        it('lists many tiles in one action, keeping query references that already arrived', () => {
            const next = [
                actions.addParameterReferences({
                    tileUuid: 'tile-1',
                    references: ['status'],
                }),
                actions.addListedParameterReferencesByTile({
                    'tile-1': ['region'],
                    'tile-2': ['week_start'],
                }),
            ].reduce(reducer, stateWith());
            expect(next.tileListedParameterReferences).toEqual({
                'tile-1': ['region'],
                'tile-2': ['week_start'],
            });
            expect(next.tileParameterReferences).toEqual({
                'tile-1': ['status'],
                'tile-2': ['week_start'],
            });
        });

        it('drops a listed reference the current query no longer uses', () => {
            const next = [
                actions.addListedParameterReferences({
                    tileUuid: 'tile-1',
                    references: ['region'],
                }),
                actions.addParameterReferences({
                    tileUuid: 'tile-1',
                    references: [],
                }),
            ].reduce(reducer, stateWith());
            expect(next.tileParameterReferences).toEqual({ 'tile-1': [] });
        });

        it('keeps the listed references while the query has none to report', () => {
            const next = [
                actions.addListedParameterReferences({
                    tileUuid: 'tile-1',
                    references: ['region'],
                }),
                actions.addParameterReferences({
                    tileUuid: 'tile-1',
                    references: null,
                }),
            ].reduce(reducer, stateWith());
            expect(next.tileParameterReferences).toEqual({
                'tile-1': ['region'],
            });
            expect(next.tileQueryParameterReferences).toEqual({
                'tile-1': null,
            });
        });

        it('setTileChartSavedParameters stores values and no-ops on deep-equal ones', () => {
            const next = reducer(
                stateWith(),
                actions.setTileChartSavedParameters({
                    tileUuid: 'tile-1',
                    values: { status: 'Shipped' },
                }),
            );
            expect(next.tileChartSavedParameters).toEqual({
                'tile-1': { status: 'Shipped' },
            });
            expect(
                reducer(
                    next,
                    actions.setTileChartSavedParameters({
                        tileUuid: 'tile-1',
                        values: { status: 'Shipped' },
                    }),
                ),
            ).toBe(next);
        });

        it('keepTileParameterState drops removed tiles', () => {
            const state = stateWith({
                tileParameterReferences: {
                    'tile-1': ['status'],
                    'tile-2': ['region'],
                },
                tileChartSavedParameters: { 'tile-2': { region: 'EU' } },
                tileVirtualViewSavedParameters: { 'tile-2': { region: 'EU' } },
            });
            const next = reducer(
                state,
                actions.keepTileParameterState(['tile-1']),
            );
            expect(next.tileVirtualViewSavedParameters).toEqual({});
            expect(next.tileParameterReferences).toEqual({
                'tile-1': ['status'],
            });
            expect(next.tileChartSavedParameters).toEqual({});
        });

        it('keepTileParameterState drops removed tiles failed listings', () => {
            const next = reducer(
                stateWith({
                    tileFailedParameterSources: {
                        'tile-1': 'chart-1',
                        'tile-2': 'chart-2',
                    },
                }),
                actions.keepTileParameterState(['tile-1']),
            );
            expect(next.tileFailedParameterSources).toEqual({
                'tile-1': 'chart-1',
            });
        });

        it("drops a tile's parameter state when its source changes, and only then", () => {
            const reported = [
                actions.addParameterReferences({
                    tileUuid: 'tile-1',
                    references: ['region'],
                }),
                actions.setTileChartSavedParameters({
                    tileUuid: 'tile-1',
                    values: { region: 'EU' },
                }),
                actions.markParameterReferencesFailed({ 'tile-1': 'chart-1' }),
            ].reduce(reducer, stateWith());
            const recorded = reducer(
                reported,
                actions.resetChangedTileParameterSources({
                    'tile-1': 'chart-1',
                }),
            );
            expect(recorded.tileParameterReferences).toEqual({
                'tile-1': ['region'],
            });
            expect(
                reducer(
                    recorded,
                    actions.resetChangedTileParameterSources({
                        'tile-1': 'chart-1',
                    }),
                ),
            ).toBe(recorded);
            const swapped = reducer(
                recorded,
                actions.resetChangedTileParameterSources({
                    'tile-1': 'chart-2',
                }),
            );
            expect(swapped.tileParameterReferences).toEqual({});
            expect(swapped.tileQueryParameterReferences).toEqual({});
            expect(swapped.tileChartSavedParameters).toEqual({});
            expect(swapped.tileFailedParameterSources).toEqual({});
            expect(swapped.tileParameterStateSources).toEqual({
                'tile-1': 'chart-2',
            });
        });

        it("keeps a tile's own report when a late listing fails", () => {
            const next = [
                actions.addParameterReferences({
                    tileUuid: 'tile-1',
                    references: ['status'],
                }),
                actions.markParameterReferencesFailed({ 'tile-1': 'chart-2' }),
            ].reduce(
                reducer,
                stateWith({
                    tileListedParameterSources: { 'tile-1': 'chart-1' },
                }),
            );
            expect(next.tileParameterReferences).toEqual({
                'tile-1': ['status'],
            });
        });

        it('clears a failed listing once the tile is listed', () => {
            const failed = reducer(
                stateWith(),
                actions.markParameterReferencesFailed({
                    'tile-1': 'chart-1',
                    'tile-2': 'chart-2',
                }),
            );
            const next = reducer(
                failed,
                actions.addDiscoveredParameterReferences({
                    references: { 'tile-1': ['region'] },
                    definitions: {},
                    sources: { 'tile-1': 'chart-1' },
                    chartSavedValues: { 'tile-1': {} },
                    virtualViewSavedValues: { 'tile-1': {} },
                }),
            );
            expect(next.tileFailedParameterSources).toEqual({
                'tile-2': 'chart-2',
            });
        });

        it('keepTileParameterState returns the same state when nothing is dropped', () => {
            const state = stateWith({
                tileParameterReferences: { 'tile-1': ['status'] },
                tileChartSavedParameters: { 'tile-1': { status: 'Shipped' } },
            });
            expect(
                reducer(
                    state,
                    actions.keepTileParameterState(['tile-1', 'tile-2']),
                ),
            ).toBe(state);
        });
    });

    describe('listed saved values', () => {
        const listing = (
            chartSavedValues: Record<string, Record<string, string>>,
            source = 'chart-1',
        ) =>
            actions.addDiscoveredParameterReferences({
                references: { 'tile-1': ['region'] },
                definitions: {},
                sources: { 'tile-1': source },
                chartSavedValues,
                virtualViewSavedValues: { 'tile-1': { week: 'listed' } },
            });
        const tileReport = [
            actions.setTileChartSavedParameters({
                tileUuid: 'tile-1',
                values: { region: 'own' },
            }),
            actions.setTileVirtualViewSavedParameters({
                tileUuid: 'tile-1',
                values: { week: 'own' },
            }),
        ];

        it('seeds the saved values of tiles that have not reported', () => {
            const next = reducer(
                stateWith(),
                listing({ 'tile-1': { region: 'listed' } }),
            );
            expect(next.tileChartSavedParameters).toEqual({
                'tile-1': { region: 'listed' },
            });
            expect(next.tileVirtualViewSavedParameters).toEqual({
                'tile-1': { week: 'listed' },
            });
        });

        it.each([
            ['the listing first', true],
            ['the tile first', false],
        ])("keeps the tile's own values with %s", (_order, listingFirst) => {
            const listed = listing({ 'tile-1': { region: 'listed' } });
            const next = (
                listingFirst ? [listed, ...tileReport] : [...tileReport, listed]
            ).reduce(reducer, stateWith());
            expect(next.tileChartSavedParameters['tile-1']).toEqual({
                region: 'own',
            });
            expect(next.tileVirtualViewSavedParameters['tile-1']).toEqual({
                week: 'own',
            });
        });

        it('replaces the values when the tile points at another chart', () => {
            const next = [
                actions.resetChangedTileParameterSources({
                    'tile-1': 'chart-1',
                }),
                listing({ 'tile-1': { region: 'listed' } }),
                ...tileReport,
                actions.resetChangedTileParameterSources({
                    'tile-1': 'chart-2',
                }),
                listing({ 'tile-1': { region: 'other' } }, 'chart-2'),
            ].reduce(reducer, stateWith());
            expect(next.tileChartSavedParameters['tile-1']).toEqual({
                region: 'other',
            });
        });

        it('seeds nothing for a tile left out of the listing', () => {
            const next = reducer(
                stateWith(),
                actions.addDiscoveredParameterReferences({
                    references: {},
                    definitions: {},
                    sources: {},
                    chartSavedValues: {},
                    virtualViewSavedValues: {},
                }),
            );
            expect(next.tileChartSavedParameters).toEqual({});
            expect(next.tileVirtualViewSavedParameters).toEqual({});
        });
    });

    describe('parameter controls', () => {
        const control = (key: string, id: string) => ({
            id,
            label: 'Label',
            value: null,
            valueType: { type: 'string', multiple: false } as const,
            parameters: { [key]: 'all' as const },
        });
        // One control per key, applying to every tile using it
        const filledList = (ids: Record<string, string>) =>
            Object.entries(ids).map(([key, id]) => control(key, id));

        it('seeds a saved list without marking it as changed', () => {
            const list = filledList({ region: 'a' });
            const next = reducer(
                stateWith(),
                actions.syncParameterControls({
                    controls: list,
                    isSaved: true,
                }),
            );
            expect(next.parameterControls).toEqual(list);
            expect(next.areParameterControlsSaved).toBe(true);
            expect(next.haveParameterControlsChanged).toBe(false);
        });

        it('records the synced ids as saved, and keeps them through an edit', () => {
            const synced = reducer(
                stateWith(),
                actions.syncParameterControls({
                    controls: filledList({ region: 'a' }),
                    isSaved: false,
                }),
            );
            expect(synced.savedParameterControlIds).toEqual(['a']);
            const edited = reducer(
                synced,
                actions.setParameterControls(
                    filledList({ region: 'a', currency: 'b' }),
                ),
            );
            expect(edited.savedParameterControlIds).toEqual(['a']);
            // Saved and synced again with the same list: the new id counts as saved
            const resynced = reducer(
                reducer(edited, actions.setHaveParameterControlsChanged(false)),
                actions.syncParameterControls({
                    controls: filledList({ region: 'a', currency: 'b' }),
                    isSaved: true,
                }),
            );
            expect(resynced.savedParameterControlIds).toEqual(['a', 'b']);
        });

        it('keeps the ids of filled controls when the list is refilled', () => {
            const filled = reducer(
                stateWith(),
                actions.syncParameterControls({
                    controls: filledList({ region: 'a' }),
                    isSaved: false,
                }),
            );
            const refilled = reducer(
                filled,
                actions.syncParameterControls({
                    controls: filledList({ region: 'b', status: 'c' }),
                    isSaved: false,
                }),
            );
            expect(refilled.parameterControls).toEqual(
                filledList({ region: 'a', status: 'c' }),
            );
            expect(
                reducer(
                    refilled,
                    actions.syncParameterControls({
                        controls: filledList({ region: 'd', status: 'e' }),
                        isSaved: false,
                    }),
                ),
            ).toBe(refilled);
        });

        it('keeps never saved controls once the bar is reordered, until the save', () => {
            const filled = reducer(
                stateWith(),
                actions.syncParameterControls({
                    controls: filledList({ region: 'a' }),
                    isSaved: false,
                }),
            );
            const arranged = reducer(
                filled,
                dashboardEditActions.arrangeControls([
                    { kind: DashboardControlRefKind.PARAMETER, id: 'a' },
                ]),
            );
            expect(arranged.haveParameterControlsChanged).toBe(true);
            // A new section stores the bar's order too
            expect(
                reducer(
                    filled,
                    dashboardEditActions.addControlSection({
                        section: { id: 's', name: 'New' },
                        barOrder: [
                            {
                                kind: DashboardControlRefKind.PARAMETER,
                                id: 'a',
                            },
                        ],
                    }),
                ).haveParameterControlsChanged,
            ).toBe(true);
            // A refill from the tiles no longer replaces the listed ids
            expect(
                reducer(
                    arranged,
                    actions.syncParameterControls({
                        controls: [control('region', 'z')],
                        isSaved: false,
                    }),
                ),
            ).toBe(arranged);
            // Saved ones already keep their ids: nothing to mark
            const saved = reducer(
                stateWith(),
                actions.syncParameterControls({
                    controls: filledList({ region: 'a' }),
                    isSaved: true,
                }),
            );
            expect(
                reducer(saved, dashboardEditActions.arrangeControls([])),
            ).toBe(saved);
        });

        it('marks updates and removals as changed, and stops seeding until reset', () => {
            const seeded = stateWith({
                parameterControls: filledList({ region: 'a', status: 'b' }),
            });
            const updated = reducer(
                seeded,
                actions.updateParameterControl({
                    id: 'a',
                    changes: { label: 'Region' },
                }),
            );
            expect(updated.parameterControls?.[0].label).toBe('Region');
            expect(updated.haveParameterControlsChanged).toBe(true);

            const removed = reducer(
                updated,
                actions.removeParameterControl('b'),
            );
            expect(removed.parameterControls).toEqual([
                { ...control('region', 'a'), label: 'Region' },
            ]);
            const empty = { controls: [], isSaved: true };
            expect(reducer(removed, actions.syncParameterControls(empty))).toBe(
                removed,
            );

            const reset = reducer(
                removed,
                actions.setHaveParameterControlsChanged(false),
            );
            expect(
                reducer(reset, actions.syncParameterControls(empty))
                    .parameterControls,
            ).toEqual([]);
        });

        it('does not edit controls before discovery is complete', () => {
            const state = stateWith();
            expect(
                reducer(
                    state,
                    actions.setParameterControls(filledList({ region: 'a' })),
                ),
            ).toBe(state);
        });

        it('replaces the whole list with setParameterControls', () => {
            const list = filledList({ region: 'a' });
            const next = reducer(
                stateWith({ parameterControls: [] }),
                actions.setParameterControls(list),
            );
            expect(next.parameterControls).toBe(list);
            expect(next.haveParameterControlsChanged).toBe(true);
        });
    });

    describe('parameter picks', () => {
        it('records a picked value by key, even when it equals the saved one', () => {
            const next = reducer(
                stateWith({ savedParameters }),
                actions.setParameter({ key: 'status', value: 'Shipped' }),
            );
            expect(next.parameterPicks).toEqual({ status: 'Shipped' });
        });

        it('drops a pick reverted in view mode and records a clear in edit mode', () => {
            const picked = stateWith({
                savedParameters,
                parameterPicks: { status: 'Pending' },
            });
            expect(
                reducer(
                    picked,
                    actions.setParameter({ key: 'status', value: null }),
                ).parameterPicks,
            ).toEqual({});
            expect(
                reducer(
                    { ...picked, isEditMode: true },
                    actions.setParameter({ key: 'status', value: null }),
                ).parameterPicks,
            ).toEqual({ status: null });
        });

        it('starts edit mode with no picks and takes a delivery values as picks', () => {
            const picked = stateWith({ parameterPicks: { status: 'Pending' } });
            expect(
                reducer(picked, actions.setIsEditMode(true)).parameterPicks,
            ).toEqual({});
            expect(
                reducer(
                    stateWith(),
                    actions.setParameterPicks({ status: 'Returned' }),
                ).parameterPicks,
            ).toEqual({ status: 'Returned' });
        });

        it('clears every pick in view mode and nulls every key in edit mode', () => {
            const picked = stateWith({
                savedParameters,
                parameterPicks: { region: 'EU' },
            });
            expect(
                reducer(picked, actions.clearAllParameters()).parameterPicks,
            ).toEqual({});
            expect(
                reducer(
                    { ...picked, isEditMode: true },
                    actions.clearAllParameters(),
                ).parameterPicks,
            ).toEqual({ status: null, region: null });
        });
    });
});
