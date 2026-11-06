import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import {
    AUTO_FIT_FOLD_SCALE_RANGE,
    AUTO_FIT_WHOLE_GRID_MIN_SCALE,
    canFitGridToScreen,
    DEFAULT_ROW_HEIGHT,
    FIT_TO_SCREEN_MIN_ROW_HEIGHT,
    getAutoFitToScreenSnap,
    getBreakpointForWidth,
    getFitToScreenRowHeight,
    getGridCleanCutRows,
    getGridHeight,
    getGridTotalRows,
    getViewModeActiveTabTiles,
    getDashboardLayouts,
    getMobileGridLayout,
    getResponsiveGridLayoutProps,
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
        const props = getResponsiveGridLayoutProps({ isEditMode: true });
        const editor = getDashboardLayouts(tiles, true, props.cols);
        expect(props.cols.xs).toBe(18);
        expect(editor.xs[0]).toMatchObject({
            x: 6,
            y: 5,
            w: 6,
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

    it('finds the folds no tile straddles, flush with the tiles above', () => {
        // row 6: a and b end together; row 9: c straddles 6..12 so no fold at 9
        const tiles = [
            chart('a', 0, 0, 6),
            chart('b', 12, 0, 6),
            chart('c', 0, 6, 6),
            chart('d', 12, 6, 3),
            chart('e', 12, 9, 3),
            // gap: rows 12 and 13 are empty, the fold stays at 12
            chart('f', 0, 14, 4),
        ];
        expect(getGridCleanCutRows(tiles)).toEqual([6, 12, 18]);
        expect(getGridCleanCutRows([])).toEqual([]);
    });

    describe('auto fit', () => {
        const scaleOf = (rowHeight: number) => rowHeight / DEFAULT_ROW_HEIGHT;

        it('fills the viewport with the whole grid when the squash is gentle', () => {
            const tiles = [chart('a', 0, 0, 10), chart('b', 0, 10, 10)];
            const natural = getGridHeight(20, DEFAULT_ROW_HEIGHT);
            const snap = getAutoFitToScreenSnap(natural * 0.8, tiles);
            expect(snap).toMatchObject({ rows: 20, isWholeGrid: true });
            expect(scaleOf(snap!.rowHeight)).toBeGreaterThanOrEqual(
                AUTO_FIT_WHOLE_GRID_MIN_SCALE,
            );
            expect(scaleOf(snap!.rowHeight)).toBeLessThan(1);
        });

        it('stretches a short grid to the viewport', () => {
            const tiles = [chart('a', 0, 0, 4)];
            const snap = getAutoFitToScreenSnap(1000, tiles);
            expect(snap).toMatchObject({ rows: 4, isWholeGrid: true });
            expect(snap!.rowHeight).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
        });

        it('snaps the nearest clean fold to the viewport instead of over-squashing', () => {
            // natural height 2 viewports: too long to squash whole
            const tiles = [
                chart('a', 0, 0, 10),
                chart('b', 12, 0, 10),
                chart('c', 0, 10, 10),
                chart('d', 0, 20, 10),
                chart('e', 0, 30, 10),
            ];
            const natural = getGridHeight(40, DEFAULT_ROW_HEIGHT);
            const viewport = natural / 2;
            expect(canFitGridToScreen(viewport, 40)).toBe(true);
            const snap = getAutoFitToScreenSnap(viewport, tiles);
            // rows 10, 20 and 30 are folds; 20 rows needs the least change
            expect(snap).toMatchObject({ rows: 20, isWholeGrid: false });
            expect(scaleOf(snap!.rowHeight)).toBeCloseTo(1, 1);
        });

        it('keeps the natural height when no fold is within the band', () => {
            // the only fold is the top row, which would need a huge stretch
            const tiles = [chart('a', 0, 0, 1), chart('b', 0, 1, 60)];
            expect(getAutoFitToScreenSnap(1000, tiles)).toBeNull();
            // squashing a straddled grid past the whole-grid floor isn't offered
            const straddled = [chart('a', 0, 0, 40), chart('b', 12, 0, 60)];
            expect(getAutoFitToScreenSnap(1000, straddled)).toBeNull();
            expect(getAutoFitToScreenSnap(1000, [])).toBeNull();
            expect(getAutoFitToScreenSnap(0, tiles)).toBeNull();
        });

        it('only nudges to a fold within the allowed band', () => {
            const tiles = [chart('a', 0, 0, 10), chart('b', 0, 10, 40)];
            const viewportFor = (scale: number) =>
                getGridHeight(10, DEFAULT_ROW_HEIGHT * scale) + 1;
            expect(
                getAutoFitToScreenSnap(
                    viewportFor(AUTO_FIT_FOLD_SCALE_RANGE.max * 0.98),
                    tiles,
                ),
            ).toMatchObject({ rows: 10, isWholeGrid: false });
            expect(
                getAutoFitToScreenSnap(
                    viewportFor(AUTO_FIT_FOLD_SCALE_RANGE.max * 1.05),
                    tiles,
                ),
            ).toBeNull();
            expect(
                getAutoFitToScreenSnap(
                    viewportFor(AUTO_FIT_FOLD_SCALE_RANGE.min * 0.95),
                    tiles,
                ),
            ).toBeNull();
        });
    });

    it('passes the row height to the grid', () => {
        expect(getResponsiveGridLayoutProps().rowHeight).toBe(
            DEFAULT_ROW_HEIGHT,
        );
        expect(getResponsiveGridLayoutProps({ rowHeight: 80 }).rowHeight).toBe(
            80,
        );
    });
});
