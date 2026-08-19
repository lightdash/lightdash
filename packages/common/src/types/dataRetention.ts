export type RetentionWindowHours = number | null;

export const MIN_RETENTION_WINDOW_HOURS = 1;

export const MAX_RETENTION_WINDOW_HOURS = 876_000;

export const isValidRetentionWindowHours = (
    value: RetentionWindowHours,
): boolean =>
    value === null ||
    (Number.isInteger(value) &&
        value >= MIN_RETENTION_WINDOW_HOURS &&
        value <= MAX_RETENTION_WINDOW_HOURS);

export const RETENTION_WINDOW_HOURS_ERROR =
    'Retention must be null (keep forever) or a whole number of hours between 1 and 876,000 (100 years)';

export const getEffectiveRetentionWindowHours = (
    override: RetentionWindowHours,
    ceiling: RetentionWindowHours,
): RetentionWindowHours => {
    if (override === null) return ceiling;
    if (ceiling === null) return override;
    return Math.min(override, ceiling);
};

export const exceedsRetentionCeiling = (
    override: RetentionWindowHours,
    ceiling: RetentionWindowHours,
): boolean => override !== null && ceiling !== null && override > ceiling;
