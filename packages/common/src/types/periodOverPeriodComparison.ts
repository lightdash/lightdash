import { TimeFrames } from './timeFrames';

type PreviousPeriod = {
    type: 'previousPeriod';
    granularity: TimeFrames; // TODO: improve this to only include DAY, WEEK, MONTH, QUARTER, YEAR
    periodOffset?: number; // e.g. compare this month to the last 3(periodOffset) months
};

type RollingPeriod = {
    type: 'rollingPeriod';
    granularity: TimeFrames;
    windowSize: number; // e.g. 7 for 7-day rolling average
};

type PeriodOverPeriodBase = PreviousPeriod | RollingPeriod;

export type PeriodOverPeriodComparison = PeriodOverPeriodBase & {
    // timeDimension
    field: {
        name: string;
        table: string;
    };
};

export const validPeriodOverPeriodGranularities = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

export const periodOverPeriodGranularityLabels: Record<TimeFrames, string> = {
    [TimeFrames.YEAR]: 'Year',
    [TimeFrames.QUARTER]: 'Quarter',
    [TimeFrames.MONTH]: 'Month',
    [TimeFrames.WEEK]: 'Week',
    [TimeFrames.DAY]: 'Day',
    [TimeFrames.HOUR]: 'Hour',
    [TimeFrames.MINUTE]: 'Minute',
    [TimeFrames.SECOND]: 'Second',
    [TimeFrames.MILLISECOND]: 'Millisecond',
    [TimeFrames.RAW]: 'Raw',
    [TimeFrames.DAY_OF_WEEK_INDEX]: 'Day of Week Index',
    [TimeFrames.DAY_OF_MONTH_NUM]: 'Day of Month',
    [TimeFrames.DAY_OF_YEAR_NUM]: 'Day of Year',
    [TimeFrames.WEEK_NUM]: 'Week Number',
    [TimeFrames.MONTH_NUM]: 'Month Number',
    [TimeFrames.QUARTER_NUM]: 'Quarter Number',
    [TimeFrames.YEAR_NUM]: 'Year Number',
    [TimeFrames.DAY_OF_WEEK_NAME]: 'Day of Week Name',
    [TimeFrames.MONTH_NAME]: 'Month Name',
    [TimeFrames.QUARTER_NAME]: 'Quarter Name',
    [TimeFrames.HOUR_OF_DAY_NUM]: 'Hour of Day',
    [TimeFrames.MINUTE_OF_HOUR_NUM]: 'Minute of Hour',
};

export const isSupportedPeriodOverPeriodGranularity = (
    granularity: TimeFrames,
) => validPeriodOverPeriodGranularities.includes(granularity);

/**
 * Suffix used for period-over-period comparison columns.
 * This is the single source of truth for the PoP column naming convention.
 */
export const POP_PREVIOUS_PERIOD_SUFFIX = '_previous';

/**
 * Suffix used for rolling period comparison columns.
 */
export const POP_ROLLING_PERIOD_SUFFIX = '_rolling';

/**
 * Gets the PoP field ID for a base metric field ID.
 * @param baseFieldId - The field ID of the base metric (e.g., "orders_total_revenue")
 * @returns The PoP field ID (e.g., "orders_total_revenue_previous")
 */
export const getPopFieldId = (baseFieldId: string): string =>
    `${baseFieldId}${POP_PREVIOUS_PERIOD_SUFFIX}`;

/**
 * Gets the base field ID from a PoP field ID.
 * @param fieldId - The field ID to check
 * @returns The base field ID if this is a PoP field, null otherwise
 */
export const getBaseFieldIdFromPop = (fieldId: string): string | null =>
    fieldId.endsWith(POP_PREVIOUS_PERIOD_SUFFIX)
        ? fieldId.slice(0, -POP_PREVIOUS_PERIOD_SUFFIX.length)
        : null;

/**
 * Type guard to check if a comparison is a rolling period.
 * @param comparison - The period-over-period comparison to check
 * @returns True if the comparison is a rolling period
 */
export const isRollingPeriod = (
    comparison: PeriodOverPeriodComparison,
): comparison is PeriodOverPeriodComparison & RollingPeriod =>
    comparison.type === 'rollingPeriod';

/**
 * Type guard to check if a comparison is a previous period.
 * @param comparison - The period-over-period comparison to check
 * @returns True if the comparison is a previous period
 */
export const isPreviousPeriod = (
    comparison: PeriodOverPeriodComparison,
): comparison is PeriodOverPeriodComparison & PreviousPeriod =>
    comparison.type === 'previousPeriod';

/**
 * Gets the rolling period field ID for a base metric field ID.
 * @param baseFieldId - The field ID of the base metric (e.g., "orders_total_revenue")
 * @returns The rolling period field ID (e.g., "orders_total_revenue_rolling")
 */
export const getRollingPeriodFieldId = (baseFieldId: string): string =>
    `${baseFieldId}${POP_ROLLING_PERIOD_SUFFIX}`;

/**
 * Gets the base field ID from a rolling period field ID.
 * @param fieldId - The field ID to check
 * @returns The base field ID if this is a rolling period field, null otherwise
 */
export const getBaseFieldIdFromRollingPeriod = (
    fieldId: string,
): string | null =>
    fieldId.endsWith(POP_ROLLING_PERIOD_SUFFIX)
        ? fieldId.slice(0, -POP_ROLLING_PERIOD_SUFFIX.length)
        : null;

/**
 * Checks if a field ID is a period-over-period field (either previous or rolling).
 * @param fieldId - The field ID to check
 * @returns True if the field is a PoP field
 */
export const isPopField = (fieldId: string): boolean =>
    fieldId.endsWith(POP_PREVIOUS_PERIOD_SUFFIX) ||
    fieldId.endsWith(POP_ROLLING_PERIOD_SUFFIX);

/**
 * Validates rolling period window size.
 * @param windowSize - The window size to validate
 * @returns True if window size is valid
 */
export const isValidRollingWindowSize = (windowSize: number): boolean =>
    Number.isInteger(windowSize) && windowSize >= 2 && windowSize <= 365;
