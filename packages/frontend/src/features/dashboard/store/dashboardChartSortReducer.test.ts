import { type SortField } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { createDashboardTestStore } from '../../../testing/dashboardStore';
import {
    dashboardChartSortActions as actions,
    dashboardChartSortReducer as reducer,
    initialDashboardChartSortState,
} from './dashboardChartSortReducer';
import { selectTileChartSorts } from './selectors';

const ascending: SortField[] = [
    { fieldId: 'orders_status', descending: false },
];
const descending: SortField[] = [
    { fieldId: 'orders_status', descending: true },
];

describe('dashboardChartSortReducer', () => {
    it('returns the initial state and ignores unknown actions', () => {
        const state = reducer(undefined, { type: '@@init' });
        expect(state).toBe(initialDashboardChartSortState);
        expect(reducer(state, { type: 'unknown' })).toBe(state);
    });

    it('replaces one tile and keeps the other tiles by reference', () => {
        let state = reducer(
            undefined,
            actions.setTileSorts({ tileUuid: 'a', sorts: ascending }),
        );
        state = reducer(
            state,
            actions.setTileSorts({ tileUuid: 'b', sorts: descending }),
        );
        const tileB = state.sortsByTileUuid.b;
        state = reducer(
            state,
            actions.setTileSorts({ tileUuid: 'a', sorts: descending }),
        );
        expect(state.sortsByTileUuid).toEqual({ a: descending, b: descending });
        expect(state.sortsByTileUuid.b).toBe(tileB);
    });

    it('keeps state for an identical sort and for clearing an unsorted tile', () => {
        const state = reducer(
            undefined,
            actions.setTileSorts({ tileUuid: 'a', sorts: ascending }),
        );
        expect(
            reducer(
                state,
                actions.setTileSorts({ tileUuid: 'a', sorts: [...ascending] }),
            ),
        ).toBe(state);
        expect(
            reducer(state, actions.setTileSorts({ tileUuid: 'b', sorts: [] })),
        ).toBe(state);
    });

    it('clears a tile with an empty list', () => {
        let state = reducer(
            undefined,
            actions.setTileSorts({ tileUuid: 'a', sorts: ascending }),
        );
        state = reducer(
            state,
            actions.setTileSorts({ tileUuid: 'a', sorts: [] }),
        );
        expect(state.sortsByTileUuid).toEqual({});
    });
});

describe('selectTileChartSorts', () => {
    it('returns one stable empty list for every unsorted tile', () => {
        const store = createDashboardTestStore({
            chartSortsByTileUuid: { a: ascending },
        });
        const empty = selectTileChartSorts(store.getState(), 'b');
        expect(empty).toEqual([]);
        expect(selectTileChartSorts(store.getState(), 'c')).toBe(empty);
        expect(selectTileChartSorts(store.getState(), 'a')).toBe(ascending);
        store.dispatch(actions.setTileSorts({ tileUuid: 'a', sorts: [] }));
        expect(selectTileChartSorts(store.getState(), 'a')).toBe(empty);
    });
});
