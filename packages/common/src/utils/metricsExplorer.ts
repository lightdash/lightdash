import dayjs from 'dayjs';
import { groupBy, mapKeys } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type { MetricWithAssociatedTimeDimension } from '../types/catalog';
import { ConditionalOperator } from '../types/conditionalRule';
import { type CompiledTable } from '../types/explore';
import type { Dimension } from '../types/field';
import {
    DimensionType,
    type CompiledDimension,
    type CompiledMetric,
} from '../types/field';
import {
    type DateFilterSettings,
    type FieldTarget,
    type FilterRule,
} from '../types/filter';
import {
    MetricExplorerComparison,
    type MetricExploreDataPoint,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
} from '../types/metricsExplorer';
import type { ResultRow } from '../types/results';
import { TimeFrames, type DefaultTimeDimension } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { getItemId } from './item';

type DateFilter = FilterRule<
    ConditionalOperator,
    FieldTarget,
    unknown,
    DateFilterSettings
>;

type ImpelemntedTimeframe =
    | TimeFrames.DAY
    | TimeFrames.WEEK
    | TimeFrames.MONTH
    | TimeFrames.YEAR;

type UnimplementedTimeframe = Exclude<TimeFrames, ImpelemntedTimeframe>;

export const assertUnimplementedTimeframe = (
    timeframe: UnimplementedTimeframe,
): never => {
    switch (timeframe) {
        case TimeFrames.RAW:
        case TimeFrames.QUARTER:
        case TimeFrames.HOUR:
        case TimeFrames.MINUTE:
        case TimeFrames.SECOND:
        case TimeFrames.MILLISECOND:
        case TimeFrames.DAY_OF_WEEK_INDEX:
        case TimeFrames.DAY_OF_MONTH_NUM:
        case TimeFrames.DAY_OF_YEAR_NUM:
        case TimeFrames.WEEK_NUM:
        case TimeFrames.MONTH_NUM:
        case TimeFrames.QUARTER_NUM:
        case TimeFrames.YEAR_NUM:
        case TimeFrames.DAY_OF_WEEK_NAME:
        case TimeFrames.MONTH_NAME:
        case TimeFrames.QUARTER_NAME:
        case TimeFrames.HOUR_OF_DAY_NUM:
        case TimeFrames.MINUTE_OF_HOUR_NUM:
            throw new Error(
                `Timeframe "${timeframe}" is not supported for default time interval`,
            );
        default:
            return assertUnreachable(
                timeframe,
                `Unknown time interval: "${timeframe}"`,
            );
    }
};

export const getFieldIdForDateDimension = (
    fieldId: string,
    timeframe: TimeFrames,
) => {
    switch (timeframe) {
        case TimeFrames.DAY:
            return `${fieldId}_day`;
        case TimeFrames.WEEK:
            return `${fieldId}_week`;
        case TimeFrames.MONTH:
            return `${fieldId}_month`;
        case TimeFrames.YEAR:
            return `${fieldId}_year`;
        default:
            return assertUnimplementedTimeframe(timeframe);
    }
};

export const getDateCalcUtils = (timeFrame: TimeFrames) => {
    switch (timeFrame) {
        case TimeFrames.DAY:
            return {
                forward: (date: Date) => dayjs(date).add(1, 'day').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'day').toDate(),
            };
        case TimeFrames.WEEK:
            return {
                forward: (date: Date) => dayjs(date).add(1, 'week').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'week').toDate(),
            };
        case TimeFrames.MONTH:
            return {
                forward: (date: Date) => dayjs(date).add(1, 'month').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'month').toDate(),
            };
        case TimeFrames.YEAR:
            return {
                forward: (date: Date) => dayjs(date).add(1, 'year').toDate(),
                back: (date: Date) => dayjs(date).subtract(1, 'year').toDate(),
            };
        default:
            return assertUnimplementedTimeframe(timeFrame);
    }
};

export const METRICS_EXPLORER_DATE_FORMAT = 'YYYY-MM-DD';

export const getDateRangeFromString = (
    dateRange: [string, string],
): MetricExplorerDateRange => [
    dayjs(dateRange[0], METRICS_EXPLORER_DATE_FORMAT).toDate(),
    dayjs(dateRange[1], METRICS_EXPLORER_DATE_FORMAT).toDate(),
];

// TODO: refine the time grain for each time frame
//   Time grain Year: -> past 5 years (i.e. 5 completed years + this uncompleted year)
//   Time grain Month -> past 12 months (i.e. 12 completed months + this uncompleted month)
//   Time grain Week -> past 12 weeks (i.e. 12 completed weeks + this uncompleted week)
//   Time grain Day -> past 30 days (i.e. 30 completed days + this uncompleted day)
// above sample is taken from the spec but the implementation is different for practical reasons for visualization
export const getGrainForDateRange = (
    dateRange: [Date, Date],
): ImpelemntedTimeframe => {
    const diff = dateRange[1].getTime() - dateRange[0].getTime();
    const days = diff / (1000 * 60 * 60 * 24);

    if (days <= 31 * 3) {
        return TimeFrames.DAY;
    }
    if (days <= 7 * 12) {
        return TimeFrames.WEEK;
    }
    if (days <= 31 * 12) {
        return TimeFrames.MONTH;
    }
    return TimeFrames.YEAR;
};

export const getMetricExplorerDateRangeFilters = (
    timeDimensionConfig: TimeDimensionConfig,
    dateRange: MetricExplorerDateRange,
): DateFilter[] => {
    const targetFieldId = getItemId({
        table: timeDimensionConfig.table,
        name: getFieldIdForDateDimension(
            timeDimensionConfig.field,
            timeDimensionConfig.interval,
        ),
    });

    return [
        {
            id: uuidv4(),
            target: { fieldId: targetFieldId },
            operator: ConditionalOperator.IN_BETWEEN,
            values: dateRange.map((date) =>
                dayjs(date).format(METRICS_EXPLORER_DATE_FORMAT),
            ),
        },
    ];
};

// TODO: Should we just use the formatted value instead?
// Parse the metric value to a number, returning null if it's not a number
const parseMetricValue = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};

// we are assuming that the dimension value is a string and if it's not defined we just return null
// so actually `null` value will be converted to `"null"` string
const parseDimensionValue = (value: unknown): string | null => {
    if (value === undefined) return null;
    return String(value);
};

export const getMetricExplorerDataPoints = (
    dimension: Dimension,
    metric: MetricWithAssociatedTimeDimension,
    metricRows: ResultRow[],
    segmentDimensionId: string | null,
): Array<MetricExploreDataPoint> => {
    const dimensionId = getItemId(dimension);
    const metricId = getItemId(metric);

    const groupByMetricRows = groupBy(metricRows, (row) =>
        new Date(String(row[dimensionId].value.raw)).toISOString(),
    );

    return Object.entries(groupByMetricRows).flatMap(([date, rows]) =>
        rows.map((row) => {
            const segmentValue = segmentDimensionId
                ? parseDimensionValue(row[segmentDimensionId]?.value.raw)
                : null;

            return {
                date: new Date(date),
                segment: segmentValue,
                metric: {
                    value: parseMetricValue(row[metricId]?.value.raw),
                    label: segmentValue ?? metric.label ?? metric.name,
                },
                compareMetric: {
                    value: null,
                    label: null,
                },
            };
        }),
    );
};

export const getMetricExplorerDataPointsWithCompare = (
    dimension: Dimension,
    compareDimension: Dimension,
    metric: MetricWithAssociatedTimeDimension,
    metricRows: ResultRow[],
    compareMetricRows: ResultRow[],
    query: MetricExplorerQuery,
): Array<MetricExploreDataPoint> => {
    if (query.comparison === MetricExplorerComparison.NONE) {
        throw new Error('Comparison type is required');
    }

    const metricId = getItemId(metric);

    const dimensionId = getItemId(dimension);
    const compareDimensionId = getItemId(compareDimension);

    const groupByMetricRows = groupBy(metricRows, (row) =>
        new Date(String(row[dimensionId].value.raw)).toISOString(),
    );
    const groupByCompareMetricRows = groupBy(compareMetricRows, (row) =>
        new Date(String(row[compareDimensionId].value.raw)).toISOString(),
    );

    const offsetGroupByCompareMetricRows = mapKeys(
        groupByCompareMetricRows,
        (_, date) =>
            query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD
                ? getDateCalcUtils(TimeFrames.YEAR)
                      .forward(new Date(date))
                      .toISOString()
                : date,
    );

    const dates = new Set([
        ...Object.keys(groupByMetricRows),
        ...Object.keys(offsetGroupByCompareMetricRows),
    ]);

    const compareMetricId =
        query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD
            ? metricId
            : getItemId({
                  table: query.metric.table,
                  name: query.metric.name,
              });

    let comparisonMetricLabel: string | null = null;
    if (query.comparison === MetricExplorerComparison.DIFFERENT_METRIC) {
        comparisonMetricLabel = query.metric.label ?? query.metric.name;
    } else if (query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD) {
        comparisonMetricLabel = 'Previous Period';
    }

    return Array.from(dates).map((date) => ({
        date: new Date(date),
        segment: null,
        metric: {
            value: parseMetricValue(
                groupByMetricRows[date]?.[0]?.[metricId]?.value.raw,
            ),
            label: metric.label ?? metric.name,
        },
        compareMetric: {
            value: parseMetricValue(
                offsetGroupByCompareMetricRows[date]?.[0]?.[compareMetricId]
                    ?.value.raw,
            ),
            label: comparisonMetricLabel,
        },
    }));
};

/**
 * Get the date range for a given time interval, based on the current date and the time interval
 * Time grain Year: -> past 5 years (i.e. 5 completed years + this uncompleted year)
 * Time grain Month -> past 12 months (i.e. 12 completed months + this uncompleted month)
 * Time grain Week -> past 12 weeks (i.e. 12 completed weeks + this uncompleted week)
 * Time grain Day -> past 30 days (i.e. 30 completed days + this uncompleted day)
 * @param timeInterval - The time interval
 * @returns The date range
 */
export const getDefaultDateRangeFromInterval = (
    timeInterval: TimeFrames,
): MetricExplorerDateRange => {
    const now = dayjs();

    switch (timeInterval) {
        case TimeFrames.DAY:
            return [
                now.subtract(29, 'day').startOf('day').toDate(),
                now.toDate(),
            ];
        case TimeFrames.WEEK:
            return [
                now.subtract(11, 'week').startOf('week').toDate(),
                now.toDate(),
            ];
        case TimeFrames.MONTH:
            return [
                now.subtract(11, 'month').startOf('month').toDate(),
                now.toDate(),
            ];
        case TimeFrames.YEAR:
            return [
                now.subtract(4, 'year').startOf('year').toDate(),
                now.toDate(),
            ];
        default:
            return assertUnimplementedTimeframe(timeInterval);
    }
};

export const getDefaultDateRangeForMetricTotal = (
    timeFrame: TimeFrames,
): MetricExplorerDateRange => {
    const now = dayjs();

    switch (timeFrame) {
        case TimeFrames.DAY:
            return [now.startOf('day').toDate(), now.endOf('day').toDate()];
        case TimeFrames.WEEK:
            return [now.startOf('week').toDate(), now.endOf('week').toDate()];
        case TimeFrames.MONTH:
            return [now.startOf('month').toDate(), now.endOf('month').toDate()];
        case TimeFrames.YEAR:
            return [now.startOf('year').toDate(), now.endOf('year').toDate()];
        default:
            return assertUnimplementedTimeframe(timeFrame);
    }
};

/**
 * Default time interval to use when no time interval is provided.
 * For example, when there is no default time dimension defined for a metric or table.
 */
export const DEFAULT_METRICS_EXPLORER_TIME_INTERVAL = TimeFrames.MONTH;

export type TimeDimensionConfig = DefaultTimeDimension & { table: string };

export const getFirstAvailableTimeDimension = (
    metric: MetricWithAssociatedTimeDimension,
): TimeDimensionConfig | undefined => {
    if (
        metric.availableTimeDimensions &&
        metric.availableTimeDimensions.length > 0
    ) {
        return {
            table: metric.availableTimeDimensions[0].table,
            field: metric.availableTimeDimensions[0].name,
            interval: DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
        };
    }
    return undefined;
};

export const getDefaultTimeDimension = (
    metric: CompiledMetric,
    table?: CompiledTable,
): DefaultTimeDimension | undefined => {
    // Priority 1: Use metric-level default time dimension if defined in yml
    if (metric.defaultTimeDimension) {
        return metric.defaultTimeDimension;
    }

    // Priority 2: Use model-level default time dimension if defined in yml
    if (table?.defaultTimeDimension) {
        return table.defaultTimeDimension;
    }

    // Priority 3: Use the only time dimension if there's exactly one
    if (table?.dimensions) {
        const timeDimensions = Object.values(table.dimensions).filter(
            (dim) =>
                (dim.type === DimensionType.DATE ||
                    dim.type === DimensionType.TIMESTAMP) &&
                !!dim.isIntervalBase &&
                !dim.hidden,
        );
        if (timeDimensions.length === 1) {
            return {
                field: timeDimensions[0].name,
                interval: DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
            };
        }
    }

    return undefined;
};

export const getAvailableTimeDimensionsFromTables = (
    tables: Record<string, CompiledTable>,
): (CompiledDimension & {
    type: DimensionType.DATE | DimensionType.TIMESTAMP;
})[] =>
    Object.values(tables).flatMap((table) =>
        Object.values(table.dimensions).filter(
            (
                dim,
            ): dim is CompiledDimension & {
                type: DimensionType.DATE | DimensionType.TIMESTAMP;
            } =>
                (dim.type === DimensionType.DATE ||
                    dim.type === DimensionType.TIMESTAMP) &&
                !!dim.isIntervalBase &&
                !dim.hidden,
        ),
    );
