import { describe, expect, it } from 'vitest';
import { getVennLayout, type VennCircle } from './vennGeometry';

type Point = { x: number; y: number };
type Arc = { from: Point; to: Point; r: number; large: number; sweep: number };

const isInside = (circle: VennCircle, { x, y }: Point) =>
    Math.hypot(x - circle.cx, y - circle.cy) < circle.r;

// "M x y A r r 0 large sweep x y ... Z", as the layout writes it
const parseArcs = (path: string): { start: Point; arcs: Arc[] } => {
    const move = /^M([\d.-]+) ([\d.-]+)/.exec(path);
    if (!move) throw new Error(`No start in ${path}`);
    const start = { x: Number(move[1]), y: Number(move[2]) };
    let from = start;
    const arcs = Array.from(
        path.matchAll(/A([\d.]+) [\d.]+ 0 ([01]) ([01]) ([\d.-]+) ([\d.-]+)/g),
        (match): Arc => {
            const to = { x: Number(match[4]), y: Number(match[5]) };
            const arc = {
                from,
                to,
                r: Number(match[1]),
                large: Number(match[2]),
                sweep: Number(match[3]),
            };
            from = to;
            return arc;
        },
    );
    return { start, arcs };
};

// The centre and the middle of an SVG arc of a circle, from its end points and flags (SVG 2, appendix B.2.4)
const describeArc = ({ from, to, r, large, sweep }: Arc) => {
    const halfX = (from.x - to.x) / 2;
    const halfY = (from.y - to.y) / 2;
    const squared = halfX ** 2 + halfY ** 2;
    const scale =
        (large === sweep ? -1 : 1) *
        Math.sqrt(Math.max(0, (r ** 2 - squared) / squared));
    const centre = {
        x: scale * halfY + (from.x + to.x) / 2,
        y: -scale * halfX + (from.y + to.y) / 2,
    };
    const startAngle = Math.atan2(from.y - centre.y, from.x - centre.x);
    let span = Math.atan2(to.y - centre.y, to.x - centre.x) - startAngle;
    if (sweep === 1 && span < 0) span += 2 * Math.PI;
    if (sweep === 0 && span > 0) span -= 2 * Math.PI;
    const middle = startAngle + span / 2;
    return {
        centre,
        middle: {
            x: centre.x + r * Math.cos(middle),
            y: centre.y + r * Math.sin(middle),
        },
    };
};

// The centroid of the points of a region, sampled on a fine grid
const sampleCentroid = (
    circles: VennCircle[],
    positions: number[],
    width: number,
    height: number,
): Point => {
    const step = 0.5;
    let x = 0;
    let y = 0;
    let count = 0;
    for (let py = step / 2; py < height; py += step) {
        for (let px = step / 2; px < width; px += step) {
            const point = { x: px, y: py };
            if (
                circles.every(
                    (circle, i) =>
                        isInside(circle, point) === positions.includes(i),
                )
            ) {
                x += px;
                y += py;
                count += 1;
            }
        }
    }
    return { x: x / count, y: y / count };
};

describe('getVennLayout', () => {
    it('draws two circles of one size side by side, with a region for each and one for both', () => {
        const { circles, regions } = getVennLayout(2);
        expect(circles).toHaveLength(2);
        expect(circles[0].r).toBe(circles[1].r);
        expect(circles[0].cy).toBe(circles[1].cy);
        expect(circles[0].cx).toBeLessThan(circles[1].cx);
        expect(regions.map((region) => region.positions)).toEqual([
            [0],
            [1],
            [0, 1],
        ]);
    });
    it('draws three circles of one size on a triangle, with the first at the top and every combination a region', () => {
        const { circles, regions } = getVennLayout(3);
        expect(circles).toHaveLength(3);
        expect(new Set(circles.map((circle) => circle.r)).size).toBe(1);
        const sides = [
            [0, 1],
            [1, 2],
            [0, 2],
        ].map(([a, b]) =>
            Math.hypot(
                circles[a].cx - circles[b].cx,
                circles[a].cy - circles[b].cy,
            ),
        );
        sides.forEach((side) => expect(side).toBeCloseTo(sides[0], 6));
        expect(circles[0].cy).toBeLessThan(circles[1].cy);
        expect(circles[1].cy).toBeCloseTo(circles[2].cy, 6);
        expect(regions.map((region) => region.positions)).toEqual([
            [0],
            [1],
            [2],
            [0, 1],
            [0, 2],
            [1, 2],
            [0, 1, 2],
        ]);
    });
    it.each([2, 3] as const)(
        'keeps all %i circles inside the drawing',
        (count) => {
            const { width, height, circles } = getVennLayout(count);
            circles.forEach(({ cx, cy, r }) => {
                expect(cx - r).toBeGreaterThan(0);
                expect(cy - r).toBeGreaterThan(0);
                expect(cx + r).toBeLessThan(width);
                expect(cy + r).toBeLessThan(height);
            });
        },
    );
    it.each([2, 3] as const)(
        'puts each count of %i circles at the centroid of its region, inside exactly its circles',
        (count) => {
            const { width, height, circles, regions } = getVennLayout(count);
            regions.forEach(({ positions, label }) => {
                circles.forEach((circle, i) =>
                    expect(isInside(circle, label)).toBe(positions.includes(i)),
                );
                const centroid = sampleCentroid(
                    circles,
                    positions,
                    width,
                    height,
                );
                expect(label.x).toBeCloseTo(centroid.x, 0);
                expect(label.y).toBeCloseTo(centroid.y, 0);
            });
        },
    );
    it.each([2, 3] as const)(
        'outlines each region of %i circles with closed arcs of its circles, each between it and the region next door',
        (count) => {
            const { circles, regions } = getVennLayout(count);
            regions.forEach(({ positions, path }) => {
                const { start, arcs } = parseArcs(path);
                expect(path.endsWith('Z')).toBe(true);
                expect(arcs.length).toBeGreaterThanOrEqual(2);
                const end = arcs[arcs.length - 1].to;
                expect(
                    Math.hypot(end.x - start.x, end.y - start.y),
                ).toBeLessThan(0.05);
                arcs.forEach((arc) => {
                    const { centre, middle } = describeArc(arc);
                    // Each arc is part of one of the circles; a half circle's rounded ends can move its centre by about half a unit
                    const on = circles.findIndex(
                        (circle) =>
                            Math.hypot(
                                circle.cx - centre.x,
                                circle.cy - centre.y,
                            ) < 1 && circle.r === arc.r,
                    );
                    expect(on).toBeGreaterThanOrEqual(0);
                    // Its middle agrees with the region on every other circle, so the arc runs along this region
                    circles.forEach((circle, i) => {
                        if (i !== on) {
                            expect(isInside(circle, middle)).toBe(
                                positions.includes(i),
                            );
                        }
                    });
                });
            });
        },
    );
    it('gives the same layout every time it is asked', () => {
        expect(getVennLayout(3)).toBe(getVennLayout(3));
        expect(getVennLayout(2)).toBe(getVennLayout(2));
    });
});
