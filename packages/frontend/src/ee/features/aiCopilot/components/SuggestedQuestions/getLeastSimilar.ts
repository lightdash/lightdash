import { distance } from 'fastest-levenshtein';

export function getLeastSimilar<T>(
    xs: T[],
    getValue: (x: T) => string,
    m: number,
): T[] {
    if (m >= xs.length) return xs;

    const selected: T[] = [];
    const remaining = new Set(xs);

    const first = xs[0];
    selected.push(first);
    remaining.delete(first);

    while (selected.length < m) {
        let maxMinDist = -Infinity;
        let best: T | null = null;

        for (const candidate of remaining) {
            // Find minimum distance from candidate to any selected string
            const minDist = Math.min(
                ...selected.map((s) =>
                    distance(getValue(candidate), getValue(s)),
                ),
            );

            if (minDist > maxMinDist) {
                maxMinDist = minDist;
                best = candidate;
            }
        }

        if (best) {
            selected.push(best);
            remaining.delete(best);
        }
    }

    return selected;
}
