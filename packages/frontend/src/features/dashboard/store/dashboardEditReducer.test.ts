import {
    DashboardTileTypes,
    DateGranularity,
    type Dashboard,
    type DateZoomConfig,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { createDashboardStore } from '.';
import { buildInitialDashboardState } from './buildInitialState';
import {
    dashboardEditActions as actions,
    getSavedDateZoomSettings,
    initialDashboardEditState,
    dashboardEditReducer as reducer,
} from './dashboardEditReducer';
import {
    selectDateZoomConfig,
    selectDateZoomGranularities,
    selectDefaultDateZoomGranularity,
    selectHasDateZoomConfigChanged,
    selectHasTilesThatSupportFilters,
    selectSavedChartUuidsAndTileUuids,
    selectSavedChartUuidsAndTileUuidsKey,
    selectTileUuidsKey,
} from './dashboardEditSelectors';

const tile = (uuid: string, x = 0): Dashboard['tiles'][number] => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x,
    y: 0,
    w: 6,
    h: 3,
    tabUuid: undefined,
    properties: { savedChartUuid: `chart-${uuid}`, title: uuid },
});

const zoom = (name: string): DateZoomConfig => ({
    controls: [{ uuid: 'c1', name, granularity: DateGranularity.MONTH }],
    tileTargets: {},
});

const storeWith = (edit = initialDashboardEditState) => {
    const { state } = buildInitialDashboardState({
        search: '',
        isEditMode: true,
        parameterLabelOverrides: undefined,
        dateZoom: undefined,
        invalidateCache: false,
    });
    return { ...state, edit };
};

describe('dashboardEditReducer', () => {
    it('returns the initial state and ignores unknown actions', () => {
        const state = reducer(undefined, { type: '@@init' });
        expect(state).toBe(initialDashboardEditState);
        expect(reducer(state, { type: 'unknown' })).toBe(state);
    });

    it('keeps state when a setter writes the current value', () => {
        const tiles = [tile('a')];
        const state = reducer(undefined, actions.setTiles(tiles));
        expect(reducer(state, actions.setTiles(tiles))).toBe(state);
        expect(reducer(state, actions.setHaveTilesChanged(false))).toBe(state);
    });

    it('sorts tabs by order', () => {
        const state = reducer(
            undefined,
            actions.setTabs([
                { uuid: 'b', name: 'B', order: 1 },
                { uuid: 'a', name: 'A', order: 0 },
            ]),
        );
        expect(state.tabs.map((t) => t.uuid)).toEqual(['a', 'b']);
    });

    it('seeds custom metrics from the saved config only while unflagged', () => {
        const metric = { name: 'm', table: 't' } as never;
        const seeded = reducer(undefined, actions.syncCustomMetrics([metric]));
        expect(seeded.customMetrics).toEqual([metric]);
        const flagged = reducer(
            reducer(seeded, actions.setCustomMetrics([])),
            actions.setHaveCustomMetricsChanged(true),
        );
        expect(reducer(flagged, actions.syncCustomMetrics([metric]))).toBe(
            flagged,
        );
    });

    it('does not freeze the react-query objects it stores', () => {
        const store = createDashboardStore(storeWith());
        const tiles = [tile('a')];
        store.dispatch(actions.setTiles(tiles));
        expect(Object.isFrozen(tiles)).toBe(false);
        expect(Object.isFrozen(tiles[0])).toBe(false);
        expect(store.getState().edit.tiles).toBe(tiles);
    });
});

describe('date zoom setting drafts', () => {
    it('resolves to the saved values without a draft', () => {
        const saved = getSavedDateZoomSettings({
            isDateZoomDisabled: false,
            dateZoomConfig: zoom('Saved'),
            dateZoomGranularities: [DateGranularity.DAY],
            defaultDateZoomGranularity: DateGranularity.DAY,
        });
        const state = storeWith();
        expect(selectDateZoomConfig(state, saved.dateZoomConfig)).toBe(
            saved.dateZoomConfig,
        );
        expect(
            selectDateZoomGranularities(state, saved.dateZoomGranularities),
        ).toBe(saved.dateZoomGranularities);
        expect(
            selectDefaultDateZoomGranularity(
                state,
                saved.defaultDateZoomGranularity,
            ),
        ).toBe(DateGranularity.DAY);
        expect(
            selectHasDateZoomConfigChanged(state, saved.dateZoomConfig),
        ).toBe(false);
    });

    it('keeps the default list and empty config identical across calls', () => {
        expect(getSavedDateZoomSettings(undefined)).toEqual(
            getSavedDateZoomSettings({ isDateZoomDisabled: false }),
        );
        expect(getSavedDateZoomSettings(undefined).dateZoomGranularities).toBe(
            getSavedDateZoomSettings({ isDateZoomDisabled: true })
                .dateZoomGranularities,
        );
    });

    it('applies a config draft while the saved config is equal by content', () => {
        const edited = zoom('Edited');
        const edit = reducer(
            undefined,
            actions.setDateZoomConfig({
                value: edited,
                changed: true,
                saved: zoom('Saved'),
            }),
        );
        const state = storeWith(edit);
        expect(selectDateZoomConfig(state, zoom('Saved'))).toBe(edited);
        expect(selectHasDateZoomConfigChanged(state, zoom('Saved'))).toBe(true);
        expect(selectDateZoomConfig(state, zoom('Other'))).toEqual(
            zoom('Other'),
        );
        expect(selectHasDateZoomConfigChanged(state, zoom('Other'))).toBe(
            false,
        );
    });

    it('applies list drafts only while the saved list is the same reference', () => {
        const saved = [DateGranularity.DAY];
        const edit = reducer(
            undefined,
            actions.setDateZoomGranularities({
                value: [DateGranularity.WEEK],
                saved,
            }),
        );
        expect(edit.haveDateZoomGranularitiesChanged).toBe(true);
        const state = storeWith(edit);
        expect(selectDateZoomGranularities(state, saved)).toEqual([
            DateGranularity.WEEK,
        ]);
        expect(
            selectDateZoomGranularities(state, [DateGranularity.DAY]),
        ).toEqual([DateGranularity.DAY]);
    });

    it('drops only the drafts whose saved value changed', () => {
        const savedList = [DateGranularity.DAY];
        let edit = reducer(
            undefined,
            actions.setDateZoomConfig({
                value: zoom('Edited'),
                changed: true,
                saved: zoom('Saved'),
            }),
        );
        edit = reducer(
            edit,
            actions.setDateZoomGranularities({
                value: [DateGranularity.WEEK],
                saved: savedList,
            }),
        );
        edit = reducer(
            edit,
            actions.setDefaultDateZoomGranularity({
                value: DateGranularity.WEEK,
                saved: DateGranularity.DAY,
            }),
        );
        const unchanged = reducer(
            edit,
            actions.dropStaleDrafts({
                dateZoomConfig: zoom('Saved'),
                dateZoomGranularities: savedList,
                defaultDateZoomGranularity: DateGranularity.DAY,
            }),
        );
        expect(unchanged).toBe(edit);

        const dropped = reducer(
            edit,
            actions.dropStaleDrafts({
                dateZoomConfig: zoom('Saved'),
                dateZoomGranularities: [DateGranularity.MONTH],
                defaultDateZoomGranularity: DateGranularity.MONTH,
            }),
        );
        expect(dropped.dateZoomConfig).toBe(edit.dateZoomConfig);
        expect(dropped.dateZoomGranularities).toBeNull();
        expect(dropped.defaultDateZoomGranularity).toBeNull();
        // The changed flags of the lists are kept, as before the store
        expect(dropped.haveDateZoomGranularitiesChanged).toBe(true);
        expect(dropped.hasDefaultDateZoomGranularityChanged).toBe(true);
    });
});

describe('tile selectors', () => {
    it('keeps the tile keys stable when tiles move', () => {
        const before = storeWith(
            reducer(undefined, actions.setTiles([tile('a'), tile('b')])),
        );
        const after = storeWith(
            reducer(undefined, actions.setTiles([tile('a', 6), tile('b')])),
        );
        expect(selectTileUuidsKey(after)).toBe(selectTileUuidsKey(before));
        expect(selectSavedChartUuidsAndTileUuidsKey(after)).toBe(
            selectSavedChartUuidsAndTileUuidsKey(before),
        );
        expect(selectSavedChartUuidsAndTileUuids(after)).toEqual([
            { tileUuid: 'a', savedChartUuid: 'chart-a' },
            { tileUuid: 'b', savedChartUuid: 'chart-b' },
        ]);
    });

    it('reports whether any tile supports filters', () => {
        expect(selectHasTilesThatSupportFilters(storeWith())).toBe(false);
        const markdown = {
            ...tile('m'),
            type: DashboardTileTypes.MARKDOWN,
            properties: { title: '', content: '' },
        } as Dashboard['tiles'][number];
        expect(
            selectHasTilesThatSupportFilters(
                storeWith(reducer(undefined, actions.setTiles([markdown]))),
            ),
        ).toBe(false);
        expect(
            selectHasTilesThatSupportFilters(
                storeWith(reducer(undefined, actions.setTiles([tile('a')]))),
            ),
        ).toBe(true);
    });
});
