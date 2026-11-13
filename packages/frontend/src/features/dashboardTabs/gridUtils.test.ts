import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { type Layout } from 'react-grid-layout';
import {
    dashboardEditActions as actions,
    initialDashboardEditState,
    dashboardEditReducer as reducer,
    type DashboardEditState,
} from '../dashboard/store/dashboardEditReducer';
import {
    AUTO_FIT_MAX_SCALE,
    AUTO_FIT_MIN_SCALE,
    canFitGridToScreen,
    closeTileGaps,
    tidyTiles,
    convertLayoutToBaseCoordinates,
    DEFAULT_ROW_HEIGHT,
    FINE_GRID_SCALE,
    FIT_TO_SCREEN_MIN_ROW_HEIGHT,
    getAutoFitRowHeight,
    getBreakpointForWidth,
    getFitToScreenRowHeight,
    getGridHeight,
    getLayoutToSaveAfterEdit,
    getGridTotalRows,
    getViewModeActiveTabTiles,
    hasGridItemMoved,
    resolveDropOverlaps,
    getRowInsertion,
    getGapFill,
    getAddTileSlot,
    getPointerCell,
    getPointerPosition,
    hasLayoutChanged,
    countResizedItems,
    getDashboardLayouts,
    getMobileGridLayout,
    getResponsiveGridLayoutProps,
    getRowHeightForScale,
    GRID_MARGIN,
    keepResizedTileCorner,
    matchesSavedLayout,
    settleLayoutAfterEdit,
} from './gridUtils';

const chart = (uuid: string, x: number, y: number, h = 6): DashboardTile => ({
    uuid,
    x,
    y,
    h,
    w: 12,
    tabUuid: null,
    type: DashboardTileTypes.SAVED_CHART,
    properties: { savedChartUuid: null },
});

describe('mobile dashboard layout', () => {
    it('reads rows left to right, stacks without overlaps, and leaves saved positions intact', () => {
        const tiles = [
            chart('last', 0, 10),
            chart('right', 12, 0),
            chart('left', 0, 0),
        ];
        const saved = structuredClone(tiles);
        const layout = getMobileGridLayout(tiles);
        expect(layout.map(({ i }) => i)).toEqual(['left', 'right', 'last']);
        expect(layout.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
            { x: 0, y: 0, w: 1, h: 5 },
            { x: 0, y: 5, w: 1, h: 5 },
            { x: 0, y: 10, w: 1, h: 5 },
        ]);
        expect(tiles).toEqual(saved);
        expect(
            layout.every(
                (item) =>
                    !item.isDraggable && !item.isResizable && item.minW === 1,
            ),
        ).toBe(true);
    });

    it('keeps headings compact and gives small charts readable height', () => {
        const heading: DashboardTile = {
            ...chart('heading', 0, 0, 1),
            type: DashboardTileTypes.HEADING,
            properties: { text: 'Revenue' },
        };
        expect(
            getMobileGridLayout([heading, chart('chart', 0, 1, 2)]).map(
                ({ h, y }) => ({ h, y }),
            ),
        ).toEqual([
            { h: 1, y: 0 },
            { h: 5, y: 1 },
        ]);
    });

    it('bounds chart heights on phones without changing saved sizes', () => {
        const tiles = [chart('small', 0, 0, 1), chart('large', 0, 2, 20)];
        expect(getMobileGridLayout(tiles).map(({ h }) => h)).toEqual([5, 8]);
        expect(getDashboardLayouts(tiles).lg.map(({ h }) => h)).toEqual([
            1, 20,
        ]);
    });

    it('uses a deterministic order for overlapping saved tiles', () => {
        const tiles = [chart('b', 0, 0), chart('a', 0, 0)];
        expect(getMobileGridLayout(tiles)).toEqual(
            getMobileGridLayout([...tiles].reverse()),
        );
    });

    it('preserves desktop coordinates and editing behavior at every breakpoint', () => {
        const tiles = [chart('chart', 12, 5, 9)];
        const viewer = getDashboardLayouts(tiles);
        expect(viewer.lg[0]).toMatchObject({ x: 12, y: 5, w: 12, h: 9 });
        expect(viewer.xs[0]).toMatchObject({
            x: 0,
            y: 0,
            w: 1,
            isDraggable: false,
        });
        const editor = getDashboardLayouts(tiles, true);
        expect(editor.xs[0]).toMatchObject({
            x: 12,
            y: 5,
            w: 12,
            h: 9,
            isDraggable: true,
            isResizable: true,
        });
    });
});

describe('breakpoint for a measured width', () => {
    const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 0 };

    it('matches react-grid-layout: largest breakpoint strictly narrower than the width', () => {
        expect(getBreakpointForWidth(breakpoints, 1400)).toBe('lg');
        expect(getBreakpointForWidth(breakpoints, 1200)).toBe('md');
        expect(getBreakpointForWidth(breakpoints, 1119)).toBe('md');
        expect(getBreakpointForWidth(breakpoints, 800)).toBe('sm');
        expect(getBreakpointForWidth(breakpoints, 300)).toBe('xs');
    });

    it('falls back to the smallest breakpoint when nothing is narrower', () => {
        expect(getBreakpointForWidth({ wide: 600, narrow: 300 }, 100)).toBe(
            'narrow',
        );
    });
});

describe('fit to screen', () => {
    it('counts rows down to the lowest tile bottom', () => {
        expect(getGridTotalRows([])).toBe(0);
        expect(
            getGridTotalRows([chart('a', 0, 0, 6), chart('b', 12, 3, 9)]),
        ).toBe(12);
    });

    it('fills the available height, keeping row proportions', () => {
        const rows = 12;
        const rowHeight = getFitToScreenRowHeight(1000, rows);
        const height = getGridHeight(rows, rowHeight);
        expect(height).toBeLessThanOrEqual(1000);
        expect(height).toBeGreaterThan(998);
        // a 6-row tile takes half the grid
        expect(getGridHeight(6, rowHeight)).toBeCloseTo((height - 10) / 2, 0);
    });

    it('clamps to the minimum row height', () => {
        expect(getFitToScreenRowHeight(100, 50)).toBe(
            FIT_TO_SCREEN_MIN_ROW_HEIGHT,
        );
    });

    it('falls back to the default row height without rows', () => {
        expect(getFitToScreenRowHeight(1000, 0)).toBe(DEFAULT_ROW_HEIGHT);
    });

    it('is only offered when the natural height is at most 2x the viewport', () => {
        const natural = getGridHeight(20, DEFAULT_ROW_HEIGHT);
        expect(canFitGridToScreen(natural / 2, 20)).toBe(true);
        expect(canFitGridToScreen(natural / 2 - 1, 20)).toBe(false);
        expect(canFitGridToScreen(1000, 0)).toBe(false);
        expect(canFitGridToScreen(0, 5)).toBe(false);
    });

    it('takes the active tab tiles, with stale tabs on the first tab', () => {
        const tab = (uuid: string, hidden = false) => ({
            uuid,
            name: uuid,
            order: 0,
            hidden,
        });
        const tiles = [
            { ...chart('a', 0, 0), tabUuid: 't1' },
            { ...chart('b', 0, 0), tabUuid: 't2' },
            { ...chart('c', 0, 0), tabUuid: 'gone' },
        ];
        const uuids = (result: DashboardTile[]) => result.map((t) => t.uuid);

        expect(
            uuids(
                getViewModeActiveTabTiles(tiles, [tab('t1'), tab('t2')], 't1'),
            ),
        ).toEqual(['a', 'c']);
        expect(
            uuids(
                getViewModeActiveTabTiles(tiles, [tab('t1'), tab('t2')], 't2'),
            ),
        ).toEqual(['b']);
        // one visible tab: single grid without the hidden tab's tiles
        expect(
            uuids(
                getViewModeActiveTabTiles(
                    tiles,
                    [tab('t1'), tab('t2', true)],
                    't1',
                ),
            ),
        ).toEqual(['a', 'c']);
    });

    describe('auto fit', () => {
        const scaleOf = (rowHeight: number) => rowHeight / DEFAULT_ROW_HEIGHT;
        const viewportFor = (rows: number, scale: number) =>
            getGridHeight(rows, DEFAULT_ROW_HEIGHT * scale) + 1;

        it('fills the viewport when the squash is gentle', () => {
            const rowHeight = getAutoFitRowHeight(viewportFor(20, 0.8), 20);
            expect(scaleOf(rowHeight!)).toBeCloseTo(0.8, 2);
            expect(getGridHeight(20, rowHeight!)).toBeLessThanOrEqual(
                viewportFor(20, 0.8),
            );
        });

        it('keeps the natural height below the squash floor', () => {
            expect(
                getAutoFitRowHeight(
                    viewportFor(20, AUTO_FIT_MIN_SCALE * 0.98),
                    20,
                ),
            ).toBeNull();
            expect(
                scaleOf(
                    getAutoFitRowHeight(
                        viewportFor(20, AUTO_FIT_MIN_SCALE * 1.02),
                        20,
                    )!,
                ),
            ).toBeCloseTo(AUTO_FIT_MIN_SCALE * 1.02, 2);
            expect(getAutoFitRowHeight(1000, 0)).toBeNull();
            expect(getAutoFitRowHeight(0, 5)).toBeNull();
        });

        it('stretches a short grid, up to the cap', () => {
            expect(
                scaleOf(getAutoFitRowHeight(viewportFor(4, 1.5), 4)!),
            ).toBeCloseTo(1.5, 2);
            expect(getAutoFitRowHeight(viewportFor(4, 3), 4)).toBe(
                DEFAULT_ROW_HEIGHT * AUTO_FIT_MAX_SCALE,
            );
        });
    });

    it('steps the grid by one row plus the gap below it', () => {
        expect(getResponsiveGridLayoutProps().rowHeight).toBe(
            DEFAULT_ROW_HEIGHT + GRID_MARGIN[1],
        );
        expect(getResponsiveGridLayoutProps({ rowHeight: 80 }).rowHeight).toBe(
            80 + GRID_MARGIN[1],
        );
    });
});

describe('fine edit grid', () => {
    const fineProps = getResponsiveGridLayoutProps({
        isEditMode: true,
        gridScale: FINE_GRID_SCALE,
    });

    it('draws every saved dashboard at the same size and place', () => {
        const rowHeight = getRowHeightForScale(FINE_GRID_SCALE);
        const pixelHeight = (rows: number, height: number) =>
            rows * height + (rows - 1) * GRID_MARGIN[1];
        const [fine] = getDashboardLayouts(
            [chart('a', 14, 3, 6)],
            true,
            FINE_GRID_SCALE,
        ).lg;
        expect(pixelHeight(fine.h, rowHeight)).toBe(
            pixelHeight(6, DEFAULT_ROW_HEIGHT),
        );
        expect(fine.x / fineProps.cols.lg).toBe(14 / 36);
    });

    it('saves untouched tiles exactly as they were', () => {
        const tiles = [chart('a', 14, 3, 6), chart('b', 21, 0, 2)];
        const layout = getDashboardLayouts(tiles, true, FINE_GRID_SCALE).lg;
        const saved = convertLayoutToBaseCoordinates(layout, FINE_GRID_SCALE);
        expect(saved.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(
            tiles.map(({ x, y, w, h }) => ({ x, y, w, h })),
        );
    });

    it('keeps a half-step move instead of rounding it away', () => {
        const [saved] = convertLayoutToBaseCoordinates(
            [{ i: 'a', x: 29, y: 7, w: 13, h: 9 }],
            FINE_GRID_SCALE,
        );
        expect(saved).toMatchObject({ x: 14.5, y: 3.5, w: 6.5, h: 4.5 });
    });
});

describe('a drag or resize that ends', () => {
    const item = { i: 'a', x: 4, y: 2, w: 12, h: 6 };

    it('moved nothing when the tile was only clicked', () => {
        expect(hasGridItemMoved(item, { ...item })).toBe(false);
    });

    it.each([{ x: 5 }, { y: 3 }, { w: 13 }, { h: 7 }])(
        'moved the tile when it ends at %o',
        (change) => {
            expect(hasGridItemMoved(item, { ...item, ...change })).toBe(true);
        },
    );
});

describe('dropping a tile that was dragged over others', () => {
    const item = (i: string, x: number, y: number, w = 12, h = 4) => ({
        i,
        x,
        y,
        w,
        h,
    });
    const position = (layout: ReturnType<typeof item>[], i: string) => {
        const { x, y } = layout.find((l) => l.i === i)!;
        return { x, y };
    };

    it('leaves every tile alone when the drop lands on free space', () => {
        const layout = [item('a', 0, 0), item('b', 12, 0), item('c', 0, 4)];
        expect(resolveDropOverlaps(layout, ['c'])).toEqual(layout);
    });

    it('keeps the dropped tile in place and moves the covered tile below it', () => {
        const layout = [item('a', 0, 0), item('dropped', 0, 2)];
        const result = resolveDropOverlaps(layout, ['dropped']);
        expect(position(result, 'dropped')).toEqual({ x: 0, y: 2 });
        expect(position(result, 'a')).toEqual({ x: 0, y: 6 });
    });

    it('puts a same-sized tile below when dropped exactly on top of it', () => {
        const layout = [item('a', 0, 0), item('dropped', 0, 0)];
        const result = resolveDropOverlaps(layout, ['dropped']);
        expect(position(result, 'dropped')).toEqual({ x: 0, y: 0 });
        expect(position(result, 'a')).toEqual({ x: 0, y: 4 });
    });

    it('moves tiles further down the column out of the way of a pushed tile', () => {
        const layout = [
            item('dropped', 0, 0),
            item('a', 0, 2),
            item('b', 0, 6),
            item('beside', 12, 0),
        ];
        const result = resolveDropOverlaps(layout, ['dropped']);
        expect(position(result, 'a')).toEqual({ x: 0, y: 4 });
        expect(position(result, 'b')).toEqual({ x: 0, y: 8 });
        expect(position(result, 'beside')).toEqual({ x: 12, y: 0 });
    });

    it('leaves no two tiles overlapping', () => {
        const layout = [
            item('a', 0, 0, 12, 6),
            item('b', 12, 0, 12, 6),
            item('c', 6, 6, 12, 4),
            item('dropped', 6, 3, 12, 4),
        ];
        const result = resolveDropOverlaps(layout, ['dropped']);
        const overlaps = result.flatMap((a, index) =>
            result
                .slice(index + 1)
                .filter(
                    (b) =>
                        a.x < b.x + b.w &&
                        a.x + a.w > b.x &&
                        a.y < b.y + b.h &&
                        a.y + a.h > b.y,
                ),
        );
        expect(overlaps).toEqual([]);
    });

    it('moves a covered tile to a whole stored row on the fine edit grid', () => {
        const layout = [item('a', 0, 0), item('dropped', 0, 3)];
        const result = resolveDropOverlaps(
            layout,
            ['dropped'],
            FINE_GRID_SCALE,
        );
        expect(position(result, 'dropped')).toEqual({ x: 0, y: 3 });
        expect(position(result, 'a')).toEqual({ x: 0, y: 8 });
    });
});

describe('dropping a tile beside another one', () => {
    const item = (i: string, x: number, y: number, w = 12, h = 4) => ({
        i,
        x,
        y,
        w,
        h,
        minW: 4,
    });
    const shape = (layout: { i: string }[], i: string) => {
        const { x, y, w, h } = layout.find((l) => l.i === i) as ReturnType<
            typeof item
        >;
        return { x, y, w, h };
    };
    const insert = (
        layout: ReturnType<typeof item>[],
        tileId: string,
        side: 'before' | 'after',
    ) =>
        getRowInsertion({
            layout,
            draggedId: 'dragged',
            target: { tileId, side },
            cols: 36,
        });

    it('splits a single-tile row in half', () => {
        const layout = [item('a', 0, 0, 36), item('dragged', 0, 10)];
        const result = insert(layout, 'a', 'after')!;
        expect(shape(result.layout, 'a')).toEqual({ x: 0, y: 0, w: 18, h: 4 });
        expect(result.slot).toMatchObject({ x: 18, y: 0, w: 18, h: 4 });
    });

    it('makes three equal tiles when dropped between two', () => {
        const layout = [
            item('a', 0, 0, 18),
            item('b', 18, 0, 18),
            item('dragged', 0, 10),
        ];
        const result = insert(layout, 'a', 'after')!;
        expect(shape(result.layout, 'a')).toMatchObject({ x: 0, w: 12 });
        expect(shape(result.layout, 'dragged')).toMatchObject({
            x: 12,
            y: 0,
            w: 12,
        });
        expect(shape(result.layout, 'b')).toMatchObject({ x: 24, w: 12 });
    });

    it('puts the tile first when dropped before the first tile', () => {
        const layout = [item('a', 0, 0, 36), item('dragged', 0, 10)];
        const result = insert(layout, 'a', 'before')!;
        expect(result.slot).toMatchObject({ x: 0, w: 18 });
        expect(shape(result.layout, 'a')).toMatchObject({ x: 18, w: 18 });
    });

    it('takes the height of the row it joins', () => {
        const layout = [item('a', 0, 0, 36, 7), item('dragged', 0, 10, 12, 3)];
        expect(insert(layout, 'a', 'after')!.slot.h).toBe(7);
    });

    it('reorders within a row without changing the shares', () => {
        const layout = [
            item('a', 0, 0),
            item('dragged', 12, 0),
            item('b', 24, 0),
        ];
        const result = insert(layout, 'b', 'after')!;
        expect(shape(result.layout, 'a')).toMatchObject({ x: 0, w: 12 });
        expect(shape(result.layout, 'b')).toMatchObject({ x: 12, w: 12 });
        expect(shape(result.layout, 'dragged')).toMatchObject({ x: 24, w: 12 });
    });

    it('gives leftover columns to the leftmost tiles', () => {
        const layout = [
            ...[0, 1, 2, 3].map((n) => item(`t${n}`, n * 9, 0, 9)),
            item('dragged', 0, 10),
        ];
        const result = insert(layout, 't3', 'after')!;
        const widths = ['t0', 't1', 't2', 't3', 'dragged'].map(
            (i) => shape(result.layout, i).w,
        );
        expect(widths).toEqual([8, 7, 7, 7, 7]);
    });

    it('leaves tiles on other lines alone', () => {
        const layout = [
            item('a', 0, 0, 36),
            item('below', 0, 4, 36),
            item('dragged', 0, 10),
        ];
        const result = insert(layout, 'a', 'after')!;
        expect(shape(result.layout, 'below')).toEqual({
            x: 0,
            y: 4,
            w: 36,
            h: 4,
        });
    });

    it('offers no slot when a tile from the row above reaches into the row', () => {
        const layout = [
            item('tall', 24, 0, 12, 8),
            item('a', 0, 4, 24),
            item('dragged', 0, 20),
        ];
        expect(insert(layout, 'a', 'after')).toBeNull();
    });

    it('offers no slot when the row is already as full as tiles allow', () => {
        const layout = [
            ...Array.from({ length: 9 }, (_, n) => item(`t${n}`, n * 4, 0, 4)),
            item('dragged', 0, 10),
        ];
        expect(insert(layout, 't0', 'before')).toBeNull();
    });
});

describe('dropping a tile on empty space', () => {
    const item = (i: string, x: number, y: number, w = 12, h = 4) => ({
        i,
        x,
        y,
        w,
        h,
        minW: 4,
        minH: 1,
    });
    const fill = (layout: ReturnType<typeof item>[], x: number, y: number) =>
        getGapFill({ layout, draggedId: 'dragged', cell: { x, y }, cols: 36 });

    it('fills a hole between two tiles in a row', () => {
        const layout = [
            item('a', 0, 0),
            item('b', 24, 0),
            item('below', 0, 4, 36),
            item('dragged', 0, 20, 30, 9),
        ];
        expect(fill(layout, 15, 2)!.slot).toMatchObject({
            x: 12,
            y: 0,
            w: 12,
            h: 4,
        });
    });

    it('fills the rest of the last row, as tall as the tiles beside it', () => {
        const layout = [item('a', 0, 0, 12, 6), item('dragged', 0, 20)];
        expect(fill(layout, 30, 3)!.slot).toMatchObject({
            x: 12,
            y: 0,
            w: 24,
            h: 6,
        });
    });

    it('stops at the tiles above and below the space', () => {
        const layout = [
            item('above', 0, 0, 36),
            item('below', 0, 10, 36),
            item('dragged', 0, 20),
        ];
        expect(fill(layout, 5, 7)!.slot).toMatchObject({
            x: 0,
            y: 4,
            w: 36,
            h: 6,
        });
    });

    it('offers nothing over the place the tile is leaving', () => {
        const layout = [item('a', 0, 0), item('dragged', 12, 0)];
        expect(fill(layout, 13, 1)).toBeNull();
    });

    it('counts the place the tile is leaving as part of a wider space', () => {
        const layout = [item('a', 0, 0), item('dragged', 12, 0)];
        expect(fill(layout, 30, 1)!.slot).toMatchObject({ x: 12, w: 24 });
    });

    it('moves no other tile', () => {
        const layout = [
            item('a', 0, 0),
            item('b', 24, 0),
            item('dragged', 0, 20),
        ];
        const result = fill(layout, 15, 2)!;
        expect(result.layout.filter((l) => l.i !== 'dragged')).toEqual(
            layout.filter((l) => l.i !== 'dragged'),
        );
    });

    it('offers nothing over another tile', () => {
        const layout = [item('a', 0, 0), item('dragged', 0, 20)];
        expect(fill(layout, 3, 2)).toBeNull();
    });

    it('offers nothing in open space with no tile beside or below it', () => {
        const layout = [item('a', 0, 0), item('dragged', 0, 20)];
        expect(fill(layout, 20, 9)).toBeNull();
    });

    it('offers nothing when the space is narrower than a tile can be', () => {
        const layout = [
            item('a', 0, 0, 17),
            item('b', 19, 0, 17),
            item('dragged', 0, 20),
        ];
        expect(fill(layout, 17, 1)).toBeNull();
    });
});

describe('reading where the pointer is', () => {
    it('reads a mouse event', () => {
        const event = new MouseEvent('mousemove', { clientX: 40, clientY: 70 });
        expect(getPointerPosition(event)).toMatchObject({
            clientX: 40,
            clientY: 70,
        });
    });

    it('reads the finger of a touch event, also once it has lifted', () => {
        const finger = { clientX: 40, clientY: 70 };
        const lifted = { changedTouches: [finger], touches: [] };
        expect(
            getPointerPosition(lifted as unknown as TouchEvent),
        ).toMatchObject(finger);
    });

    it('has no position for a touch event without a finger', () => {
        const empty = { changedTouches: [], touches: [] };
        expect(getPointerPosition(empty as unknown as TouchEvent)).toBeNull();
    });
});

describe('telling what a drop changed', () => {
    const item = (i: string, x: number, w = 12) => ({ i, x, y: 0, w, h: 4 });
    const before = [item('a', 0), item('b', 12), item('c', 24)];

    it('sees no change when every tile is where it was', () => {
        expect(
            hasLayoutChanged(
                before,
                before.map((l) => ({ ...l })),
            ),
        ).toBe(false);
    });

    it('sees a change when one tile moved', () => {
        const after = [item('a', 0), item('b', 24), item('c', 12)];
        expect(hasLayoutChanged(before, after)).toBe(true);
    });

    it('counts only the tiles whose size changed', () => {
        const after = [item('a', 0, 18), item('b', 18, 6), item('c', 24)];
        expect(countResizedItems(before, after)).toBe(2);
    });
});

describe('finding the grid cell under the pointer', () => {
    const tile = { i: 't', x: 12, y: 4, w: 12, h: 6 };
    const tileRect = { left: 300, top: 200, width: 240, height: 180 };
    const cellAt = (clientX: number, clientY: number) =>
        getPointerCell({ pointer: { clientX, clientY }, tile, tileRect });

    it('reads the cell inside the measuring tile', () => {
        expect(cellAt(300, 200)).toEqual({ x: 12, y: 4 });
        expect(cellAt(539, 379)).toEqual({ x: 23, y: 9 });
    });

    it('reads cells left of and above the measuring tile', () => {
        expect(cellAt(70, 50)).toEqual({ x: 0, y: -1 });
    });

    it('reads cells right of and below the measuring tile', () => {
        expect(cellAt(560, 410)).toEqual({ x: 25, y: 11 });
    });
});

describe('same grid at every window width', () => {
    const props = getResponsiveGridLayoutProps({ isEditMode: true });
    const row = [
        chart('a', 0, 0, 4),
        chart('b', 14, 0, 4),
        chart('c', 21, 0, 4),
        chart('d', 28, 0, 4),
    ].map((tile, index) => ({ ...tile, w: [14, 7, 7, 8][index] }));

    it('keeps a row of 14, 7, 7 and 8 wide tiles inside the grid on medium windows', () => {
        const medium = getDashboardLayouts(row, false).md;
        const ends = medium.map(({ x, w }) => x + w);
        expect(ends).toEqual([14, 21, 28, 36]);
        expect(Math.max(...ends)).toBeLessThanOrEqual(props.cols.md);
    });

    it('saves the width of a tile that was only made taller on a narrow window', () => {
        const narrow = getDashboardLayouts(
            [{ ...chart('a', 0, 0, 4), w: 7 }],
            true,
        ).sm;
        const [saved] = convertLayoutToBaseCoordinates([
            { ...narrow[0], h: narrow[0].h + 1 },
        ]);
        expect(saved).toMatchObject({ w: 7, h: 5 });
    });

    it('lets a narrow window resize a tile down to 4 columns, as a wide one does', () => {
        const layouts = getDashboardLayouts([chart('a', 0, 0)], true);
        expect(layouts.sm[0].minW).toBe(layouts.lg[0].minW);
        expect(layouts.lg[0].minW).toBe(4);
    });

    it('draws tiles on the same pixels as a grid with a 10px margin', () => {
        const width = 1280;
        const pad = 10;
        const legacyColumn = (width - 2 * pad - 35 * GRID_MARGIN[0]) / 36;
        const legacyLeft = (x: number) =>
            pad + x * (legacyColumn + GRID_MARGIN[0]);
        const legacyWidth = (w: number) =>
            w * legacyColumn + (w - 1) * GRID_MARGIN[0];

        const [padX] = props.containerPadding;
        const column = (width - 2 * padX) / props.cols.lg;
        const gutter = GRID_MARGIN[0] / 2;
        const visibleLeft = (x: number) => padX + x * column + gutter;
        const visibleWidth = (w: number) => w * column - 2 * gutter;

        expect(visibleLeft(14)).toBeCloseTo(legacyLeft(14), 9);
        expect(visibleWidth(7)).toBeCloseTo(legacyWidth(7), 9);
    });
});

describe('saving after a drag or resize', () => {
    it('can rely on one column count, because every editable width uses the same one', () => {
        [1, FINE_GRID_SCALE].forEach((gridScale) => {
            const { cols } = getResponsiveGridLayoutProps({
                isEditMode: true,
                gridScale,
            });
            expect(new Set([cols.lg, cols.md, cols.sm, cols.xs])).toEqual(
                new Set([36 * gridScale]),
            );
        });
    });
});

describe('tiles after a drag or resize', () => {
    type Rect = { x: number; y: number; w: number; h: number };
    const START: Record<string, Rect> = {
        A: { x: 0, y: 0, w: 18, h: 6 },
        B: { x: 18, y: 0, w: 18, h: 6 },
        C: { x: 0, y: 6, w: 18, h: 6 },
        D: { x: 18, y: 6, w: 18, h: 6 },
        E: { x: 0, y: 14, w: 36, h: 6 },
        M: { x: 0, y: 20, w: 36, h: 3 },
    };

    const toLayout = (rects: Record<string, Rect>): Layout[] =>
        Object.entries(rects).map(([i, rect]) => ({ i, ...rect }));

    const positions = (layout: Layout[]): Record<string, Rect> =>
        Object.fromEntries(
            layout.map(({ i, x, y, w, h }) => [i, { x, y, w, h }]),
        );

    const createSession = (initial: Record<string, Rect>) => {
        let saved = { ...initial };
        const home = new Map(
            Object.entries(initial).map(([i, rect]) => [i, rect.y]),
        );
        return {
            drop: (gridLayout: Record<string, Rect>, editedTileId: string) => {
                const settled = settleLayoutAfterEdit({
                    layout: toLayout(gridLayout),
                    editedTileId,
                    previous: new Map(
                        Object.entries(saved).map(([i, rect]) => [
                            i,
                            { i, ...rect },
                        ]),
                    ),
                    home,
                });
                saved = positions(settled);
                home.set(editedTileId, saved[editedTileId].y);
                return saved;
            },
            addTile: (i: string, rect: Rect) => {
                saved = { ...saved, [i]: rect };
                home.set(i, rect.y);
                return saved;
            },
            get saved() {
                return saved;
            },
        };
    };

    const overlapping = (rects: Record<string, Rect>) =>
        Object.entries(rects).flatMap(([a, ra]) =>
            Object.entries(rects)
                .filter(
                    ([b, rb]) =>
                        a < b &&
                        ra.x < rb.x + rb.w &&
                        rb.x < ra.x + ra.w &&
                        ra.y < rb.y + rb.h &&
                        rb.y < ra.y + ra.h,
                )
                .map(([b]) => `${a}/${b}`),
        );

    const hasWholeRows = (rects: Record<string, Rect>) =>
        Object.values(rects).every(
            ({ y, h }) => Number.isInteger(y) && Number.isInteger(h),
        );

    it('resizing a tile taller moves the tile below just enough and keeps the gap above E', () => {
        const session = createSession(START);
        const saved = session.drop(
            { ...START, A: { ...START.A, h: 8 }, C: { ...START.C, y: 8 } },
            'A',
        );
        expect(saved.A.h).toBe(8);
        expect(saved.C.y).toBe(8);
        expect(saved.E.y).toBe(14);
        expect(saved.M.y).toBe(20);
    });

    it('dragging a tile down and back brings the pushed tiles back to their rows', () => {
        const session = createSession(START);
        session.drop(
            {
                ...START,
                A: { ...START.A, y: 3 },
                C: { ...START.C, y: 9 },
                E: { ...START.E, y: 15 },
                M: { ...START.M, y: 21 },
            },
            'A',
        );
        expect(session.saved.E.y).toBe(15);
        const saved = session.drop(
            {
                ...session.saved,
                A: { ...START.A, y: 0 },
            },
            'A',
        );
        expect(saved).toEqual(START);
    });

    it('repeated drag rounds do not ratchet untouched tiles down', () => {
        const session = createSession(START);
        for (let round = 0; round < 3; round += 1) {
            session.drop(
                {
                    ...session.saved,
                    A: { ...START.A, y: 1 },
                    C: { ...START.C, y: 7 },
                },
                'A',
            );
            session.drop(
                {
                    ...session.saved,
                    A: { ...START.A, y: 0 },
                    C: { ...START.C, y: 7 },
                },
                'A',
            );
            expect(session.saved).toEqual(START);
        }
    });

    it('dragging a tile up over others never saves an overlap or a half row on tiles the user did not place', () => {
        const session = createSession(START);
        const saved = session.drop(
            {
                ...START,
                E: { ...START.E, y: 10 },
                C: { ...START.C, y: 9.5 },
                D: { ...START.D, y: 9.5 },
                M: { ...START.M, y: 21 },
            },
            'E',
        );
        expect(overlapping(saved)).toEqual([]);
        expect(hasWholeRows(saved)).toBe(true);
        expect(saved.E.y).toBe(10);
        expect(saved.C.y).toBe(16);
        expect(saved.D.y).toBe(16);
        expect(saved.M.y).toBe(22);
        expect(saved.A).toEqual(START.A);
        expect(saved.B).toEqual(START.B);
    });

    it('a later small drag does not move tiles that the user did not touch', () => {
        const session = createSession(START);
        session.drop(
            {
                ...START,
                E: { ...START.E, y: 10 },
                C: { ...START.C, y: 9.5 },
                D: { ...START.D, y: 9.5 },
                M: { ...START.M, y: 21 },
            },
            'E',
        );
        const afterDrop = session.saved;
        const saved = session.drop(
            {
                ...afterDrop,
                A: { ...START.A, y: 0 },
                E: { ...afterDrop.E, y: 15.5 },
                M: { ...afterDrop.M, y: 21.5 },
            },
            'A',
        );
        expect(saved).toEqual(afterDrop);
    });

    it('a drag after adding a tile keeps the new tile and the gaps', () => {
        const session = createSession(START);
        session.addTile('N', { x: 0, y: 23, w: 15, h: 9 });
        expect(overlapping(session.saved)).toEqual([]);
        const saved = session.drop(
            {
                ...session.saved,
                B: { ...START.B, h: 7 },
                D: { ...START.D, y: 7 },
            },
            'B',
        );
        expect(saved.N).toEqual({ x: 0, y: 23, w: 15, h: 9 });
        expect(saved.D.y).toBe(7);
        expect(saved.E.y).toBe(14);
    });

    it('the edited tile keeps the position the user gave it', () => {
        expect(
            settleLayoutAfterEdit({
                layout: [{ i: 'X', x: 0, y: 3, w: 4, h: 2 }],
                editedTileId: 'X',
                previous: new Map([['X', { i: 'X', x: 0, y: 0, w: 4, h: 2 }]]),
                home: new Map([['X', 0]]),
            }),
        ).toEqual([{ i: 'X', x: 0, y: 3, w: 4, h: 2 }]);
    });

    it('a saved layout reloads to the same positions and a no-op drop keeps them', () => {
        const session = createSession(START);
        session.drop(
            { ...START, A: { ...START.A, h: 8 }, C: { ...START.C, y: 8 } },
            'A',
        );
        const reloaded = createSession(session.saved);
        expect(reloaded.drop(reloaded.saved, 'C')).toEqual(session.saved);
    });

    it('keeps the swap the grid showed when a tile is dragged down past another', () => {
        const session = createSession(START);
        const saved = session.drop(
            {
                ...START,
                A: { ...START.A, y: 7 },
                C: { ...START.C, y: 1 },
                E: { ...START.E, y: 17 },
                M: { ...START.M, y: 23 },
            },
            'A',
        );
        expect(saved.A.y).toBe(7);
        expect(saved.C.y).toBe(1);
        expect(saved.E.y).toBe(14);
        expect(saved.M.y).toBe(20);
        expect(overlapping(saved)).toEqual([]);
    });

    it('a resized tile keeps its top-left corner when the grid pushed it', () => {
        const before = { i: 'C', ...START.C };
        const gridLayout = toLayout({
            ...START,
            C: { ...START.C, y: 12, h: 9 },
        });
        const layout = keepResizedTileCorner(gridLayout, before);
        expect(layout.find((item) => item.i === 'C')).toEqual({
            i: 'C',
            x: 0,
            y: 6,
            w: 18,
            h: 9,
        });
        const session = createSession(START);
        const saved = session.drop(positions(layout), 'C');
        expect(saved.C).toEqual({ x: 0, y: 6, w: 18, h: 9 });
        expect(saved.E.y).toBe(15);
        expect(overlapping(saved)).toEqual([]);
    });

    it('keeps the fine-grid position of the tile the user placed and puts pushed tiles on whole rows', () => {
        const session = createSession(START);
        const saved = session.drop(
            { ...START, B: { ...START.B, y: 0.5 }, D: { ...START.D, y: 6.5 } },
            'B',
        );
        expect(saved.B.y).toBe(0.5);
        expect(saved.D.y).toBe(7);
        expect(overlapping(saved)).toEqual([]);
    });

    it('step ii: a tile dropped at a half row pushes the tiles below it to whole rows', () => {
        const session = createSession(START);
        const saved = session.drop(
            {
                ...START,
                A: { ...START.A, y: 4.5 },
                C: { ...START.C, y: 10.5 },
                E: { ...START.E, y: 16.5 },
                M: { ...START.M, y: 22.5 },
            },
            'A',
        );
        expect(saved.A.y).toBe(4.5);
        expect(saved.C.y).toBe(11);
        expect(saved.E.y).toBe(17);
        expect(saved.M.y).toBe(23);
        expect(saved.B).toEqual(START.B);
        expect(saved.D).toEqual(START.D);
        const { A: _placed, ...untouched } = saved;
        expect(hasWholeRows(untouched)).toBe(true);
        expect(overlapping(saved)).toEqual([]);
    });

    it('a tile swapped above a tile dropped at a half row lands on a whole row', () => {
        const session = createSession(START);
        const saved = session.drop(
            {
                ...START,
                A: { ...START.A, y: 7.5 },
                C: { ...START.C, y: 1.5 },
            },
            'A',
        );
        expect(saved.C.y).toBe(1);
        expect(saved.E.y).toBe(14);
        expect(overlapping(saved)).toEqual([]);
    });

    describe('on the dashboard store', () => {
        const scaled = (rects: Record<string, Rect>): Layout[] =>
            toLayout(rects).map((item) => ({
                ...item,
                x: item.x * FINE_GRID_SCALE,
                y: item.y * FINE_GRID_SCALE,
                w: item.w * FINE_GRID_SCALE,
                h: item.h * FINE_GRID_SCALE,
            }));

        const editing = (rects: Record<string, Rect>) =>
            reducer(
                initialDashboardEditState,
                actions.setTiles(
                    Object.entries(rects).map(([i, { x, y, w, h }]) => ({
                        ...chart(i, x, y, h),
                        w,
                    })),
                ),
            );

        const placements = (state: DashboardEditState) =>
            Object.fromEntries(
                (state.tiles ?? []).map(({ uuid, x, y, w, h }) => [
                    uuid,
                    { x, y, w, h },
                ]),
            );

        const savedRects = (state: DashboardEditState) =>
            new Map(
                Object.entries(placements(state)).map(([i, rect]) => [
                    i,
                    { i, ...rect },
                ]),
            );

        const drop = (
            state: DashboardEditState,
            drawn: Record<string, Rect>,
            tileId: string,
        ) => {
            const [before] = scaled({ [tileId]: placements(state)[tileId] });
            const [after] = scaled({ [tileId]: drawn[tileId] });
            const layout = getLayoutToSaveAfterEdit({
                layout: scaled(drawn),
                before,
                after,
                gridScale: FINE_GRID_SCALE,
                previous: savedRects(state),
                home: new Map(
                    Object.entries(START).map(([i, rect]) => [i, rect.y]),
                ),
            });
            return layout
                ? reducer(
                      state,
                      actions.moveTiles(
                          layout.map(({ i, x, y, w, h }) => ({
                              uuid: i,
                              x,
                              y,
                              w,
                              h,
                          })),
                      ),
                  )
                : state;
        };

        it('saves a drag that pushes several tiles as one undo step, and undo puts every tile back', () => {
            const start = editing(START);
            const moved = drop(
                start,
                {
                    ...START,
                    A: { ...START.A, y: 3 },
                    C: { ...START.C, y: 9 },
                    E: { ...START.E, y: 15 },
                    M: { ...START.M, y: 21 },
                },
                'A',
            );
            expect(placements(moved)).toMatchObject({
                A: { y: 3 },
                C: { y: 9 },
                E: { y: 15 },
                M: { y: 21 },
            });
            expect(moved.tileLayoutHistory.past).toHaveLength(1);
            expect(
                placements(reducer(moved, actions.undoTileLayout())),
            ).toEqual(START);
        });

        it('a drop that moves nothing adds no undo step, while the grid still shows the tile it pushed', () => {
            const start = editing(START);
            const drawn = { ...START, C: { ...START.C, y: 9 } };
            expect(drop(start, drawn, 'A')).toBe(start);
            expect(
                matchesSavedLayout(
                    convertLayoutToBaseCoordinates(
                        scaled(drawn),
                        FINE_GRID_SCALE,
                    ),
                    savedRects(start),
                ),
            ).toBe(false);
            const savedLayout = Object.entries(START).map(([uuid, rect]) => ({
                uuid,
                ...rect,
            }));
            expect(reducer(start, actions.moveTiles(savedLayout))).toBe(start);
            expect(start.tileLayoutHistory.past).toHaveLength(0);
        });

        it('puts pushed and pulled-up tiles on whole rows', () => {
            const pushed = drop(
                editing(START),
                {
                    ...START,
                    A: { ...START.A, y: 4.5 },
                    C: { ...START.C, y: 10.5 },
                    E: { ...START.E, y: 16.5 },
                    M: { ...START.M, y: 22.5 },
                },
                'A',
            );
            expect(placements(pushed)).toMatchObject({
                A: { y: 4.5 },
                C: { y: 11 },
                E: { y: 17 },
                M: { y: 23 },
            });
            const pulledUp = drop(
                pushed,
                { ...placements(pushed), A: { ...START.A, y: 0.5 } },
                'A',
            );
            expect(placements(pulledUp)).toMatchObject({
                A: { y: 0.5 },
                C: { y: 7 },
                E: { y: 14 },
                M: { y: 20 },
            });
            const { A: _placed, ...others } = placements(pulledUp);
            expect(hasWholeRows(others)).toBe(true);
            expect(pulledUp.tileLayoutHistory.past).toHaveLength(2);
        });

        it('a resize keeps the top-left corner of the tile when the grid pushed it', () => {
            const resized = drop(
                editing(START),
                { ...START, C: { ...START.C, y: 12, h: 9 } },
                'C',
            );
            expect(placements(resized)).toMatchObject({
                C: { x: 0, y: 6, w: 18, h: 9 },
                E: { y: 15 },
            });
        });
    });
});

describe('closing the gaps between tiles', () => {
    const at = (uuid: string, x: number, y: number, w = 12, h = 6) => ({
        uuid,
        x,
        y,
        w,
        h,
    });
    const ys = (tiles: ReturnType<typeof at>[]) =>
        Object.fromEntries(tiles.map((tile) => [tile.uuid, tile.y]));

    it('pulls tiles up to the top and onto the tile above', () => {
        const tidy = closeTileGaps([at('a', 0, 3), at('b', 0, 20)]);
        expect(ys(tidy)).toEqual({ a: 0, b: 6 });
    });

    it('leaves a tile under a taller neighbour only as low as its own column needs', () => {
        const tidy = closeTileGaps([
            at('tall', 0, 0, 12, 10),
            at('short', 12, 0, 12, 4),
            at('under-short', 12, 12, 12, 4),
        ]);
        expect(ys(tidy)).toEqual({ tall: 0, short: 0, 'under-short': 4 });
    });

    it('stops a wide tile at the lowest tile it spans', () => {
        const tidy = closeTileGaps([
            at('left', 0, 0, 12, 10),
            at('right', 12, 0, 12, 4),
            at('wide', 0, 30, 24, 4),
        ]);
        expect(ys(tidy).wide).toBe(10);
    });

    it('keeps columns, sizes and half-step positions', () => {
        const tidy = closeTileGaps([
            at('a', 2.5, 4, 7.5, 3.5),
            at('b', 2.5, 9),
        ]);
        expect(tidy).toEqual([at('a', 2.5, 0, 7.5, 3.5), at('b', 2.5, 3.5)]);
    });

    it('changes nothing in a layout without gaps', () => {
        const packed = [at('a', 0, 0), at('b', 12, 0), at('c', 0, 6)];
        expect(closeTileGaps(packed)).toEqual(packed);
    });
});

describe('tidying tiles', () => {
    const at = (uuid: string, x: number, y: number, w: number, h = 6) => ({
        uuid,
        x,
        y,
        w,
        h,
    });

    it('widens a row with spare room to the full grid, keeping proportions', () => {
        expect(tidyTiles([at('a', 0, 0, 8), at('b', 8, 0, 16)])).toEqual([
            at('a', 0, 0, 12),
            at('b', 12, 0, 24),
        ]);
    });

    it('closes a hole in the middle of a row', () => {
        expect(tidyTiles([at('a', 0, 0, 12), at('b', 24, 0, 12)])).toEqual([
            at('a', 0, 0, 18),
            at('b', 18, 0, 18),
        ]);
    });

    it('gives every tile in a row the height of the tallest', () => {
        expect(
            tidyTiles([at('kpi', 0, 0, 12, 3), at('chart', 12, 0, 24, 8)]),
        ).toEqual([at('kpi', 0, 0, 12, 8), at('chart', 12, 0, 24, 8)]);
    });

    it('stacks rows with no space between them', () => {
        expect(
            tidyTiles([
                at('short', 0, 2, 18, 3),
                at('tall', 18, 2, 18, 8),
                at('below', 0, 20, 36, 4),
            ]),
        ).toEqual([
            at('short', 0, 0, 18, 8),
            at('tall', 18, 0, 18, 8),
            at('below', 0, 8, 36, 4),
        ]);
    });

    it('counts tiles whose tops are slightly off as one row', () => {
        expect(
            tidyTiles([
                at('a', 0, 0, 12),
                at('b', 12, 1, 12),
                at('c', 24, 0.5, 12),
            ]),
        ).toEqual([at('a', 0, 0, 12), at('b', 12, 0, 12), at('c', 24, 0, 12)]);
    });

    it('keeps tiles stacked beside a taller tile in its row', () => {
        expect(
            tidyTiles([
                at('tall', 0, 0, 12, 12),
                at('top', 12, 0, 12),
                at('bottom', 12, 6, 6),
            ]),
        ).toEqual([
            at('tall', 0, 0, 18, 12),
            at('top', 18, 0, 18),
            at('bottom', 18, 6, 18),
        ]);
    });

    it('stretches a short stack to the row height in its proportions', () => {
        expect(
            tidyTiles([
                at('kpi1', 0, 0, 8, 2),
                at('kpi2', 0, 2, 8, 2),
                at('kpi3', 0, 4, 8, 2),
                at('chart', 8, 0, 16, 12),
                at('map', 24, 0, 12, 10),
            ]),
        ).toEqual([
            at('kpi1', 0, 0, 8, 4),
            at('kpi2', 0, 4, 8, 4),
            at('kpi3', 0, 8, 8, 4),
            at('chart', 8, 0, 16, 12),
            at('map', 24, 0, 12, 12),
        ]);
    });

    it('moves a tile under a row of equal heights into the next row', () => {
        expect(
            tidyTiles([
                at('a', 0, 0, 18),
                at('b', 18, 0, 18),
                at('under', 0, 6, 12),
            ]),
        ).toEqual([
            at('a', 0, 0, 18),
            at('b', 18, 0, 18),
            at('under', 0, 6, 36),
        ]);
    });

    it('moves a tile that mostly hangs below the row into the next row', () => {
        expect(
            tidyTiles([
                at('tall', 0, 0, 18, 8),
                at('top', 18, 0, 18, 6),
                at('long', 18, 6, 18, 20),
            ]),
        ).toEqual([
            at('tall', 0, 0, 18, 8),
            at('top', 18, 0, 18, 8),
            at('long', 0, 8, 36, 20),
        ]);
    });

    it('keeps a row of tiles over a wide tile beside a taller tile', () => {
        const tidy = [
            at('text', 0, 0, 9, 10),
            at('kpi1', 9, 0, 9, 4),
            at('kpi2', 18, 0, 9, 4),
            at('kpi3', 27, 0, 9, 4),
            at('table', 9, 4, 27, 6),
        ];
        expect(tidyTiles(tidy)).toEqual(tidy);
    });

    it('stretches nested rows to fill the height beside a taller tile', () => {
        expect(
            tidyTiles([
                at('text', 0, 0, 9, 10),
                at('kpi1', 9, 0, 9, 4),
                at('kpi2', 18, 0, 9, 3),
                at('table', 9, 4, 18, 4),
            ]),
        ).toEqual([
            at('text', 0, 0, 12, 10),
            at('kpi1', 12, 0, 12, 5),
            at('kpi2', 24, 0, 12, 5),
            at('table', 12, 5, 24, 5),
        ]);
    });

    it('falls back to plain rows when tiles interlock', () => {
        expect(
            tidyTiles([
                at('a', 0, 0, 24, 6),
                at('b', 24, 0, 12, 12),
                at('c', 0, 6, 12, 12),
                at('e', 12, 6, 12, 6),
                at('d', 12, 12, 24, 6),
            ]),
        ).toEqual([
            at('a', 0, 0, 24, 12),
            at('b', 24, 0, 12, 12),
            at('c', 0, 12, 18, 12),
            at('e', 18, 12, 18, 12),
            at('d', 0, 24, 36, 6),
        ]);
    });

    it('leaves a tidy layout with a stack as it is', () => {
        const tidy = [
            at('kpi1', 0, 0, 12, 4),
            at('kpi2', 0, 4, 12, 4),
            at('chart', 12, 0, 24, 8),
        ];
        expect(tidyTiles(tidy)).toEqual(tidy);
    });

    it('lands uneven splits on half steps that still span the grid', () => {
        expect(
            tidyTiles([at('a', 0, 0, 5), at('b', 5, 0, 5), at('c', 10, 0, 4)]),
        ).toEqual([
            at('a', 0, 0, 13),
            at('b', 13, 0, 12.5),
            at('c', 25.5, 0, 10.5),
        ]);
    });

    it('leaves a tidy layout as it is', () => {
        const tidy = [at('a', 0, 0, 12), at('b', 12, 0, 24), at('c', 0, 6, 36)];
        expect(tidyTiles(tidy)).toEqual(tidy);
    });

    it('closes gaps first, so tiles pulled level share a row', () => {
        expect(tidyTiles([at('a', 0, 4, 12), at('b', 12, 30, 12)])).toEqual([
            at('a', 0, 0, 18),
            at('b', 18, 0, 18),
        ]);
    });
});

describe('add tile slot', () => {
    const tile = (x: number, y: number, w: number, h: number) => ({
        x,
        y,
        w,
        h,
    });
    const defaultSize = { w: 15, h: 9 };
    const slotAt = (items: ReturnType<typeof tile>[], x: number, y: number) =>
        getAddTileSlot({
            items,
            cell: { x, y },
            cols: 36,
            minWidth: 4,
            defaultSize,
        });

    it('takes the space left in the last row, as tall as the tiles beside it', () => {
        const items = [tile(0, 0, 36, 4), tile(0, 4, 18, 9)];
        expect(slotAt(items, 30, 8)).toEqual({ x: 18, y: 4, w: 18, h: 9 });
    });

    it('offers the last row gap when the pointer is under the last row', () => {
        const items = [tile(0, 0, 36, 4), tile(0, 4, 18, 9)];
        expect(slotAt(items, 2, 20)).toEqual({ x: 18, y: 4, w: 18, h: 9 });
    });

    it('offers the widest gap when the last row has more than one', () => {
        const items = [tile(6, 0, 10, 6)];
        expect(slotAt(items, 0, 12)).toEqual({ x: 16, y: 0, w: 20, h: 6 });
    });

    it('lands a default tile under a full last row, centred on the pointer and kept on the grid', () => {
        const items = [tile(0, 0, 18, 9), tile(18, 0, 18, 9)];
        expect(slotAt(items, 20, 12)).toEqual({ x: 13, y: 9, w: 15, h: 9 });
        expect(slotAt(items, 2, 12)).toEqual({ x: 0, y: 9, w: 15, h: 9 });
        expect(slotAt(items, 35, 12)).toEqual({ x: 21, y: 9, w: 15, h: 9 });
    });

    it('skips a last row gap too narrow for a tile', () => {
        const items = [tile(0, 0, 34, 9)];
        expect(slotAt(items, 35, 3)).toBeNull();
        expect(slotAt(items, 35, 12)).toEqual({ x: 21, y: 9, w: 15, h: 9 });
    });

    it('leaves gaps above the last row alone', () => {
        const items = [tile(0, 0, 12, 4), tile(0, 4, 36, 6)];
        expect(slotAt(items, 20, 2)).toBeNull();
    });

    it('offers nothing over a tile or on an empty canvas', () => {
        expect(slotAt([tile(0, 0, 18, 9)], 3, 3)).toBeNull();
        expect(slotAt([], 3, 3)).toBeNull();
    });
});
