export type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export const DURATION_UNIT_SECONDS: Record<DurationUnit, number> = {
    seconds: 1,
    minutes: 60,
    hours: 60 * 60,
    days: 24 * 60 * 60,
};

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
    seconds: 'seconds',
    minutes: 'minutes',
    hours: 'hours',
    days: 'days',
};

export const ALL_DURATION_UNITS: DurationUnit[] = [
    'seconds',
    'minutes',
    'hours',
    'days',
];

const plural = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? '' : 's'}`;

/** Largest allowed unit that divides the duration evenly, or null. */
export const findExactUnit = (
    seconds: number,
    units: DurationUnit[],
): DurationUnit | null =>
    [...units]
        .sort((a, b) => DURATION_UNIT_SECONDS[b] - DURATION_UNIT_SECONDS[a])
        .find((unit) => seconds % DURATION_UNIT_SECONDS[unit] === 0) ?? null;

/** "90 seconds" -> "1.5 minutes", "86400" -> "1 day". */
export const formatDuration = (seconds: number): string => {
    const unit =
        [...ALL_DURATION_UNITS]
            .reverse()
            .find((candidate) => seconds >= DURATION_UNIT_SECONDS[candidate]) ??
        'seconds';
    const amount = seconds / DURATION_UNIT_SECONDS[unit];
    const rounded = Number.isInteger(amount)
        ? amount
        : Number(amount.toFixed(1));
    return plural(rounded, unit.replace(/s$/, ''));
};
