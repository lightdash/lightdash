import { type DashboardParameters } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
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
            });
            const next = reducer(
                state,
                actions.keepTileParameterState(['tile-1']),
            );
            expect(next.tileParameterReferences).toEqual({
                'tile-1': ['status'],
            });
            expect(next.tileChartSavedParameters).toEqual({});
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
});
