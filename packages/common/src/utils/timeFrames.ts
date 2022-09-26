import { SupportedDbtAdapter } from '../types/dbt';
import { ParseError } from '../types/errors';
import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';

type TimeFrameConfig = {
    getDimensionType: (fallback: DimensionType) => DimensionType;
    getSql: (
        adapterType: SupportedDbtAdapter,
        timeInterval: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => string;
};

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

const wrapSqlWithFormatExpressionFn = (
    adapterType: SupportedDbtAdapter,
    formatExpression: string,
    originalSql: string,
    type: DimensionType,
) => {
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

// eslint-disable-next-line import/prefer-default-export
export const timeFrameConfigs: Record<TimeFrames, TimeFrameConfig> = {
    RAW: {
        getDimensionType: (fallback) => fallback,
        getSql: (_adapterType, _timeInterval, originalSql) => originalSql,
    },
    MILLISECOND: {
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    SECOND: {
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    MINUTE: {
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    HOUR: {
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: wrapSqlWithTruncateFn,
    },
    DAY: {
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    WEEK: {
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    MONTH: {
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    QUARTER: {
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    YEAR: {
        getDimensionType: () => DimensionType.DATE,
        getSql: wrapSqlWithTruncateFn,
    },
    MONTH_NUM: {
        getDimensionType: () => DimensionType.NUMBER,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
        ) => wrapSqlWithDatePartFn(adapterType, 'MONTH', originalSql),
    },
    MONTH_NAME: {
        getDimensionType: () => DimensionType.STRING,
        getSql: (
            adapterType: SupportedDbtAdapter,
            timeInterval: TimeFrames,
            originalSql: string,
            type: DimensionType,
        ) => {
            let datePart;
            switch (adapterType) {
                case SupportedDbtAdapter.BIGQUERY:
                    datePart = '%B';
                    break;
                case SupportedDbtAdapter.SNOWFLAKE:
                    datePart = 'MMMM';
                    break;
                case SupportedDbtAdapter.REDSHIFT:
                case SupportedDbtAdapter.POSTGRES:
                    datePart = 'Month';
                    break;
                case SupportedDbtAdapter.DATABRICKS:
                    datePart = 'MMMM';
                    break;
                default:
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const never: never = adapterType;
                    throw new ParseError(
                        `Cannot recognise warehouse ${adapterType}`,
                    );
            }
            return wrapSqlWithFormatExpressionFn(
                adapterType,
                datePart,
                originalSql,
                type,
            );
        },
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
