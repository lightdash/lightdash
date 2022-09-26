import { SupportedDbtAdapter } from '../types/dbt';
import { ParseError } from '../types/errors';
import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';

const wrapSqlWithTruncateFn = (
    adapterType: SupportedDbtAdapter,
    timeInterval: TimeFrames,
    originalSql: string,
    type: DimensionType,
) => {
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            if (type === DimensionType.TIMESTAMP) {
                return `DATETIME_TRUNC(${originalSql}, ${timeInterval.toUpperCase()})`;
            }
            return `DATE_TRUNC(${originalSql}, ${timeInterval.toUpperCase()})`;
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.DATABRICKS:
            return `DATE_TRUNC('${timeInterval.toUpperCase()}', ${originalSql})`;
        default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const never: never = adapterType;
            throw new ParseError(`Cannot recognise warehouse ${adapterType}`);
    }
};

const wrapSqlWithDatePartFn = (
    adapterType: SupportedDbtAdapter,
    datePart: string,
    originalSql: string,
) => {
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
            return `EXTRACT(${datePart} FROM ${originalSql})`;
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.POSTGRES:
        case SupportedDbtAdapter.DATABRICKS:
            return `DATE_PART('${datePart}', ${originalSql})`;
        default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const never: never = adapterType;
            throw new ParseError(`Cannot recognise warehouse ${adapterType}`);
    }
};

const timeFramesWithFormatExpression = TimeFrames.MONTH_NAME;
type TimeFramesWithFormatExpression = typeof timeFramesWithFormatExpression;

const isTimeFramesWithFormatExpression = (
    timeFrame: TimeFrames,
): timeFrame is TimeFramesWithFormatExpression =>
    timeFramesWithFormatExpression.includes(timeFrame);

const warehouseTimeFrameExpressions: Record<
    SupportedDbtAdapter,
    Record<TimeFramesWithFormatExpression, string>
> = {
    [SupportedDbtAdapter.BIGQUERY]: {
        [TimeFrames.MONTH_NAME]: '%B',
    },
    [SupportedDbtAdapter.SNOWFLAKE]: {
        [TimeFrames.MONTH_NAME]: 'MMMM',
    },
    [SupportedDbtAdapter.REDSHIFT]: {
        [TimeFrames.MONTH_NAME]: 'Month',
    },
    [SupportedDbtAdapter.POSTGRES]: {
        [TimeFrames.MONTH_NAME]: 'Month',
    },
    [SupportedDbtAdapter.DATABRICKS]: {
        [TimeFrames.MONTH_NAME]: 'MMMM',
    },
};

const wrapSqlWithFormatExpressionFn = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
) => {
    if (!isTimeFramesWithFormatExpression(timeFrame)) {
        throw new ParseError(
            `Cannot recognise format expression for ${timeFrame}`,
        );
    }
    const formatExpression =
        warehouseTimeFrameExpressions[adapterType][timeFrame];
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY: // https://cloud.google.com/bigquery/docs/reference/standard-sql/format-elements#format_elements_date_time
            if (type === DimensionType.TIMESTAMP) {
                return `FORMAT_DATETIME(${formatExpression}, ${originalSql})`;
            }
            return `FORMAT_DATE(${formatExpression}, ${originalSql})`;
        case SupportedDbtAdapter.SNOWFLAKE: // https://docs.snowflake.com/en/sql-reference/functions/to_char.html
            return `TO_CHAR(${formatExpression}, ${originalSql})`;
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.POSTGRES: // https://www.postgresql.org/docs/current/functions-formatting.html
            return `TO_CHAR(${originalSql}, '${formatExpression}')`;
        case SupportedDbtAdapter.DATABRICKS: // https://docs.databricks.com/spark/latest/spark-sql/language-manual/functions/date_format.html
            return `DATE_FORMAT(${originalSql}, '${formatExpression}')`;
        default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const never: never = adapterType;
            throw new ParseError(`Cannot recognise warehouse ${adapterType}`);
    }
};

type TimeFrameConfig = {
    getLabel: () => string;
    getDimensionType: (fallback: DimensionType) => DimensionType;
    getSql: (
        adapterType: SupportedDbtAdapter,
        timeInterval: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => string;
};

export const timeFrameConfigs: Record<TimeFrames, TimeFrameConfig> = {
    RAW: {
        getLabel: () => '',
        getDimensionType: (fallback) => fallback,
        getSql: (_adapterType, _timeInterval, originalSql) => originalSql,
    },
    MILLISECOND: {
        getLabel: () => 'Millisecond',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    SECOND: {
        getLabel: () => 'Second',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    MINUTE: {
        getLabel: () => 'Minute',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    HOUR: {
        getLabel: () => 'Hour',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    DAY: {
        getLabel: () => 'Day',
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    WEEK: {
        getLabel: () => 'Week',
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    MONTH: {
        getLabel: () => 'Month',
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    QUARTER: {
        getLabel: () => 'Quarter',
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    YEAR: {
        getLabel: () => 'Year',
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    MONTH_NUM: {
        getLabel: () => 'Month',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
        ) => wrapSqlWithDatePartFn(adapterType, 'MONTH', originalSql),
    },
    DAY_OF_WEEK_INDEX: {
        getLabel: () => 'Day of the week',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
        ) => wrapSqlWithDatePartFn(adapterType, 'DOW', originalSql),
    },
    DAY_OF_MONTH_NUM: {
        getLabel: () => 'Day of the month',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
        ) => wrapSqlWithDatePartFn(adapterType, 'MONTH', originalSql),
    },
    DAY_OF_YEAR_NUM: {
        getLabel: () => 'Day of the year',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
        ) => wrapSqlWithDatePartFn(adapterType, 'DOY', originalSql),
    },
    QUARTER_NUM: {
        getLabel: () => 'Quarter',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
        ) => wrapSqlWithDatePartFn(adapterType, 'QUARTER', originalSql),
    },
    YEAR_NUM: {
        getLabel: () => 'Year',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
        ) => wrapSqlWithDatePartFn(adapterType, 'YEAR', originalSql),
    },
    MONTH_NAME: {
        getLabel: () => 'Month',
        getDimensionType: () => DimensionType.STRING,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
            type: DimensionType,
        ) =>
            wrapSqlWithFormatExpressionFn(
                adapterType,
                timeInterval,
                originalSql,
                type,
            ),
    },
};

export const getDefaultTimeFrames = (type: DimensionType) =>
    type === DimensionType.TIMESTAMP
        ? [
              TimeFrames.RAW,
              TimeFrames.DAY,
              TimeFrames.WEEK,
              TimeFrames.MONTH,
              TimeFrames.QUARTER,
              TimeFrames.YEAR,
          ]
        : [TimeFrames.DAY, TimeFrames.WEEK, TimeFrames.MONTH, TimeFrames.YEAR];

const isTimeInterval = (value: string): value is TimeFrames =>
    Object.keys(timeFrameConfigs).includes(value);

export const validateTimeFrames = (values: string[]): TimeFrames[] =>
    values.reduce<TimeFrames[]>((acc, value) => {
        const uppercaseValue = value.toUpperCase();
        return isTimeInterval(uppercaseValue) ? [...acc, uppercaseValue] : acc;
    }, []);
