import { SupportedDbtAdapter } from '../types/dbt';
import { ParseError } from '../types/errors';
import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';

const nullTimeFrameMap: Record<TimeFrames, null> = {
    DAY: null,
    DAY_OF_MONTH_NUM: null,
    DAY_OF_WEEK_INDEX: null,
    DAY_OF_WEEK_NAME: null,
    DAY_OF_YEAR_NUM: null,
    HOUR: null,
    MILLISECOND: null,
    MINUTE: null,
    MONTH: null,
    MONTH_NAME: null,
    MONTH_NUM: null,
    QUARTER: null,
    QUARTER_NAME: null,
    QUARTER_NUM: null,
    RAW: null,
    SECOND: null,
    WEEK: null,
    YEAR: null,
    YEAR_NUM: null,
};

const timeFrameToDatePartMap: Record<TimeFrames, string | null> = {
    ...nullTimeFrameMap,
    [TimeFrames.DAY_OF_WEEK_INDEX]: 'DOW',
    [TimeFrames.DAY_OF_MONTH_NUM]: 'DAY',
    [TimeFrames.DAY_OF_YEAR_NUM]: 'DOY',
    [TimeFrames.MONTH_NUM]: 'MONTH',
    [TimeFrames.QUARTER_NUM]: 'QUARTER',
    [TimeFrames.YEAR_NUM]: 'YEAR',
};

type WarehouseConfig = {
    getSqlForTruncatedDate: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => string;
    getSqlForDatePart: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => string;
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => string;
};

const bigqueryConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => {
        if (type === DimensionType.TIMESTAMP) {
            return `DATETIME_TRUNC(${originalSql}, ${timeFrame})`;
        }
        return `DATE_TRUNC(${originalSql}, ${timeFrame})`;
    },
    getSqlForDatePart: (timeFrame: TimeFrames, originalSql: string) => {
        const bigqueryTimeFrameExpressions: Record<TimeFrames, string | null> =
            {
                ...timeFrameToDatePartMap,
                [TimeFrames.DAY_OF_WEEK_INDEX]: 'DAYOFWEEK',
                [TimeFrames.DAY_OF_YEAR_NUM]: 'DAYOFYEAR',
            };
        const datePart = bigqueryTimeFrameExpressions[timeFrame];
        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }
        return `EXTRACT(${datePart} FROM ${originalSql})`;
    },
    getSqlForDatePartName: (
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => {
        // https://cloud.google.com/bigquery/docs/reference/standard-sql/format-elements#format_elements_date_time
        const timeFrameExpressions: Record<TimeFrames, string | null> = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: '%A',
            [TimeFrames.MONTH_NAME]: '%B',
            [TimeFrames.QUARTER_NAME]: 'Q%Q',
        };
        const formatExpression = timeFrameExpressions[timeFrame];
        if (!formatExpression) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        if (type === DimensionType.TIMESTAMP) {
            return `FORMAT_DATETIME('${formatExpression}', ${originalSql})`;
        }
        return `FORMAT_DATE('${formatExpression}', ${originalSql})`;
    },
};

const snowflakeConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (timeFrame: TimeFrames, originalSql: string) =>
        `DATE_TRUNC('${timeFrame}', ${originalSql})`,
    getSqlForDatePart: (timeFrame: TimeFrames, originalSql: string) => {
        const datePart = timeFrameToDatePartMap[timeFrame];
        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }
        return `DATE_PART('${datePart}', ${originalSql})`;
    },
    getSqlForDatePartName: (timeFrame: TimeFrames, originalSql: string) => {
        // https://docs.snowflake.com/en/sql-reference/functions/to_char.html
        const timeFrameExpressionsFn: Record<
            TimeFrames,
            (() => string) | null
        > = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: () =>
                `DECODE(TO_CHAR(${originalSql}, 'DY'), 'Mon', 'Monday', 'Tue', 'Tuesday', 'Wed', 'Wednesday', 'Thu', 'Thursday', 'Fri', 'Friday', 'Sat', 'Saturday', 'Sun', 'Sunday')`,
            [TimeFrames.MONTH_NAME]: () => `TO_CHAR(${originalSql}, 'MMMM')`,
            [TimeFrames.QUARTER_NAME]: () =>
                `CONCAT('Q', DATE_PART('QUARTER', ${originalSql}))`,
        };
        const formatExpressionFn = timeFrameExpressionsFn[timeFrame];
        if (!formatExpressionFn) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return formatExpressionFn();
    },
};

const postgresConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (timeFrame: TimeFrames, originalSql: string) =>
        `DATE_TRUNC('${timeFrame}', ${originalSql})`,
    getSqlForDatePart: (timeFrame: TimeFrames, originalSql: string) => {
        const datePart = timeFrameToDatePartMap[timeFrame];
        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }
        return `DATE_PART('${datePart}', ${originalSql})`;
    },
    getSqlForDatePartName: (timeFrame: TimeFrames, originalSql: string) => {
        // https://www.postgresql.org/docs/current/functions-formatting.html
        const timeFrameExpressions: Record<TimeFrames, string | null> = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: 'Day',
            [TimeFrames.MONTH_NAME]: 'Month',
            [TimeFrames.QUARTER_NAME]: '"Q"Q',
        };
        const formatExpression = timeFrameExpressions[timeFrame];
        if (!formatExpression) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return `TO_CHAR(${originalSql}, '${formatExpression}')`;
    },
};

const databricksConfig: WarehouseConfig = {
    getSqlForTruncatedDate: (timeFrame: TimeFrames, originalSql: string) =>
        `DATE_TRUNC('${timeFrame}', ${originalSql})`,
    getSqlForDatePart: (timeFrame: TimeFrames, originalSql: string) => {
        const datePart = timeFrameToDatePartMap[timeFrame];
        if (!datePart) {
            throw new ParseError(`Cannot recognise date part for ${timeFrame}`);
        }
        return `DATE_PART('${datePart}', ${originalSql})`;
    },
    getSqlForDatePartName: (timeFrame: TimeFrames, originalSql: string) => {
        // https://docs.databricks.com/spark/latest/spark-sql/language-manual/functions/date_format.html
        const timeFrameExpressions: Record<TimeFrames, string | null> = {
            ...nullTimeFrameMap,
            [TimeFrames.DAY_OF_WEEK_NAME]: 'EE',
            [TimeFrames.MONTH_NAME]: 'MMMM',
            [TimeFrames.QUARTER_NAME]: 'Q',
        };
        const formatExpression = timeFrameExpressions[timeFrame];
        if (!formatExpression) {
            throw new ParseError(
                `Cannot recognise format expression for ${timeFrame}`,
            );
        }
        return `DATE_FORMAT(${originalSql}, '${formatExpression}')`;
    },
};

const warehouseConfigs: Record<SupportedDbtAdapter, WarehouseConfig> = {
    [SupportedDbtAdapter.BIGQUERY]: bigqueryConfig,
    [SupportedDbtAdapter.SNOWFLAKE]: snowflakeConfig,
    [SupportedDbtAdapter.REDSHIFT]: postgresConfig,
    [SupportedDbtAdapter.POSTGRES]: postgresConfig,
    [SupportedDbtAdapter.DATABRICKS]: databricksConfig,
};

const getSqlForTruncatedDate = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
) =>
    warehouseConfigs[adapterType].getSqlForTruncatedDate(
        timeFrame,
        originalSql,
        type,
    );
const getSqlForDatePart = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
) =>
    warehouseConfigs[adapterType].getSqlForDatePart(
        timeFrame,
        originalSql,
        type,
    );
const getSqlForDatePartName = (
    adapterType: SupportedDbtAdapter,
    timeFrame: TimeFrames,
    originalSql: string,
    type: DimensionType,
) =>
    warehouseConfigs[adapterType].getSqlForDatePartName(
        timeFrame,
        originalSql,
        type,
    );

type TimeFrameConfig = {
    getLabel: () => string;
    getDimensionType: (fallback: DimensionType) => DimensionType;
    getSql: (
        adapterType: SupportedDbtAdapter,
        timeFrame: TimeFrames,
        originalSql: string,
        type: DimensionType,
    ) => string;
};

export const timeFrameConfigs: Record<TimeFrames, TimeFrameConfig> = {
    RAW: {
        getLabel: () => 'Raw',
        getDimensionType: (fallback) => fallback,
        getSql: (_adapterType, _timeInterval, originalSql) => originalSql,
    },
    MILLISECOND: {
        getLabel: () => 'Millisecond',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
    },
    SECOND: {
        getLabel: () => 'Second',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
    },
    MINUTE: {
        getLabel: () => 'Minute',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
    },
    HOUR: {
        getLabel: () => 'Hour',
        getDimensionType: () => DimensionType.TIMESTAMP,
        getSql: getSqlForTruncatedDate,
    },
    DAY: {
        getLabel: () => 'Day',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
    },
    WEEK: {
        getLabel: () => 'Week',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
    },
    MONTH: {
        getLabel: () => 'Month',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
    },
    QUARTER: {
        getLabel: () => 'Quarter',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
    },
    YEAR: {
        getLabel: () => 'Year',
        getDimensionType: () => DimensionType.DATE,
        getSql: getSqlForTruncatedDate,
    },
    MONTH_NUM: {
        getLabel: () => 'Month (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
    },
    DAY_OF_WEEK_INDEX: {
        getLabel: () => 'Day of the week (index)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
    },
    DAY_OF_MONTH_NUM: {
        getLabel: () => 'Day of the month (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
    },
    DAY_OF_YEAR_NUM: {
        getLabel: () => 'Day of the year (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
    },
    QUARTER_NUM: {
        getLabel: () => 'Quarter (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
    },
    YEAR_NUM: {
        getLabel: () => 'Year (number)',
        getDimensionType: () => DimensionType.NUMBER,
        getSql: getSqlForDatePart,
    },
    DAY_OF_WEEK_NAME: {
        getLabel: () => 'Day of the week (name)',
        getDimensionType: () => DimensionType.STRING,
        getSql: getSqlForDatePartName,
    },
    MONTH_NAME: {
        getLabel: () => 'Month (name)',
        getDimensionType: () => DimensionType.STRING,
        getSql: getSqlForDatePartName,
    },
    QUARTER_NAME: {
        getLabel: () => 'Quarter (name)',
        getDimensionType: () => DimensionType.STRING,
        getSql: getSqlForDatePartName,
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

const timeFrameOrder = [
    undefined,
    TimeFrames.RAW,
    TimeFrames.MILLISECOND,
    TimeFrames.SECOND,
    TimeFrames.MINUTE,
    TimeFrames.HOUR,
    TimeFrames.DAY,
    TimeFrames.DAY_OF_WEEK_INDEX,
    TimeFrames.DAY_OF_WEEK_NAME,
    TimeFrames.DAY_OF_MONTH_NUM,
    TimeFrames.DAY_OF_YEAR_NUM,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.MONTH_NUM,
    TimeFrames.MONTH_NAME,
    TimeFrames.QUARTER,
    TimeFrames.QUARTER_NUM,
    TimeFrames.QUARTER_NAME,
    TimeFrames.YEAR,
    TimeFrames.YEAR_NUM,
];

export const sortTimeFrames = (a: TimeFrames, b: TimeFrames) =>
    timeFrameOrder.indexOf(a) - timeFrameOrder.indexOf(b);
