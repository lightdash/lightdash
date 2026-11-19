import {
    type Box,
    type CaptureCover,
    type CaptureTarget,
    type Point,
} from './types';

/**
 * What the area inside a mark's box sits on. Samples a grid of points and
 * returns each target found with its share of the samples, biggest first.
 */
export const coveredTargets = (
    box: Box,
    resolve: (point: Point) => CaptureTarget | null,
    perSide = 6,
): CaptureCover[] => {
    const counts = new Map<string, { target: CaptureTarget; count: number }>();
    for (let row = 0; row < perSide; row += 1) {
        for (let column = 0; column < perSide; column += 1) {
            const target = resolve({
                x: box.x + (box.width * (column + 0.5)) / perSide,
                y: box.y + (box.height * (row + 0.5)) / perSide,
            });
            if (target) {
                const key = `${target.kind}:${target.id}`;
                const entry = counts.get(key) ?? { target, count: 0 };
                entry.count += 1;
                counts.set(key, entry);
            }
        }
    }
    return Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .map(({ target, count }) => ({
            target,
            share: count / (perSide * perSide),
        }));
};
