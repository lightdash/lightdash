import { describe, expect, it } from 'vitest';
import {
    dashboardDateZoomActions as actions,
    dashboardDateZoomReducer as reducer,
    initialDashboardDateZoomState,
    type DashboardDateZoomState,
} from './dashboardDateZoomReducer';

const fields = [
    { fieldId: 'orders_created', label: 'Created', tableName: 'orders' },
];

const stateWith = (
    overrides: Partial<DashboardDateZoomState> = {},
): DashboardDateZoomState => ({
    ...initialDashboardDateZoomState,
    ...overrides,
});

describe('dashboardDateZoomReducer', () => {
    it('returns the initial state and ignores unknown actions', () => {
        const state = reducer(undefined, { type: '@@init' });
        expect(state).toBe(initialDashboardDateZoomState);
        expect(reducer(state, { type: 'unknown' })).toBe(state);
    });

    it('sets the granularity and keeps state for the same value', () => {
        const state = reducer(undefined, actions.setGranularity('Week'));
        expect(state.granularity).toBe('Week');
        expect(reducer(state, actions.setGranularity('Week'))).toBe(state);
        expect(
            reducer(state, actions.setGranularity(undefined)).granularity,
        ).toBeUndefined();
    });

    it('sets, removes and clears control granularities', () => {
        let state = reducer(
            undefined,
            actions.setControlGranularity({
                controlUuid: 'a',
                granularity: 'Month',
            }),
        );
        state = reducer(
            state,
            actions.setControlGranularity({
                controlUuid: 'b',
                granularity: 'Year',
            }),
        );
        expect(state.controlGranularities).toEqual({ a: 'Month', b: 'Year' });
        state = reducer(
            state,
            actions.setControlGranularity({
                controlUuid: 'a',
                granularity: undefined,
            }),
        );
        expect(state.controlGranularities).toEqual({ b: 'Year' });
        state = reducer(state, actions.clearControlGranularities());
        expect(state.controlGranularities).toEqual({});
    });

    it('keeps state when the applied tiles have the same members', () => {
        const state = stateWith({
            tilesWithDateZoomApplied: new Set(['t1', 't2']),
        });
        expect(
            reducer(
                state,
                actions.setTilesWithDateZoomApplied(new Set(['t2', 't1'])),
            ),
        ).toBe(state);
        const next = reducer(
            state,
            actions.setTilesWithDateZoomApplied(new Set(['t1'])),
        );
        expect(next.tilesWithDateZoomApplied).toEqual(new Set(['t1']));
    });

    it('replaces an unset applied set with an empty one', () => {
        const next = reducer(
            undefined,
            actions.setTilesWithDateZoomApplied(new Set()),
        );
        expect(next.tilesWithDateZoomApplied).toEqual(new Set());
    });

    it('stores zoomable fields and keeps state for an equal report', () => {
        const state = reducer(
            undefined,
            actions.setChartZoomableFields({ tileUuid: 't1', fields }),
        );
        expect(state.chartZoomableFieldsByTileUuid).toEqual({ t1: fields });
        expect(
            reducer(
                state,
                actions.setChartZoomableFields({
                    tileUuid: 't1',
                    fields: [...fields],
                }),
            ),
        ).toBe(state);
    });

    it('drops zoomable fields of removed tiles only when something changes', () => {
        const state = stateWith({
            chartZoomableFieldsByTileUuid: { t1: fields, t2: fields },
        });
        expect(
            reducer(state, actions.keepTileDateZoomState(['t1', 't2', 't3'])),
        ).toBe(state);
        expect(
            reducer(state, actions.keepTileDateZoomState(['t2']))
                .chartZoomableFieldsByTileUuid,
        ).toEqual({ t2: fields });
    });
});
