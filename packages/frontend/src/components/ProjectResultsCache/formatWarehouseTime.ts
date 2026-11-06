const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type Unit = { from: number; unitMs: number; suffix: string };

const UNITS: Unit[] = [
    { from: 2 * DAY_MS, unitMs: DAY_MS, suffix: 'd' },
    { from: HOUR_MS, unitMs: HOUR_MS, suffix: 'h' },
    { from: MINUTE_MS, unitMs: MINUTE_MS, suffix: 'm' },
    { from: SECOND_MS, unitMs: SECOND_MS, suffix: 's' },
    { from: 0, unitMs: 1, suffix: 'ms' },
];

const unitFor = (ms: number): Unit =>
    UNITS.find((unit) => ms >= unit.from) ?? UNITS[UNITS.length - 1];

const roundTo = (ms: number, unit: Unit) =>
    Math.round(ms / unit.unitMs) * unit.unitMs;

// One whole unit, prefixed with "~" when rounding dropped anything.
export const formatWarehouseTime = (ms: number): string => {
    const firstUnit = unitFor(ms);
    // Rounding can reach the next unit, e.g. 59.6s -> 60s -> 1m.
    const unit = unitFor(roundTo(ms, firstUnit));
    const rounded = roundTo(ms, unit);
    const formatted = `${rounded / unit.unitMs}${unit.suffix}`;
    return rounded === ms ? formatted : `~${formatted}`;
};
