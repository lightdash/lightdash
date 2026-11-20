import { describe, expect, it } from 'vitest';
import { type CaptureMark } from '../capture/types';
import {
    buildRouteRequest,
    cellAtPoint,
    cellTarget,
    placeFromTarget,
    tileTarget,
} from './routeRequest';

const mark = (
    o: Partial<CaptureMark> & Pick<CaptureMark, 'number' | 'startMs' | 'endMs'>,
): CaptureMark => ({
    imageIndex: 0,
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
    ...o,
});

describe('cellAtPoint', () => {
    const grid = { left: 100, top: 200, width: 720 };

    it('converts a viewport point to a grid cell', () => {
        // 36 columns over 720px = 20px each; rows are 50px.
        expect(cellAtPoint({ x: 470, y: 460 }, grid, 36, 50)).toEqual({
            x: 18,
            y: 5,
        });
    });

    it('clamps points outside the grid', () => {
        expect(cellAtPoint({ x: 0, y: 0 }, grid, 36, 50)).toEqual({
            x: 0,
            y: 0,
        });
        expect(cellAtPoint({ x: 5000, y: 300 }, grid, 36, 50)).toEqual({
            x: 35,
            y: 2,
        });
    });
});

describe('placeFromTarget', () => {
    it('reads tiles, cells and unknowns', () => {
        expect(placeFromTarget(tileTarget('abc', 'Revenue'))).toEqual({
            tileUuid: 'abc',
            cell: null,
        });
        expect(placeFromTarget(cellTarget({ x: 18, y: 5 }))).toEqual({
            tileUuid: null,
            cell: { x: 18, y: 5 },
        });
        expect(placeFromTarget(null)).toEqual({ tileUuid: null, cell: null });
        expect(
            placeFromTarget({ kind: 'cell', id: 'nonsense', label: '' }),
        ).toEqual({ tileUuid: null, cell: null });
    });
});

describe('buildRouteRequest', () => {
    it('pairs each mark with its words and keeps loose speech apart', () => {
        const request = buildRouteRequest({
            dashboardName: 'Sales overview',
            gridColumns: 36,
            tiles: [{ uuid: 'rev', title: 'Revenue', x: 0, y: 0, w: 18, h: 6 }],
            marks: [
                mark({
                    number: 1,
                    startMs: 1000,
                    endMs: 2000,
                    shape: 'arrow',
                    arrow: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
                    target: tileTarget('rev', 'Revenue'),
                    arrowTo: cellTarget({ x: 18, y: 8 }),
                    trail: [
                        tileTarget('rev', 'Revenue'),
                        cellTarget({ x: 18, y: 8 }),
                    ],
                }),
                mark({
                    number: 2,
                    startMs: 6000,
                    endMs: 7000,
                    covers: [
                        { target: tileTarget('rev', 'Revenue'), share: 0.61 },
                        { target: cellTarget({ x: 18, y: 8 }), share: 0.3 },
                        { target: tileTarget('ord', 'Orders'), share: 0.04 },
                    ],
                }),
            ],
            images: ['abc'],
            transcript: [
                { atMs: 1200, text: 'move this' },
                { atMs: 1900, text: 'down here' },
                { atMs: 12000, text: 'thanks' },
            ],
        });
        expect(request).toEqual({
            dashboardName: 'Sales overview',
            gridColumns: 36,
            tiles: [{ uuid: 'rev', title: 'Revenue', x: 0, y: 0, w: 18, h: 6 }],
            marks: [
                {
                    number: 1,
                    image: 1,
                    shape: 'arrow',
                    at: { tileUuid: 'rev', cell: null },
                    arrowTo: { tileUuid: null, cell: { x: 18, y: 8 } },
                    path: [
                        { tileUuid: 'rev', cell: null },
                        { tileUuid: null, cell: { x: 18, y: 8 } },
                    ],
                    inside: [],
                    speech: 'move this down here',
                },
                {
                    number: 2,
                    image: 1,
                    shape: 'circle',
                    at: { tileUuid: null, cell: null },
                    arrowTo: null,
                    path: [],
                    inside: [
                        { tileUuid: 'rev', share: 61 },
                        { tileUuid: 'ord', share: 4 },
                    ],
                    speech: '',
                },
            ],
            looseSpeech: ['thanks'],
            images: ['abc'],
        });
    });
});
