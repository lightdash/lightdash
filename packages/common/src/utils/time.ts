import moment from 'moment-timezone';
import { SupportedDbtAdapter } from '../types/dbt';
import { type WarehouseTypes } from '../types/projects';
import { isWeekDay, WeekDay } from './timeFrames';

// from 0 (Monday) to 6 (Sunday) to 0 (Sunday) to 6 (Saturday)
export const convertWeekDayToMomentWeekDay = (weekDay: WeekDay) => {
    const converted = weekDay + 1;
    return converted <= 6 ? converted : 0;
};

const createMomentLocaleForWeekStart = (name: string, startOfWeek: WeekDay) => {
    if (!moment.locales().includes(name)) {
        moment.locale(name, {
            week: {
                dow: convertWeekDayToMomentWeekDay(startOfWeek),
            },
        });
    }
};

export const getMomentDateWithCustomStartOfWeek = (
    startOfWeek: WeekDay | null | undefined,
    inp?: moment.MomentInput,
) => {
    if (isWeekDay(startOfWeek)) {
        const localeName = `lightdash-start-of-week-${startOfWeek}`;
        createMomentLocaleForWeekStart(localeName, startOfWeek);
        return moment(inp).locale(localeName);
    }
    return moment(inp);
};

export const formatMilliseconds = (
    ms: number,
    fractionDigits: number = 2,
): string => ms.toFixed(fractionDigits).replace(/\.?0+$/, '');

/**
 * Returns the default week start day for a given warehouse adapter.
 * This ensures JavaScript-side week boundary calculations match the warehouse.
 *
 * References:
 * - PostgreSQL: https://www.postgresql.org/docs/current/functions-datetime.html (ISO 8601 weeks start on Monday)
 * - Snowflake: https://docs.snowflake.com/en/sql-reference/functions-date-time (WEEK_START=0 defaults to Monday)
 * - Redshift: https://docs.aws.amazon.com/redshift/latest/dg/r_DATE_TRUNC.html (truncates week to Monday)
 * - Databricks: https://docs.databricks.com/aws/en/sql/language-manual/functions/date_trunc (WEEK truncates to Monday)
 * - Trino: https://trino.io/docs/current/functions/datetime.html (ISO 8601 weeks start on Monday)
 * - BigQuery: https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/date_functions (WEEK is equivalent to WEEK(SUNDAY))
 * - ClickHouse: https://clickhouse.com/docs/sql-reference/functions/date-time-functions (toStartOfWeek default mode=0 is Sunday)
 */

export const getDefaultStartOfWeek = (
    adapterType: SupportedDbtAdapter | WarehouseTypes,
): WeekDay => {
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.CLICKHOUSE:
            return WeekDay.SUNDAY;
        default:
            return WeekDay.MONDAY;
    }
};
