import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import {
    AUTO_FIT_MAX_SCALE,
    AUTO_FIT_MIN_SCALE,
    canFitGridToScreen,
    convertLayoutToBaseCoordinates,
    DEFAULT_ROW_HEIGHT,
    FINE_GRID_SCALE,
    FIT_TO_SCREEN_MIN_ROW_HEIGHT,
    getAutoFitRowHeight,
    getBreakpointForWidth,
    getFitToScreenRowHeight,
    getGridHeight,
    getGridTotalRows,
    getViewModeActiveTabTiles,
    hasGridItemMoved,
    getDashboardLayouts,
    getMobileGridLayout,
    getResponsiveGridLayoutProps,
    getRowHeightForScale,
    GRID_MARGIN,
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
