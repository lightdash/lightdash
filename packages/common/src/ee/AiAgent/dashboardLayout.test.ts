import { describe, expect, it } from 'vitest';
import { isValidDashboardTilePositions } from '../../utils/dashboardTilePositions';
import {
    AI_DASHBOARD_LAYOUT_TEMPLATES,
    buildAiDashboardLayout,
    getAiDashboardLayoutRows,
} from './dashboardLayout';

const summary = { summary: true, detailed: false };
const chart = { summary: false, detailed: false };
const detail = { summary: false, detailed: true };

describe('dashboard layout templates', () => {
    it.each(AI_DASHBOARD_LAYOUT_TEMPLATES)(
        '%s places every chart once without overlap for all supported counts',
        (template) => {
            for (let count = 1; count <= 15; count += 1) {
                const shapes = Array.from(
                    { length: count },
                    (_, i) => [summary, chart, detail][i % 3],
                );
                const order = shapes.map((_, i) => count - i - 1);
                const layout = buildAiDashboardLayout(template, shapes, order)!;
                expect(
                    isValidDashboardTilePositions(layout.positions, count),
                ).toBe(true);
                const rows = getAiDashboardLayoutRows(layout);
                expect(
                    rows.flatMap((row) => row.tiles.map((tile) => tile.index)),
                ).toEqual(order);
                rows.forEach((row) =>
                    expect(
                        row.tiles.reduce((width, tile) => width + tile.w, 0),
                    ).toBe(36),
                );
            }
        },
    );

    it('makes an overview with compact KPIs, a main trend and a full-width detail table', () => {
        expect(
            buildAiDashboardLayout('overview', [
                summary,
                summary,
                chart,
                chart,
                chart,
                detail,
            ])?.positions,
        ).toEqual([
            { x: 0, y: 0, w: 18, h: 6 },
            { x: 18, y: 0, w: 18, h: 6 },
            { x: 0, y: 6, w: 36, h: 10 },
            { x: 0, y: 16, w: 18, h: 8 },
            { x: 18, y: 16, w: 18, h: 8 },
            { x: 0, y: 24, w: 36, h: 10 },
        ]);
    });

    it.each([5, 9, 13])(
        'balances %i KPIs across rows without an oversized leftover',
        (count) => {
            const layout = buildAiDashboardLayout(
                'overview',
                Array.from({ length: count }, () => summary),
            )!;
            const rows = getAiDashboardLayoutRows(layout);
            expect(
                rows.every(
                    (row) => row.tiles.length >= 2 && row.tiles.length <= 4,
                ),
            ).toBe(true);
        },
    );

    it.each<[number[]]>([[[0, 0]], [[0]], [[0, 2]], [[0, -1]], [[0, 0.5]]])(
        'rejects incomplete/invalid order %j',
        (order) => {
            expect(
                buildAiDashboardLayout('balanced', [chart, chart], order),
            ).toBeUndefined();
        },
    );

    it('does not mutate input ordering or shapes', () => {
        const shapes = Object.freeze([
            Object.freeze(summary),
            Object.freeze(chart),
        ]);
        const order = Object.freeze([1, 0]);
        expect(
            buildAiDashboardLayout('analysis', shapes, order)?.positions[1],
        ).toEqual({ x: 0, y: 0, w: 36, h: 10 });
        expect(order).toEqual([1, 0]);
    });
});

describe('dashboard tile position validation', () => {
    const first = { x: 0, y: 0, w: 18, h: 8 };
    it.each(
        [
            [{ ...first, x: -1 }],
            [{ ...first, w: 37 }],
            [{ ...first, y: -1 }],
            [{ ...first, h: 0 }],
            [{ ...first, y: Infinity }],
            [{ ...first, x: 0.5 }],
            [{ ...first, y: 9_999, h: 2 }],
        ].map((positions) => ({ positions })),
    )('rejects invalid bounds %j', ({ positions }) => {
        expect(isValidDashboardTilePositions(positions, 1)).toBe(false);
    });
    it('rejects missing positions and overlap, allowing shared edges', () => {
        expect(isValidDashboardTilePositions([first], 2)).toBe(false);
        expect(
            isValidDashboardTilePositions([first, { ...first, x: 17 }], 2),
        ).toBe(false);
        expect(
            isValidDashboardTilePositions([first, { ...first, x: 18 }], 2),
        ).toBe(true);
        expect(
            isValidDashboardTilePositions([first, { ...first, y: 8 }], 2),
        ).toBe(true);
    });
});
