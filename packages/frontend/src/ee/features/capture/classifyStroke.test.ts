import { describe, expect, it } from 'vitest';
import { classifyMark } from './classifyStroke';
import { type Point } from './types';

const ring = (cx: number, cy: number, r: number): Point[] =>
    Array.from({ length: 25 }, (_, i) => ({
        x: cx + r * Math.cos((i / 24) * 2 * Math.PI),
        y: cy + r * Math.sin((i / 24) * 2 * Math.PI),
    }));

const line = (from: Point, to: Point, n: number): Point[] =>
    Array.from({ length: n }, (_, i) => ({
        x: from.x + ((to.x - from.x) * i) / (n - 1),
        y: from.y + ((to.y - from.y) * i) / (n - 1),
    }));

describe('classifyMark', () => {
    it('closed loop is a circle', () => {
        expect(classifyMark([{ points: ring(0.5, 0.5, 0.1) }]).shape).toBe(
            'circle',
        );
    });

    it('flat wide line is an underline', () => {
        expect(
            classifyMark([
                { points: line({ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.51 }, 10) },
            ]).shape,
        ).toBe('underline');
    });

    it('long diagonal line is an arrow with ends', () => {
        const r = classifyMark([
            { points: line({ x: 0.8, y: 0.1 }, { x: 0.1, y: 0.9 }, 12) },
        ]);
        expect(r.shape).toBe('arrow');
        expect(r.arrow?.from.x).toBeCloseTo(0.8);
        expect(r.arrow?.from.y).toBeCloseTo(0.1);
        expect(r.arrow?.to.x).toBeCloseTo(0.1);
        expect(r.arrow?.to.y).toBeCloseTo(0.9);
    });

    it('arrow with a separate head stroke is still an arrow', () => {
        expect(
            classifyMark([
                { points: line({ x: 0.2, y: 0.2 }, { x: 0.7, y: 0.7 }, 12) },
                {
                    points: [
                        { x: 0.65, y: 0.7 },
                        { x: 0.7, y: 0.7 },
                        { x: 0.7, y: 0.65 },
                    ],
                },
            ]).shape,
        ).toBe('arrow');
    });

    it('zigzag is a scribble', () => {
        expect(
            classifyMark([
                {
                    points: [0, 1, 2, 3, 4, 5].map((i) => ({
                        x: 0.3 + i * 0.02,
                        y: i % 2 ? 0.3 : 0.6,
                    })),
                },
            ]).shape,
        ).toBe('scribble');
    });

    it('single point is a scribble with a zero-size box', () => {
        expect(classifyMark([{ points: [{ x: 0.4, y: 0.4 }] }])).toEqual({
            shape: 'scribble',
            box: { x: 0.4, y: 0.4, width: 0, height: 0 },
            arrow: null,
        });
    });

    it('no strokes is a scribble with an empty box', () => {
        expect(classifyMark([])).toEqual({
            shape: 'scribble',
            box: { x: 0, y: 0, width: 0, height: 0 },
            arrow: null,
        });
    });

    it('box covers all strokes', () => {
        const { box } = classifyMark([
            {
                points: [
                    { x: 0.1, y: 0.2 },
                    { x: 0.3, y: 0.2 },
                ],
            },
            {
                points: [
                    { x: 0.2, y: 0.6 },
                    { x: 0.25, y: 0.6 },
                ],
            },
        ]);
        expect(box.x).toBeCloseTo(0.1);
        expect(box.y).toBeCloseTo(0.2);
        expect(box.width).toBeCloseTo(0.2);
        expect(box.height).toBeCloseTo(0.4);
    });
});
