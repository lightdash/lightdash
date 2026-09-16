import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import {
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
