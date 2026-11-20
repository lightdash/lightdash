import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { afterEach, describe, expect, it } from 'vitest';
import { type CaptureMark, type CaptureTarget } from '../capture/types';
import {
    chartUuidsForMarks,
    dashboardScroll,
    MAX_CHART_CONTEXT,
    pickTileAt,
    targetAtPoint,
} from './tilePicker';

const chartTile = (uuid: string, tabUuid: string | null): DashboardTile =>
    ({
        uuid,
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        w: 12,
        h: 6,
        tabUuid,
        properties: {
            title: `Title of ${uuid}`,
            savedChartUuid: `chart-of-${uuid}`,
        },
    }) as DashboardTile;

const markdownTile = (uuid: string): DashboardTile =>
    ({
        uuid,
        type: DashboardTileTypes.MARKDOWN,
        x: 0,
        y: 0,
        w: 12,
        h: 6,
        tabUuid: null,
        properties: { title: 'Notes', content: 'Hello' },
    }) as DashboardTile;

// A tile on the page with something inside it, at a known place.
const addTile = (uuid: string, rect: DOMRect): HTMLElement => {
    const tile = document.createElement('div');
    tile.setAttribute('data-tile-uuid', uuid);
    tile.getBoundingClientRect = () => rect;
    const inner = document.createElement('span');
    tile.appendChild(inner);
    document.body.appendChild(tile);
    return inner;
};

// jsdom has no layout, so say what is under the pointer.
const under = (...elements: Element[]) => {
    document.elementsFromPoint = () => elements;
};

const tileTarget = (id: string): CaptureTarget => ({
    kind: 'tile',
    id,
    label: `Title of ${id}`,
    parentId: null,
});

const mark = (overrides: Partial<CaptureMark>): CaptureMark => ({
    number: 1,
    imageIndex: 0,
    startMs: 0,
    endMs: 100,
    strokes: [],
    shape: 'circle',
    tool: 'stylus',
    tabName: null,
    box: { x: 0, y: 0, width: 0.1, height: 0.1 },
    arrow: null,
    target: null,
    arrowTo: null,
    trail: [],
    covers: [],
    ...overrides,
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('pickTileAt', () => {
    it('picks the tile under the point with its bounds', () => {
        const rect = new DOMRect(10, 20, 300, 200);
        const inner = addTile('tile-1', rect);
        under(inner, document.body);

        expect(
            pickTileAt({ x: 50, y: 50 }, [chartTile('tile-1', 'tab-1')]),
        ).toEqual({ target: tileTarget('tile-1'), rect });
    });

    it('ignores tiles on other tabs', () => {
        const inner = addTile('tile-2', new DOMRect(0, 0, 100, 100));
        under(inner, document.body);

        // Only the active tab's tiles are offered.
        expect(
            pickTileAt({ x: 50, y: 50 }, [chartTile('tile-1', 'tab-1')]),
        ).toBeNull();
    });

    it('picks nothing on empty space', () => {
        addTile('tile-1', new DOMRect(0, 0, 100, 100));
        under(document.body);

        expect(
            pickTileAt({ x: 500, y: 500 }, [chartTile('tile-1', null)]),
        ).toBeNull();
    });
});

describe('targetAtPoint', () => {
    it('names the tile a mark is on', () => {
        const inner = addTile('tile-1', new DOMRect(0, 0, 100, 100));
        under(inner);

        expect(
            targetAtPoint({ x: 5, y: 5 }, [chartTile('tile-1', null)]),
        ).toEqual(tileTarget('tile-1'));
    });
});

describe('chartUuidsForMarks', () => {
    const tiles = [
        chartTile('tile-1', null),
        chartTile('tile-2', null),
        chartTile('tile-3', null),
        chartTile('tile-4', null),
        markdownTile('tile-5'),
    ];

    it('lists the charts that were picked, pointed at or circled', () => {
        expect(
            chartUuidsForMarks(
                [
                    mark({ shape: 'pick', target: tileTarget('tile-2') }),
                    mark({
                        shape: 'arrow',
                        target: tileTarget('tile-2'),
                        arrowTo: tileTarget('tile-1'),
                    }),
                    mark({
                        covers: [{ target: tileTarget('tile-3'), share: 1 }],
                    }),
                ],
                tiles,
            ),
        ).toEqual(['chart-of-tile-2', 'chart-of-tile-1', 'chart-of-tile-3']);
    });

    it('leaves out tiles that are not charts and stops at the cap', () => {
        const uuids = chartUuidsForMarks(
            ['tile-5', 'tile-1', 'tile-2', 'tile-3', 'tile-4'].map((id) =>
                mark({ target: tileTarget(id) }),
            ),
            tiles,
        );
        expect(uuids).toHaveLength(MAX_CHART_CONTEXT);
        expect(uuids[0]).toBe('chart-of-tile-1');
    });
});

describe('dashboardScroll', () => {
    it('reads the scroll of the container the tiles scroll in', () => {
        const scroller = document.createElement('div');
        scroller.style.overflowY = 'auto';
        Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
        Object.defineProperty(scroller, 'clientHeight', { value: 600 });
        scroller.scrollTop = 240;
        const grid = document.createElement('div');
        grid.className = 'react-grid-layout';
        scroller.appendChild(grid);
        document.body.appendChild(scroller);

        expect(dashboardScroll()).toEqual({ x: 0, y: 240 });
    });

    it('falls back to the window when nothing else scrolls', () => {
        expect(dashboardScroll()).toEqual({
            x: window.scrollX,
            y: window.scrollY,
        });
    });
});
