import { describe, expect, it } from 'vitest';
import {
    dashboardTileStatusActions as actions,
    dashboardTileStatusReducer as reducer,
    initialDashboardTileStatusState,
} from './dashboardTileStatusReducer';

const hit = (iso: string) => ({
    cacheHit: true,
    cacheUpdatedTime: new Date(iso),
});

describe('dashboardTileStatusReducer', () => {
    it('returns the initial state and ignores unknown actions', () => {
        const state = reducer(undefined, { type: '@@init' });
        expect(state).toBe(initialDashboardTileStatusState);
        expect(reducer(state, { type: 'unknown' })).toBe(state);
    });

    it('keeps state when a tile reports again', () => {
        const loaded = reducer(undefined, actions.markTileLoaded('a'));
        expect(reducer(loaded, actions.markTileLoaded('a'))).toBe(loaded);
        const ready = reducer(loaded, actions.markTileScreenshotReady('a'));
        expect(reducer(ready, actions.markTileScreenshotReady('a'))).toBe(
            ready,
        );
        const errored = reducer(ready, actions.markTileScreenshotErrored('a'));
        expect(reducer(errored, actions.markTileScreenshotErrored('a'))).toBe(
            errored,
        );
    });

    it('keeps state for a newer cache time or a cache miss', () => {
        const state = reducer(
            undefined,
            actions.addResultsCacheTime(hit('2026-01-01T00:00:00Z')),
        );
        expect(
            reducer(
                state,
                actions.addResultsCacheTime(hit('2026-01-02T00:00:00Z')),
            ),
        ).toBe(state);
        expect(
            reducer(state, actions.addResultsCacheTime({ cacheHit: false })),
        ).toBe(state);
    });

    it('keeps state when screenshot readiness is already empty', () => {
        const state = reducer(undefined, actions.resetScreenshotTiles());
        expect(state).toBe(initialDashboardTileStatusState);
        expect(
            reducer(state, actions.markTileScreenshotLoading('missing')),
        ).toBe(state);
    });

    it('restarts embed completion when the load cycle changes', () => {
        let state = reducer(
            undefined,
            actions.markEmbedTileComplete({ tileUuid: 'a', cycleKey: 'one' }),
        );
        state = reducer(
            state,
            actions.markEmbedTileComplete({ tileUuid: 'b', cycleKey: 'one' }),
        );
        expect(state.completedEmbedTiles.tileUuids).toEqual(
            new Set(['a', 'b']),
        );
        expect(
            reducer(
                state,
                actions.markEmbedTileComplete({
                    tileUuid: 'a',
                    cycleKey: 'one',
                }),
            ),
        ).toBe(state);
        state = reducer(
            state,
            actions.markEmbedTileComplete({ tileUuid: 'b', cycleKey: 'two' }),
        );
        expect(state.completedEmbedTiles).toEqual({
            cycleKey: 'two',
            tileUuids: new Set(['b']),
        });
    });
});
