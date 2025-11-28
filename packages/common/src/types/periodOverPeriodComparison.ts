import { TimeFrames } from './timeFrames';

type PreviousPeriod = {
    type: 'previousPeriod';
    granularity: TimeFrames; // TODO: improve this to only include DAY, WEEK, MONTH, QUARTER, YEAR
    periodOffset?: number; // e.g. compare this month to the last 3(periodOffset) months
};

export type PeriodOverPeriodComparison = PreviousPeriod & {
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
