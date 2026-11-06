const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const UNITS = [
    { ms: 2 * DAY_MS, unitMs: DAY_MS, suffix: 'd' },
    { ms: HOUR_MS, unitMs: HOUR_MS, suffix: 'h' },
    { ms: MINUTE_MS, unitMs: MINUTE_MS, suffix: 'm' },
    { ms: SECOND_MS, unitMs: SECOND_MS, suffix: 's' },
];

// One whole unit, prefixed with "~" when rounding dropped anything.
export const formatWarehouseTime = (ms: number): string => {
    const unit = UNITS.find((candidate) => ms >= candidate.ms);
    if (!unit) return `${Math.round(ms)}ms`;
    const value = Math.round(ms / unit.unitMs);
    const formatted = `${value}${unit.suffix}`;
    return value * unit.unitMs === ms ? formatted : `~${formatted}`;
};
