import { type Box, type MarkShape, type Point, type Stroke } from './types';

const distance = (a: Point, b: Point): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

const pathLength = (points: Point[]): number =>
    points.reduce(
        (total, point, i) =>
            i === 0 ? 0 : total + distance(points[i - 1], point),
        0,
    );

const boundingBox = (points: Point[]): Box => {
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

export const classifyMark = (
    strokes: Stroke[],
): {
    shape: MarkShape;
    box: Box;
    arrow: { from: Point; to: Point } | null;
} => {
    const all = strokes.flatMap((stroke) => stroke.points);
    const box = boundingBox(all);
    if (all.length < 2) return { shape: 'scribble', box, arrow: null };

    const first = strokes[0].points;
    const start = first[0];
    const end = first[first.length - 1];

    const closesOnItself =
        strokes.length === 1 &&
        first.length > 2 &&
        distance(start, end) <= 0.25 * Math.hypot(box.width, box.height);
    if (closesOnItself && box.width >= 0.02 && box.height >= 0.02) {
        return { shape: 'circle', box, arrow: null };
    }

    if (box.height <= 0.2 * box.width && pathLength(all) <= 1.5 * box.width) {
        return { shape: 'underline', box, arrow: null };
    }

    const straight = distance(start, end);
    if (straight > 0 && pathLength(first) <= 1.4 * straight) {
        return { shape: 'arrow', box, arrow: { from: start, to: end } };
    }

    return { shape: 'scribble', box, arrow: null };
};
