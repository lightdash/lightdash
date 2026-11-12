const MAX_COMPARED_METRICS = 8;

/** Of a model's metrics, the ones to put a number on: all of a new model's, else the changed ones and any built from them. */
export const pickComparedMetrics = <
    T extends { name: string; sql: string; hidden?: boolean },
>(
    metrics: T[],
    changed: Set<string>,
    isNewModel: boolean,
): T[] => {
    const visible = metrics.filter(({ hidden }) => !hidden);
    // A metric built from a changed one moves with it, so it is compared too.
    const moves = (metric: T) =>
        changed.has(metric.name) ||
        [...changed].some((name) => metric.sql.includes(`\${${name}}`));
    return (isNewModel ? visible : visible.filter(moves)).slice(
        0,
        MAX_COMPARED_METRICS,
    );
};

/** How far a total moved, as a signed percentage; null when it did not move or the two cannot be compared. */
export const describeShift = (
    before: unknown,
    after: unknown,
): string | null => {
    const from = Number(before);
    const to = Number(after);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
        return null;
    }
    if (from === 0) return null;
    const percent = ((to - from) / Math.abs(from)) * 100;
    return `${percent > 0 ? '+' : ''}${percent.toFixed(Math.abs(percent) < 10 ? 1 : 0)}%`;
};
