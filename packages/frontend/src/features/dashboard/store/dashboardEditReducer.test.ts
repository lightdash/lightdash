import {
    DashboardControlRefKind,
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
    selectCanRedoTileLayout,
    selectCanUndoTileLayout,
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

    describe('control sections', () => {
        const sections = [
            { id: 'a', name: 'Dates' },
            { id: 'b', name: 'Regions' },
        ];

        it('seeds the sections without marking them changed', () => {
            const state = reducer(
                initialDashboardEditState,
                actions.syncControlSections(sections),
            );
            expect(state.controlSections).toBe(sections);
            expect(state.haveControlSectionsChanged).toBe(false);
        });

        it('keeps staged sections over a seed', () => {
            const edited = reducer(
                initialDashboardEditState,
                actions.addControlSection({
                    section: sections[0],
                    barOrder: [],
                }),
            );
            expect(edited.haveControlSectionsChanged).toBe(true);
            const state = reducer(
                edited,
                actions.syncControlSections(sections),
            );
            expect(state.controlSections).toEqual([sections[0]]);
            const reset = reducer(
                state,
                actions.setHaveControlSectionsChanged(false),
            );
            expect(
                reducer(reset, actions.syncControlSections(sections))
                    .controlSections,
            ).toBe(sections);
        });

        describe('adding a section', () => {
            const { FILTER, SECTION } = DashboardControlRefKind;
            const added = { id: 'c', name: 'New' };
            const barOrder = [
                { kind: FILTER, id: 'f' },
                { kind: SECTION, id: 'a', newLine: true },
                { kind: SECTION, id: 'b', newLine: true },
            ];
            const seeded = () =>
                reducer(
                    initialDashboardEditState,
                    actions.syncControlSections(sections),
                );

            it('stores no order for the first section', () => {
                const state = reducer(
                    initialDashboardEditState,
                    actions.addControlSection({ section: added, barOrder: [] }),
                );
                expect(state.controlSections).toEqual([added]);
                expect(state.haveControlSectionsChanged).toBe(true);
                expect(state.controlOrder).toBeUndefined();
                expect(state.hasControlOrderChanged).toBe(false);
            });

            it('stores the bar order with it on the line of the section before, without a stored order', () => {
                const state = reducer(
                    seeded(),
                    actions.addControlSection({ section: added, barOrder }),
                );
                expect(state.controlSections.map((s) => s.id)).toEqual([
                    'a',
                    'b',
                    'c',
                ]);
                expect(state.controlSections.at(-1)).toEqual(added);
                expect(state.haveControlSectionsChanged).toBe(true);
                expect(state.controlOrder).toEqual([
                    ...barOrder,
                    { kind: SECTION, id: 'c' },
                ]);
                expect(state.hasControlOrderChanged).toBe(true);
            });

            it('keeps a stored order, which places it at the end', () => {
                const stored = [{ kind: SECTION, id: 'a' }];
                const withOrder = reducer(
                    seeded(),
                    actions.syncControlOrder(stored),
                );
                const state = reducer(
                    withOrder,
                    actions.addControlSection({ section: added, barOrder }),
                );
                expect(state.controlSections.at(-1)).toEqual(added);
                expect(state.controlOrder).toBe(stored);
                expect(state.hasControlOrderChanged).toBe(false);
            });
        });

        it('renames and removes a section, marking the change', () => {
            const seeded = reducer(
                initialDashboardEditState,
                actions.syncControlSections(sections),
            );
            const renamed = reducer(
                seeded,
                actions.renameControlSection({ id: 'a', name: 'When' }),
            );
            expect(renamed.controlSections.map((s) => s.name)).toEqual([
                'When',
                'Regions',
            ]);
            expect(renamed.haveControlSectionsChanged).toBe(true);
            const removed = reducer(renamed, actions.removeControlSection('b'));
            expect(removed.controlSections.map((s) => s.id)).toEqual(['a']);
        });

        it('sets a section to start collapsed, keeping it through a sync and a rename', () => {
            const seeded = reducer(
                initialDashboardEditState,
                actions.syncControlSections([
                    { ...sections[0], collapsed: true },
                    sections[1],
                ]),
            );
            expect(seeded.controlSections[0].collapsed).toBe(true);
            const renamed = reducer(
                seeded,
                actions.renameControlSection({ id: 'a', name: 'When' }),
            );
            expect(renamed.controlSections[0]).toEqual({
                id: 'a',
                name: 'When',
                collapsed: true,
            });
            const reset = reducer(
                initialDashboardEditState,
                actions.syncControlSections(sections),
            );
            const collapsed = reducer(
                reset,
                actions.setControlSectionCollapsed({
                    id: 'b',
                    collapsed: true,
                }),
            );
            expect(collapsed.controlSections).toEqual([
                sections[0],
                { ...sections[1], collapsed: true },
            ]);
            expect(collapsed.haveControlSectionsChanged).toBe(true);
            // Unticked, the key goes rather than turning false
            expect(
                reducer(
                    collapsed,
                    actions.setControlSectionCollapsed({
                        id: 'b',
                        collapsed: undefined,
                    }),
                ).controlSections[1],
            ).toEqual(sections[1]);
        });
    });
});

describe('tile layout undo and redo', () => {
    const editing = (tiles: Dashboard['tiles']) =>
        reducer(initialDashboardEditState, actions.setTiles(tiles));
    const move = (uuid: string, x: number) =>
        actions.moveTiles([{ uuid, x, y: 0, w: 6, h: 3 }]);
    const xs = (state: typeof initialDashboardEditState) =>
        state.tiles?.map((t) => t.x);

    it('undoes and redoes a move', () => {
        const moved = reducer(editing([tile('a'), tile('b', 6)]), move('a', 3));
        expect(xs(moved)).toEqual([3, 6]);

        const undone = reducer(moved, actions.undoTileLayout());
        expect(xs(undone)).toEqual([0, 6]);

        const redone = reducer(undone, actions.redoTileLayout());
        expect(xs(redone)).toEqual([3, 6]);
    });

    it('steps back through several moves in order', () => {
        const state = [move('a', 1), move('a', 2), move('a', 3)].reduce(
            reducer,
            editing([tile('a')]),
        );
        const once = reducer(state, actions.undoTileLayout());
        const twice = reducer(once, actions.undoTileLayout());
        expect([xs(once), xs(twice)]).toEqual([[2], [1]]);
    });

    it('drops the redo steps when a new move follows an undo', () => {
        const undone = reducer(
            reducer(editing([tile('a')]), move('a', 3)),
            actions.undoTileLayout(),
        );
        const movedAgain = reducer(undone, move('a', 5));
        expect(selectCanRedoTileLayout(storeWith(movedAgain))).toBe(false);
        expect(reducer(movedAgain, actions.redoTileLayout())).toBe(movedAgain);
    });

    it('records nothing when a drag ends where it started', () => {
        const state = reducer(editing([tile('a')]), move('a', 0));
        expect(selectCanUndoTileLayout(storeWith(state))).toBe(false);
        expect(state.haveTilesChanged).toBe(false);
    });

    it('has nothing to save once every move is undone', () => {
        const moved = reducer(editing([tile('a')]), move('a', 3));
        expect(moved.haveTilesChanged).toBe(true);
        const undone = reducer(moved, actions.undoTileLayout());
        expect(undone.haveTilesChanged).toBe(false);
        expect(reducer(undone, actions.redoTileLayout()).haveTilesChanged).toBe(
            true,
        );
    });

    it('still has tiles to save when another tile change came with the moves', () => {
        const edited = reducer(
            reducer(editing([tile('a')]), move('a', 3)),
            actions.setHaveTilesChanged(true),
        );
        expect(reducer(edited, actions.undoTileLayout()).haveTilesChanged).toBe(
            true,
        );
    });

    describe('with tabs', () => {
        const tabs = [
            { uuid: 't1', name: 'One', order: 0 },
            { uuid: 't2', name: 'Two', order: 1 },
        ];
        const onTab = (uuid: string, tabUuid: string, x = 0) => ({
            ...tile(uuid, x),
            tabUuid,
        });
        const editingTabs = (tiles: Dashboard['tiles']) =>
            [actions.setTabs(tabs), actions.setActiveTab(tabs[0])].reduce(
                reducer,
                editing(tiles),
            );

        it('leaves a tile that changed tab where it was put', () => {
            const moved = reducer(
                editingTabs([onTab('a', 't1'), onTab('b', 't1', 6)]),
                actions.moveTiles([
                    { uuid: 'a', x: 3, y: 0, w: 6, h: 3 },
                    { uuid: 'b', x: 9, y: 0, w: 6, h: 3 },
                ]),
            );
            const retabbed = reducer(
                moved,
                actions.setTiles(
                    moved.tiles?.map((t) =>
                        t.uuid === 'b' ? { ...t, x: 0, tabUuid: 't2' } : t,
                    ),
                ),
            );
            expect(xs(reducer(retabbed, actions.undoTileLayout()))).toEqual([
                0, 0,
            ]);
        });

        it('undoes only moves on the tab in view', () => {
            const moved = [move('a', 3), move('b', 9)].reduce(
                reducer,
                editingTabs([onTab('a', 't1'), onTab('b', 't2', 6)]),
            );
            const undone = reducer(moved, actions.undoTileLayout());
            expect(xs(undone)).toEqual([0, 9]);
            expect(selectCanUndoTileLayout(storeWith(undone))).toBe(false);

            const onOtherTab = reducer(undone, actions.setActiveTab(tabs[1]));
            expect(selectCanUndoTileLayout(storeWith(onOtherTab))).toBe(true);
            expect(xs(reducer(onOtherTab, actions.undoTileLayout()))).toEqual([
                0, 6,
            ]);
        });
    });

    it('keeps the tiles that did not move', () => {
        const before = editing([tile('a'), tile('b', 6)]);
        const undone = reducer(
            reducer(before, move('a', 3)),
            actions.undoTileLayout(),
        );
        expect(undone.tiles?.[1]).toBe(before.tiles?.[1]);
    });

    it('leaves tiles added since a step where they are', () => {
        const moved = reducer(editing([tile('a')]), move('a', 3));
        const withNewTile = reducer(
            moved,
            actions.setTiles([...(moved.tiles ?? []), tile('new', 9)]),
        );
        expect(xs(reducer(withNewTile, actions.undoTileLayout()))).toEqual([
            0, 9,
        ]);
    });

    it('skips steps that only moved tiles removed since', () => {
        const state = [move('a', 3), move('b', 9)].reduce(
            reducer,
            editing([tile('a'), tile('b', 6)]),
        );
        const withoutB = reducer(
            state,
            actions.setTiles(state.tiles?.filter((t) => t.uuid === 'a')),
        );
        expect(xs(reducer(withoutB, actions.undoTileLayout()))).toEqual([0]);
    });

    it('forgets the history once the draft is saved or discarded', () => {
        const cleared = reducer(
            reducer(editing([tile('a')]), move('a', 3)),
            actions.setHaveTilesChanged(false),
        );
        expect(selectCanUndoTileLayout(storeWith(cleared))).toBe(false);
    });
});
