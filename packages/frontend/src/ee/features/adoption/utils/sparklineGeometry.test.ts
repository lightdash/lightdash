import { describe, expect, it } from 'vitest';
import {
    getSparklinePoints,
    hasActivity,
    SPARKLINE_HEIGHT,
    SPARKLINE_WIDTH,
    toAreaPoints,
    toPolylinePoints,
} from './sparklineGeometry';

describe('hasActivity', () => {
    it('is false for no values and for all zeros', () => {
        expect(hasActivity([])).toBe(false);
        expect(hasActivity([0, 0, 0])).toBe(false);
    });
    it('is true when any week has activity', () => {
        expect(hasActivity([0, 3, 0])).toBe(true);
    });
});

describe('getSparklinePoints', () => {
    it('keeps 12 points inside the box and spreads them across the width', () => {
        const points = getSparklinePoints([0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
        expect(points).toHaveLength(12);
        points.forEach((point) => {
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(SPARKLINE_WIDTH);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThanOrEqual(SPARKLINE_HEIGHT);
        });
        expect(points[0].x).toBeLessThan(5);
        expect(points[11].x).toBeGreaterThan(SPARKLINE_WIDTH - 5);
        const xs = points.map((p) => p.x);
        expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    });
    it('draws a single non-zero last week as a rise, not a vertical line', () => {
        const points = getSparklinePoints([...Array(11).fill(0), 2]);
        const floor = points[0].y;
        expect(points.slice(0, 11).every((p) => p.y === floor)).toBe(true);
        expect(points[11].y).toBeLessThan(floor - 10);
        // The rise spans one step of the x axis, so no two points share an x
        expect(new Set(points.map((p) => p.x)).size).toBe(12);
        expect(points[11].x - points[10].x).toBeGreaterThan(5);
    });
    it('centres a single value', () => {
        expect(getSparklinePoints([4])[0].x).toBe(SPARKLINE_WIDTH / 2);
    });
});

describe('toPolylinePoints', () => {
    it('serialises as x,y pairs', () => {
        expect(
            toPolylinePoints([
                { x: 1, y: 2.345 },
                { x: 3, y: 4 },
            ]),
        ).toBe('1,2.35 3,4');
    });
    it('closes the area down to the floor', () => {
        const area = toAreaPoints([
            { x: 2, y: 10 },
            { x: 108, y: 5 },
        ]);
        expect(area).toBe('2,10 108,5 108,27 2,27');
    });
});
