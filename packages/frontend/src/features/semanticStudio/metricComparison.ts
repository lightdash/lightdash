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
