const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const twoUnits = (
    ms: number,
    major: { ms: number; suffix: string },
    minor: { ms: number; suffix: string },
): string => {
    const majorValue = Math.floor(ms / major.ms);
    const minorValue = Math.floor((ms % major.ms) / minor.ms);
    return minorValue > 0
        ? `${majorValue}${major.suffix} ${minorValue}${minor.suffix}`
        : `${majorValue}${major.suffix}`;
};

// Whole units only: the largest unit plus the next one, truncated.
export const formatWarehouseTime = (ms: number): string => {
    if (ms < SECOND_MS) return `${Math.round(ms)}ms`;
    if (ms < MINUTE_MS) return `${Math.floor(ms / SECOND_MS)}s`;
    if (ms < HOUR_MS)
        return twoUnits(
            ms,
            { ms: MINUTE_MS, suffix: 'm' },
            { ms: SECOND_MS, suffix: 's' },
        );
    if (ms < 2 * DAY_MS)
        return twoUnits(
            ms,
            { ms: HOUR_MS, suffix: 'h' },
            { ms: MINUTE_MS, suffix: 'm' },
        );
    return twoUnits(
        ms,
        { ms: DAY_MS, suffix: 'd' },
        { ms: HOUR_MS, suffix: 'h' },
    );
};
